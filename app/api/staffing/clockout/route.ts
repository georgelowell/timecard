export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { fromETLocal } from '@/lib/tz';
import { Allocation } from '@/types';

// POST — clock out a single staffing worker with allocations
export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth('manager');
  if (error) return error;

  try {
    const { timecardId, clockOutTime, allocations } = await request.json() as {
      timecardId: string;
      clockOutTime: string;
      allocations: Allocation[];
    };

    if (!timecardId) {
      return NextResponse.json({ error: 'timecardId is required' }, { status: 400 });
    }
    if (!clockOutTime) {
      return NextResponse.json({ error: 'clockOutTime is required' }, { status: 400 });
    }
    if (!allocations?.length) {
      return NextResponse.json({ error: 'allocations are required' }, { status: 400 });
    }

    const total = allocations.reduce((sum, a) => sum + a.percentage, 0);
    if (Math.abs(total - 100) > 0.5) {
      return NextResponse.json({ error: 'Allocations must sum to 100%' }, { status: 400 });
    }

    // Parse the clock-out time
    let utcCheckOut: string;
    if (clockOutTime.includes('T') && !clockOutTime.endsWith('Z') && !clockOutTime.includes('+')) {
      utcCheckOut = fromETLocal(clockOutTime);
    } else {
      utcCheckOut = new Date(clockOutTime).toISOString();
    }

    const timecardRef = adminDb.collection('timecards').doc(timecardId);
    const timecardDoc = await timecardRef.get();

    if (!timecardDoc.exists) {
      return NextResponse.json({ error: 'Timecard not found' }, { status: 404 });
    }

    const timecard = timecardDoc.data()!;

    if (timecard.status !== 'checked-in') {
      return NextResponse.json({ error: 'Timecard is not checked in' }, { status: 409 });
    }

    if (!timecard.isStaffingWorker) {
      return NextResponse.json({ error: 'Not a staffing worker timecard' }, { status: 400 });
    }

    const checkInTime = new Date(timecard.checkInTime).getTime();
    const checkOutMs = new Date(utcCheckOut).getTime();

    if (checkOutMs <= checkInTime) {
      return NextResponse.json({ error: 'Clock-out time must be after clock-in time' }, { status: 400 });
    }

    const totalHours = Math.round(((checkOutMs - checkInTime) / 3600000) * 100) / 100;

    await timecardRef.update({
      checkOutTime: utcCheckOut,
      totalHours,
      status: 'checked-out',
      allocations,
    });

    return NextResponse.json({ success: true, totalHours, checkOutTime: utcCheckOut });
  } catch (err) {
    console.error('[POST /api/staffing/clockout]', err);
    return NextResponse.json({ error: 'Failed to clock out worker' }, { status: 500 });
  }
}
