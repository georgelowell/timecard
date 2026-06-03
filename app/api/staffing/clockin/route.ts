export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { fromETLocal } from '@/lib/tz';

// POST — clock in one or more staffing workers
export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth('manager');
  if (error) return error;

  try {
    const { workerIds, facilityId, clockInTime } = await request.json() as {
      workerIds: string[];
      facilityId: string;
      clockInTime: string; // ISO string in ET or YYYY-MM-DDTHH:mm in ET
    };

    if (!workerIds?.length) {
      return NextResponse.json({ error: 'workerIds array is required' }, { status: 400 });
    }
    if (workerIds.length > 4) {
      return NextResponse.json({ error: 'Maximum 4 workers at a time' }, { status: 400 });
    }
    if (!facilityId) {
      return NextResponse.json({ error: 'facilityId is required' }, { status: 400 });
    }
    if (!clockInTime) {
      return NextResponse.json({ error: 'clockInTime is required' }, { status: 400 });
    }

    // Parse the clock-in time — if it's a datetime-local string (no TZ), treat as ET
    let utcCheckIn: string;
    if (clockInTime.includes('T') && !clockInTime.endsWith('Z') && !clockInTime.includes('+')) {
      // It's an ET datetime-local string like "2026-06-03T09:30"
      utcCheckIn = fromETLocal(clockInTime);
    } else {
      // Already an ISO string
      utcCheckIn = new Date(clockInTime).toISOString();
    }

    // Validate the clock-in time is not more than 4 hours in the past or in the future
    const now = Date.now();
    const checkInMs = new Date(utcCheckIn).getTime();
    const fourHoursMs = 4 * 60 * 60 * 1000;
    if (checkInMs > now) {
      return NextResponse.json({ error: 'Clock-in time cannot be in the future' }, { status: 400 });
    }
    if (now - checkInMs > fourHoursMs) {
      return NextResponse.json({ error: 'Clock-in time cannot be more than 4 hours in the past' }, { status: 400 });
    }

    // Load workers to verify they exist and are active
    const workerDocs = await adminDb.getAll(
      ...workerIds.map(id => adminDb.collection('staffingWorkers').doc(id))
    );
    const workers = workerDocs
      .filter(d => d.exists)
      .map(d => ({ id: d.id, ...d.data() } as { id: string; name: string; active: boolean }));

    if (workers.length !== workerIds.length) {
      return NextResponse.json({ error: 'One or more workers not found' }, { status: 404 });
    }

    const inactiveWorkers = workers.filter(w => !w.active);
    if (inactiveWorkers.length > 0) {
      return NextResponse.json({ error: `Inactive workers: ${inactiveWorkers.map(w => w.name).join(', ')}` }, { status: 400 });
    }

    // Check for already-clocked-in workers
    const alreadyClockedInSnap = await adminDb
      .collection('timecards')
      .where('staffingWorkerId', 'in', workerIds)
      .where('status', '==', 'checked-in')
      .get();

    if (!alreadyClockedInSnap.empty) {
      const clockedInIds = new Set(alreadyClockedInSnap.docs.map(d => d.data().staffingWorkerId));
      const clockedInNames = workers.filter(w => clockedInIds.has(w.id)).map(w => w.name);
      if (clockedInNames.length > 0) {
        return NextResponse.json(
          { error: `Already clocked in: ${clockedInNames.join(', ')}` },
          { status: 409 }
        );
      }
    }

    // Get facility name
    const facilityDoc = await adminDb.collection('facilities').doc(facilityId).get();
    const facilityName = facilityDoc.exists ? facilityDoc.data()!.name : 'Unknown';

    // Get manager name
    const managerDoc = await adminDb.collection('users').doc(session!.user.id).get();
    const managerName = managerDoc.exists ? managerDoc.data()!.name : session!.user.name || 'Manager';

    const nowISO = new Date().toISOString();

    // Create one timecard per worker
    const batch = adminDb.batch();
    const results: { workerId: string; timecardId: string }[] = [];

    for (const worker of workers) {
      const timecardRef = adminDb.collection('timecards').doc();
      batch.set(timecardRef, {
        employeeId: worker.id,
        employeeName: worker.name,
        facilityId,
        facilityName,
        checkInTime: utcCheckIn,
        remote: false,
        status: 'checked-in',
        createdAt: nowISO,
        isStaffingWorker: true,
        staffingWorkerId: worker.id,
        staffingWorkerName: worker.name,
        loggedBy: session!.user.id,
        loggedByName: managerName,
      });
      results.push({ workerId: worker.id, timecardId: timecardRef.id });
    }

    await batch.commit();

    return NextResponse.json({ success: true, timecards: results }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/staffing/clockin]', err);
    return NextResponse.json({ error: 'Failed to clock in workers' }, { status: 500 });
  }
}
