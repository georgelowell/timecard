import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { cert } from 'firebase-admin/app';

let _app: App | null = null;
let _db: Firestore | null = null;

function getApp(): App {
  if (_app) return _app;
  if (getApps().length > 0) {
    _app = getApps()[0];
    return _app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin credentials in environment variables');
  }

  _app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
  return _app;
}

export function getAdminDb(): Firestore {
  if (_db) return _db;
  getApp(); // ensure initialized
  _db = getFirestore();
  return _db;
}

// Proxy that lazily initializes on first property access
export const adminDb = new Proxy({} as Firestore, {
  get(_target, prop) {
    const db = getAdminDb();
    const value = (db as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? value.bind(db) : value;
  },
});
