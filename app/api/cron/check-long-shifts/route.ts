export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { sendLongShiftEmail } from '@/lib/email';

const THRESHOLD_HOURS = 12;

// GET — called by Cloud Scheduler; secured by x-cron-secret header.
// Finds all checked-in shifts older than 12 hours and emails managers.
export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const thresholdISO = new Date(
    Date.now() - THRESHOLD_HOURS * 60 * 60 * 1000,
  ).toISOString();

  // Query all open shifts that have been going for over 12 hours
  const snap = await adminDb
    .collection('timecards')
    .where('status', '==', 'checked-in')
    .where('checkInTime', '<=', thresholdISO)
    .get();

  if (snap.empty) {
    return NextResponse.json({ sent: 0 });
  }

  // Filter out those that already received an alert
  const needsAlert = snap.docs.filter(d => !d.data().sentLongShiftAlert);

  if (needsAlert.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  // Fetch employee records
  const employeeIds = [...new Set(needsAlert.map(d => d.data().employeeId as string))];
  const userDocs = await adminDb.getAll(
    ...employeeIds.map(id => adminDb.collection('users').doc(id)),
  );
  const usersMap = new Map(userDocs.map(d => [d.id, d.data()]));

  const appUrl = process.env.NEXTAUTH_URL || 'https://localhost:3000';
  let sent = 0;

  await Promise.all(
    needsAlert.map(async doc => {
      const tc = doc.data();
      const user = usersMap.get(tc.employeeId);
      const hoursElapsed =
        (Date.now() - new Date(tc.checkInTime).getTime()) / 3600000;

      try {
        await sendLongShiftEmail({
          employeeName: user?.name || tc.employeeId,
          employeeEmail: user?.email || '',
          checkInTime: tc.checkInTime,
          hoursElapsed,
          employeeId: tc.employeeId,
          appUrl,
        });

        await doc.ref.update({ sentLongShiftAlert: true });
        sent++;
      } catch (err) {
        console.error(`Failed to send long-shift alert for ${doc.id}:`, err);
      }
    }),
  );

  return NextResponse.json({ sent });
}
