export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { fromETLocal } from '@/lib/tz';
import { Timecard } from '@/types';

// POST — employee self-reports a missed clock-in for a shift they already clocked out of.
// Receives: facilityId, checkInTimeET ("YYYY-MM-DDTHH:mm"), linkedCheckoutTimecardId
export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { facilityId, checkInTimeET, linkedCheckoutTimecardId } = await request.json() as {
    facilityId: string;
    checkInTimeET: string;
    linkedCheckoutTimecardId: string;
  };

  if (!facilityId || !checkInTimeET || !linkedCheckoutTimecardId) {
    return NextResponse.json(
      { error: 'facilityId, checkInTimeET, and linkedCheckoutTimecardId are required' },
      { status: 400 },
    );
  }

  // Fetch the existing checkout timecard to get checkOutTime
  const checkoutRef = adminDb.collection('timecards').doc(linkedCheckoutTimecardId);
  const checkoutDoc = await checkoutRef.get();

  if (!checkoutDoc.exists) {
    return NextResponse.json({ error: 'Linked timecard not found' }, { status: 404 });
  }

  const checkout = checkoutDoc.data()!;

  if (checkout.employeeId !== session!.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (checkout.status !== 'checked-out' || !checkout.checkOutTime) {
    return NextResponse.json({ error: 'Linked timecard is not checked out' }, { status: 409 });
  }

  const checkInUTC = fromETLocal(checkInTimeET);
  const checkOutUTC = checkout.checkOutTime as string;

  if (new Date(checkInUTC) >= new Date(checkOutUTC)) {
    return NextResponse.json(
      { error: 'Clock-in time must be before clock-out time' },
      { status: 400 },
    );
  }

  const totalHours =
    Math.round(
      ((new Date(checkOutUTC).getTime() - new Date(checkInUTC).getTime()) / 3600000) * 100,
    ) / 100;

  const now = new Date().toISOString();

  const timecardData: Omit<Timecard, 'id'> = {
    employeeId: session!.user.id,
    facilityId,
    checkInTime: checkInUTC,
    checkOutTime: checkOutUTC,
    totalHours,
    remote: false,
    status: 'checked-out',
    createdAt: now,
    manualEntry: true,
    manualEntryNote: 'Employee self-reported missed clock-in',
    allocations: checkout.allocations || [],
  };

  const docRef = await adminDb.collection('timecards').add(timecardData);

  return NextResponse.json({ success: true, timecardId: docRef.id });
}
