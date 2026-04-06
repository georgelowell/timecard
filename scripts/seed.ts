/**
 * Seed script: populates Firestore with facilities, taxonomy, and products.
 *
 * Run:        npx ts-node --project tsconfig.json scripts/seed.ts
 * Reset:      npx ts-node --project tsconfig.json scripts/seed.ts --reset
 * Clear only: npx ts-node --project tsconfig.json scripts/seed.ts --clear-only
 *             npx ts-node --project tsconfig.json scripts/seed.ts --clear
 *
 * --reset             clears taxonomy collections then re-seeds everything.
 * --clear / --clear-only  clears taxonomy collections and exits. No data is seeded.
 *               Facilities are never touched by any flag.
 * Requires FIREBASE_* env vars (loaded from .env.local).
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });

const db = getFirestore();
const RESET = process.argv.includes('--reset');
const CLEAR_ONLY = process.argv.includes('--clear-only') || process.argv.includes('--clear');

// ── Seed data ─────────────────────────────────────────────────────────────────

const FACILITIES = [
  { name: 'Facility A – Main Processing', location: '100 Industrial Blvd, Springfield', active: true },
  { name: 'Facility B – Packaging Plant', location: '200 Commerce Dr, Springfield', active: true },
];

// Category → Function (flat, 2 levels)
const TAXONOMY: { category: string; functions: string[] }[] = [
  {
    category: 'Cultivation',
    functions: [
      'Transplanting', 'Training & Topping', 'IPM Scouting', 'Watering & Feeding',
      'Hand Harvest', 'Machine Assist Harvest', 'Drying & Hang',
      'Hand Trim', 'Machine Trim', 'Trim Quality Check',
    ],
  },
  {
    category: 'Manufacturing',
    functions: [
      'Ethanol Extraction', 'CO2 Extraction', 'Winterization', 'Filtration',
      'Edible Production', 'Tincture Production', 'Topical Production',
      'Lab Sample Prep', 'Testing & Documentation', 'Batch Review',
    ],
  },
  {
    category: 'Packaging',
    functions: [
      'Pre-Roll Production', 'Pre-Roll QC', 'Pre-Roll Packaging',
      'Jar Fill', 'Bag Fill', 'Labeling', 'Seal & Pack',
      'Concentrate Fill', 'Cartridge Fill', 'Cartridge QC',
    ],
  },
  {
    category: 'Distribution',
    functions: [
      'Order Picking', 'Manifest Preparation', 'Route Loading', 'Delivery',
      'Inventory Count', 'METRC Compliance', 'Stock Rotation',
    ],
  },
  {
    category: 'Administration',
    functions: [
      'METRC Data Entry', 'License Compliance', 'Audit Preparation',
      'Maintenance', 'Cleaning & Sanitation', 'Equipment Repair',
      'Staff Training', 'Scheduling', 'Reporting',
    ],
  },
];

// Product name → function names it uses
const PRODUCTS: { name: string; description: string; functions: string[] }[] = [
  {
    name: 'Quicks',
    description: 'Standard pre-roll product',
    functions: ['Pre-Roll Production', 'Pre-Roll QC', 'Pre-Roll Packaging', 'Labeling'],
  },
  {
    name: '35s',
    description: 'Large-format pre-roll product',
    functions: ['Pre-Roll Production', 'Pre-Roll QC', 'Pre-Roll Packaging', 'Labeling'],
  },
  {
    name: 'Live Resin Cartridge',
    description: 'Vape cartridge with live resin concentrate',
    functions: ['Cartridge Fill', 'Cartridge QC', 'Concentrate Fill'],
  },
  {
    name: 'Flower Eighths',
    description: 'Packaged flower in 3.5g jars',
    functions: ['Jar Fill', 'Labeling', 'Seal & Pack'],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function deleteCollection(name: string) {
  const snap = await db.collection(name).get();
  if (snap.empty) return;
  // Delete in batches of 400 to stay under Firestore limits
  const chunks: typeof snap.docs[] = [];
  for (let i = 0; i < snap.docs.length; i += 400) {
    chunks.push(snap.docs.slice(i, i + 400));
  }
  for (const chunk of chunks) {
    const batch = db.batch();
    chunk.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  console.log(`  Cleared ${snap.size} docs from '${name}'`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  if (CLEAR_ONLY) {
    console.log('Clearing taxonomy data...');
    await deleteCollection('categories');
    await deleteCollection('subcategories'); // legacy — clean up if present
    await deleteCollection('functions');
    await deleteCollection('products');
    console.log('\nDone. Taxonomy is empty.');
    return;
  }

  console.log('Starting seed...\n');

  if (RESET) {
    console.log('Resetting collections...');
    await deleteCollection('categories');
    await deleteCollection('subcategories'); // legacy — clean up if present
    await deleteCollection('functions');
    await deleteCollection('products');
    console.log('Reset complete.\n');
  }

  // Facilities
  const existingFacilities = await db.collection('facilities').limit(1).get();
  if (existingFacilities.empty) {
    console.log('Seeding facilities...');
    for (const facility of FACILITIES) {
      const ref = await db.collection('facilities').add(facility);
      console.log(`  ${facility.name} (${ref.id})`);
    }
  } else {
    console.log('Facilities already exist — skipping.');
  }

  // Taxonomy
  console.log('\nSeeding taxonomy...');
  const now = new Date().toISOString();

  // functionName → Firestore ID (needed to resolve product assignments)
  const functionIdMap = new Map<string, string>();

  let catOrder = 0;
  for (const entry of TAXONOMY) {
    const catRef = await db.collection('categories').add({
      name: entry.category,
      order: catOrder++,
      active: true,
    });
    console.log(`  Category: ${entry.category} (${catRef.id})`);

    let fnOrder = 0;
    for (const fnName of entry.functions) {
      const fnRef = await db.collection('functions').add({
        name: fnName,
        categoryId: catRef.id,
        active: true,
        order: fnOrder++,
        createdAt: now,
        updatedAt: now,
      });
      functionIdMap.set(fnName, fnRef.id);
      console.log(`    Function: ${fnName} (${fnRef.id})`);
    }
  }

  // Products
  console.log('\nSeeding products...');
  for (const product of PRODUCTS) {
    const functionIds = product.functions
      .map(name => functionIdMap.get(name))
      .filter(Boolean) as string[];

    const ref = await db.collection('products').add({
      name: product.name,
      description: product.description,
      active: true,
      functionIds,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`  ${product.name} → [${product.functions.join(', ')}] (${ref.id})`);
  }

  console.log('\nSeed complete!');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
