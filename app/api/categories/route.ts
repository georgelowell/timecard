export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const snapshot = await adminDb.collection('categories').orderBy('order').get();
  const categories = snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter((c: any) => c.active !== false);
  return NextResponse.json({ categories });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  const { name } = await request.json();
  const existing = await adminDb.collection('categories').orderBy('order', 'desc').limit(1).get();
  const nextOrder = existing.empty ? 0 : (existing.docs[0].data().order || 0) + 1;

  const docRef = await adminDb.collection('categories').add({ name, order: nextOrder, active: true });
  return NextResponse.json({ id: docRef.id });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  const { id, ...updates } = await request.json();
  await adminDb.collection('categories').doc(id).update(updates);
  return NextResponse.json({ success: true });
}
