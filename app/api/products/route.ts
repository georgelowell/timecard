export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const snapshot = await adminDb.collection('products').orderBy('createdAt', 'desc').get();
  const products = snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter((p: any) => p.active !== false);
  return NextResponse.json({ products });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  const body = await request.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const docRef = await adminDb.collection('products').add({
    name: body.name.trim(),
    description: body.description?.trim() || '',
    active: true,
    functionIds: body.functionIds || [],
    createdAt: now,
    updatedAt: now,
  });
  return NextResponse.json({ id: docRef.id });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  const { id, ...updates } = await request.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await adminDb.collection('products').doc(id).update({
    ...updates,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ success: true });
}
