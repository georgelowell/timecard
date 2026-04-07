export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

// GET — lightweight employee list for manager-level dropdowns
// Returns only active users, sorted by name. Requires manager role (not admin-only).
export async function GET() {
  const { error } = await requireAuth('manager');
  if (error) return error;

  const snap = await adminDb.collection('users').orderBy('name').get();
  const employees = snap.docs
    .map(d => ({ id: d.id, ...(d.data() as { name: string; email: string; active?: boolean }) }))
    .filter(u => u.active !== false)
    .map(u => ({ id: u.id, name: u.name, email: u.email }));

  return NextResponse.json({ employees });
}
