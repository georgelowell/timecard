export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

// PATCH — update a staffing worker (name or active status)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  const { id } = await params;

  try {
    const { name, active } = await request.json() as { name?: string; active?: boolean };

    const docRef = adminDb.collection('staffingWorkers').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (name !== undefined) updates.name = name.trim();
    if (active !== undefined) updates.active = active;

    await docRef.update(updates);

    const updated = await docRef.get();
    return NextResponse.json({ worker: { id: updated.id, ...updated.data() } });
  } catch (err) {
    console.error('[PATCH /api/staffing/workers/[id]]', err);
    return NextResponse.json({ error: 'Failed to update worker' }, { status: 500 });
  }
}

// DELETE — soft delete (set active: false)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  const { id } = await params;

  try {
    const docRef = adminDb.collection('staffingWorkers').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    await docRef.update({ active: false, updatedAt: new Date().toISOString() });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/staffing/workers/[id]]', err);
    return NextResponse.json({ error: 'Failed to delete worker' }, { status: 500 });
  }
}
