export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const snapshot = await adminDb.collection('functions').orderBy('order').get();
  const functions = snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter((f: any) => f.active !== false);
  return NextResponse.json({ functions });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  const body = await request.json();
  const now = new Date().toISOString();

  // Get max order within the category — query without orderBy to avoid composite index requirement
  const existing = await adminDb
    .collection('functions')
    .where('categoryId', '==', body.categoryId)
    .get();
  const maxOrder = existing.docs.reduce((m, d) => Math.max(m, d.data().order ?? -1), -1);
  const nextOrder = maxOrder + 1;

  const docRef = await adminDb.collection('functions').add({
    name: body.name,
    categoryId: body.categoryId,
    active: true,
    order: nextOrder,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id: docRef.id });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  const { id, ...updates } = await request.json();
  await adminDb.collection('functions').doc(id).update({
    ...updates,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  const { id } = await request.json();
  // Soft delete
  await adminDb.collection('functions').doc(id).update({ active: false });
  return NextResponse.json({ success: true });
}
