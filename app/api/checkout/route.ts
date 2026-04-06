export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { Allocation, GeoLocation } from '@/types';

// POST — clock out immediately (allocations saved later via PATCH)
export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { timecardId, checkOutLocation } = await request.json() as {
    timecardId: string;
    checkOutLocation?: GeoLocation | null;
  };

  if (!timecardId) {
    return NextResponse.json({ error: 'timecardId is required' }, { status: 400 });
  }

  const timecardRef = adminDb.collection('timecards').doc(timecardId);
  const timecardDoc = await timecardRef.get();

  if (!timecardDoc.exists) {
    return NextResponse.json({ error: 'Timecard not found' }, { status: 404 });
  }

  const timecard = timecardDoc.data()!;

  if (timecard.employeeId !== session!.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (timecard.status === 'checked-out') {
    return NextResponse.json({ error: 'Already checked out' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const checkInTime = new Date(timecard.checkInTime);
  const checkOutTime = new Date(now);
  const totalHours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

  // Flag if the employee was still pending approval at checkout time
  const remotePendingAtCheckout = timecard.status === 'pending-approval';

  await timecardRef.update({
    checkOutTime: now,
    totalHours: Math.round(totalHours * 100) / 100,
    status: 'checked-out',
    ...(checkOutLocation ? { checkOutLocation } : {}),
    ...(remotePendingAtCheckout ? { remotePendingAtCheckout: true } : {}),
  });

  return NextResponse.json({
    success: true,
    totalHours: Math.round(totalHours * 100) / 100,
    checkOutTime: now,
  });
}

// PATCH — save allocations (and optionally location) to an already-checked-out timecard
export async function PATCH(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { timecardId, allocations, checkOutLocation } = await request.json() as {
    timecardId: string;
    allocations: Allocation[];
    checkOutLocation?: GeoLocation | null;
  };

  if (!timecardId || !allocations?.length) {
    return NextResponse.json({ error: 'timecardId and allocations are required' }, { status: 400 });
  }

  const total = allocations.reduce((sum, a) => sum + a.percentage, 0);
  if (Math.abs(total - 100) > 0.5) {
    return NextResponse.json({ error: 'Allocations must sum to 100%' }, { status: 400 });
  }

  const timecardRef = adminDb.collection('timecards').doc(timecardId);
  const timecardDoc = await timecardRef.get();

  if (!timecardDoc.exists) {
    return NextResponse.json({ error: 'Timecard not found' }, { status: 404 });
  }

  const timecard = timecardDoc.data()!;

  if (timecard.employeeId !== session!.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (timecard.status !== 'checked-out') {
    return NextResponse.json({ error: 'Timecard is not checked out' }, { status: 409 });
  }

  await timecardRef.update({
    allocations,
    ...(checkOutLocation ? { checkOutLocation } : {}),
  });

  return NextResponse.json({ success: true });
}
