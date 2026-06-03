export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

// GET — list all staffing workers (active and inactive)
export async function GET(_request: NextRequest) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  try {
    const snap = await adminDb.collection('staffingWorkers').orderBy('name').get();
    const workers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ workers });
  } catch (err) {
    console.error('[GET /api/staffing/workers]', err);
    return NextResponse.json({ error: 'Failed to load workers' }, { status: 500 });
  }
}

// POST — create a new staffing worker
export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth('manager');
  if (error) return error;

  try {
    const { name } = await request.json() as { name: string };

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const docRef = await adminDb.collection('staffingWorkers').add({
      name: name.trim(),
      createdBy: session!.user.id,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    const doc = await docRef.get();
    return NextResponse.json({ worker: { id: doc.id, ...doc.data() } }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/staffing/workers]', err);
    return NextResponse.json({ error: 'Failed to create worker' }, { status: 500 });
  }
}
