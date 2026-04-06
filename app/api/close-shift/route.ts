export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { fromETLocal } from '@/lib/tz';

// POST — employee closes an open shift from a previous day (forgot to clock out).
// Receives: timecardId, checkOutTimeET ("YYYY-MM-DDTHH:mm")
export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { timecardId, checkOutTimeET } = await request.json() as {
    timecardId: string;
    checkOutTimeET: string;
  };

  if (!timecardId || !checkOutTimeET) {
    return NextResponse.json(
      { error: 'timecardId and checkOutTimeET are required' },
      { status: 400 },
    );
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
    return NextResponse.json({ error: 'Shift already closed' }, { status: 409 });
  }

  const checkInUTC = timecard.checkInTime as string;
  const checkOutUTC = fromETLocal(checkOutTimeET);

  if (new Date(checkOutUTC) <= new Date(checkInUTC)) {
    return NextResponse.json(
      { error: 'Clock-out time must be after clock-in time' },
      { status: 400 },
    );
  }

  const totalHours =
    Math.round(
      ((new Date(checkOutUTC).getTime() - new Date(checkInUTC).getTime()) / 3600000) * 100,
    ) / 100;

  await timecardRef.update({
    checkOutTime: checkOutUTC,
    totalHours,
    status: 'checked-out',
    manualEntry: true,
    manualEntryNote: 'Employee self-reported missed clock-out',
  });

  return NextResponse.json({ success: true, totalHours });
}
