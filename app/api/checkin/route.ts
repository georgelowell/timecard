export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { sendRemoteCheckInEmail } from '@/lib/email';
import { isTodayET } from '@/lib/tz';
import { Timecard, GeoLocation } from '@/types';

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { facilityId, remote, checkInLocation } = await request.json() as {
    facilityId: string;
    remote: boolean;
    checkInLocation?: GeoLocation | null;
  };

  if (!facilityId) {
    return NextResponse.json({ error: 'facilityId is required' }, { status: 400 });
  }

  // Check if already checked in (today or any previous unclosed shift)
  const existing = await adminDb
    .collection('timecards')
    .where('employeeId', '==', session!.user.id)
    .where('status', 'in', ['checked-in', 'pending-approval'])
    .limit(1)
    .get();

  if (!existing.empty) {
    return NextResponse.json({ error: 'Already checked in' }, { status: 409 });
  }

  const facilityDoc = await adminDb.collection('facilities').doc(facilityId).get();
  if (!facilityDoc.exists) {
    return NextResponse.json({ error: 'Facility not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const status = remote ? 'pending-approval' : 'checked-in';

  const timecardData: Omit<Timecard, 'id'> = {
    employeeId: session!.user.id,
    facilityId,
    checkInTime: now,
    remote: !!remote,
    status,
    createdAt: now,
    ...(checkInLocation ? { checkInLocation } : {}),
  };

  const docRef = await adminDb.collection('timecards').add(timecardData);

  if (remote) {
    const appUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin;
    try {
      await sendRemoteCheckInEmail({
        employeeName: session!.user.name || session!.user.email || 'Employee',
        employeeEmail: session!.user.email || '',
        timestamp: now,
        timecardId: docRef.id,
        appUrl,
        location: checkInLocation ?? null,
      });
    } catch (err) {
      console.error('Failed to send remote check-in email:', err);
    }
  }

  return NextResponse.json({ timecardId: docRef.id, status });
}

// GET — check current status, detect previous-day open shifts and last checkout
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    // Look for any open shift (checked-in or pending-approval)
    const openSnap = await adminDb
      .collection('timecards')
      .where('employeeId', '==', session!.user.id)
      .where('status', 'in', ['checked-in', 'pending-approval'])
      .limit(1)
      .get();

    if (!openSnap.empty) {
      const doc = openSnap.docs[0];
      const timecard = { id: doc.id, ...doc.data() } as Timecard;

      if (isTodayET(timecard.checkInTime)) {
        // Normal: active shift started today
        return NextResponse.json({ checkedIn: true, timecard });
      } else {
        // Open shift from a PREVIOUS day — employee forgot to clock out
        return NextResponse.json({
          checkedIn: false,
          openShiftFromPreviousDay: timecard,
        });
      }
    }

    // No open shift — check if they already completed a shift today (Feature 3)
    const lastCheckoutSnap = await adminDb
      .collection('timecards')
      .where('employeeId', '==', session!.user.id)
      .where('status', '==', 'checked-out')
      .orderBy('checkOutTime', 'desc')
      .limit(1)
      .get();

    if (!lastCheckoutSnap.empty) {
      const doc = lastCheckoutSnap.docs[0];
      const data = doc.data();
      return NextResponse.json({
        checkedIn: false,
        lastCheckout: {
          id: doc.id,
          checkOutTime: data.checkOutTime as string,
          checkInTime: data.checkInTime as string,
        },
      });
    }

    return NextResponse.json({ checkedIn: false });
  } catch (err) {
    console.error('[GET /api/checkin]', err);
    return NextResponse.json(
      { error: 'Failed to load status', checkedIn: false },
      { status: 500 },
    );
  }
}
