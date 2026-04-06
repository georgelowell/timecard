export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  // Single facility lookup by document ID
  const id = request.nextUrl.searchParams.get('id');
  if (id) {
    const doc = await adminDb.collection('facilities').doc(id).get();
    if (!doc.exists || doc.data()?.active === false) {
      return NextResponse.json({ facility: null }, { status: 404 });
    }
    return NextResponse.json({ facility: { id: doc.id, ...doc.data() } });
  }

  // List all active facilities
  const snapshot = await adminDb.collection('facilities').where('active', '==', true).get();
  const facilities = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ facilities });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAuth('admin');
  if (error) return error;

  const body = await request.json();
  const docRef = await adminDb.collection('facilities').add({ ...body, active: true });
  return NextResponse.json({ id: docRef.id });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requireAuth('admin');
  if (error) return error;

  const { id, ...updates } = await request.json();
  await adminDb.collection('facilities').doc(id).update(updates);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { error } = await requireAuth('admin');
  if (error) return error;

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Guard: must always have at least one active facility
  const remaining = await adminDb.collection('facilities').where('active', '==', true).get();
  if (remaining.size <= 1) {
    return NextResponse.json(
      { error: 'Cannot delete the last facility. At least one must remain.' },
      { status: 409 }
    );
  }

  await adminDb.collection('facilities').doc(id).delete();
  return NextResponse.json({ success: true });
}
