export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/session';

// GET: approval link from email (also usable by managers)
export async function GET(request: NextRequest) {
  const timecardId = request.nextUrl.searchParams.get('timecardId');
  if (!timecardId) {
    return NextResponse.json({ error: 'timecardId is required' }, { status: 400 });
  }

  const { session, error } = await requireAuth('manager');
  if (error) {
    // Redirect to login with return URL if not authenticated
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(loginUrl);
  }

  const timecardRef = adminDb.collection('timecards').doc(timecardId);
  const doc = await timecardRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Timecard not found' }, { status: 404 });
  }

  if (doc.data()?.status !== 'pending-approval') {
    return NextResponse.redirect(new URL('/dashboard?approved=already', request.url));
  }

  await timecardRef.update({
    status: 'checked-in',
    approvedBy: session!.user.id,
  });

  return NextResponse.redirect(new URL('/dashboard?approved=true', request.url));
}

// POST: approve from dashboard
export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth('manager');
  if (error) return error;

  const { timecardId } = await request.json();

  const timecardRef = adminDb.collection('timecards').doc(timecardId);
  const doc = await timecardRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: 'Timecard not found' }, { status: 404 });
  }

  await timecardRef.update({
    status: 'checked-in',
    approvedBy: session!.user.id,
  });

  return NextResponse.json({ success: true });
}
