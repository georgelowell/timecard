export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  const { error } = await requireAuth('admin');
  if (error) return error;

  const [usersSnap, invitesSnap] = await Promise.all([
    adminDb.collection('users').orderBy('createdAt', 'desc').get(),
    adminDb.collection('user_invites').orderBy('createdAt', 'desc').get(),
  ]);

  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const invites = invitesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ users, invites });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAuth('admin');
  if (error) return error;

  const { email, role, facilityId } = await request.json();
  if (!email || !role) {
    return NextResponse.json({ error: 'email and role are required' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Prevent inviting someone already registered
  const existing = await adminDb.collection('users').where('email', '==', normalizedEmail).limit(1).get();
  if (!existing.empty) {
    return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 });
  }

  // Upsert invite (idempotent by email)
  await adminDb.collection('user_invites').doc(normalizedEmail).set({
    email: normalizedEmail,
    role,
    facilityId: facilityId || null,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requireAuth('admin');
  if (error) return error;

  const { id, ...updates } = await request.json();

  // Prevent demoting yourself
  const { session } = await requireAuth('admin');
  if (id === session!.user.id && updates.role && updates.role !== 'admin') {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
  }

  await adminDb.collection('users').doc(id).update(updates);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { error } = await requireAuth('admin');
  if (error) return error;

  const { email } = await request.json();
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

  await adminDb.collection('user_invites').doc(email.trim().toLowerCase()).delete();
  return NextResponse.json({ success: true });
}
