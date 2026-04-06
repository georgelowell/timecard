export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

const DOC = () => adminDb.collection('settings').doc('notifications');

export async function GET() {
  const { error } = await requireAuth('admin');
  if (error) return error;

  const snap = await DOC().get();
  const managerEmails: string[] = snap.exists ? (snap.data()?.managerEmails ?? []) : [];

  return NextResponse.json({ managerEmails });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAuth('admin');
  if (error) return error;

  const { managerEmails } = await request.json() as { managerEmails: string[] };

  if (!Array.isArray(managerEmails)) {
    return NextResponse.json({ error: 'managerEmails must be an array' }, { status: 400 });
  }

  // Normalise: lowercase, deduplicate, remove blanks
  const cleaned = [...new Set(managerEmails.map(e => e.trim().toLowerCase()).filter(Boolean))];

  await DOC().set({ managerEmails: cleaned }, { merge: true });

  return NextResponse.json({ success: true, managerEmails: cleaned });
}
