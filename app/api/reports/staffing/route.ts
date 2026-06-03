export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

function toETDate(isoString: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(isoString));
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

export async function GET(request: NextRequest) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  try {
    const { searchParams } = request.nextUrl;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const facilityId = searchParams.get('facilityId');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    // Build ordered list of calendar days
    const days: string[] = [];
    const cursor = new Date(startDate + 'T12:00:00');
    const endMs = new Date(endDate + 'T12:00:00').getTime();
    while (cursor.getTime() <= endMs) {
      days.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const endISO = endDate + 'T23:59:59Z';

    // Query completed and open staffing timecards
    let completedQ = adminDb.collection('timecards')
      .where('isStaffingWorker', '==', true)
      .where('status', '==', 'checked-out')
      .where('checkInTime', '>=', startDate)
      .where('checkInTime', '<=', endISO) as FirebaseFirestore.Query;

    let openQ = adminDb.collection('timecards')
      .where('isStaffingWorker', '==', true)
      .where('status', '==', 'checked-in')
      .where('checkInTime', '>=', startDate)
      .where('checkInTime', '<=', endISO) as FirebaseFirestore.Query;

    if (facilityId) {
      completedQ = completedQ.where('facilityId', '==', facilityId);
      openQ = openQ.where('facilityId', '==', facilityId);
    }

    const [completedSnap, openSnap] = await Promise.all([
      completedQ.limit(2000).get(),
      openQ.limit(200).get(),
    ]);

    type DayEntry = { hours: number; hasOpenShift: boolean };
    type WorkerEntry = {
      id: string;
      name: string;
      loggedBy: string;
      loggedByName: string;
      dayMap: Map<string, DayEntry>;
    };
    const workerMap = new Map<string, WorkerEntry>();

    const nowMs = Date.now();

    for (const doc of completedSnap.docs) {
      const tc = doc.data();
      const workerId = tc.staffingWorkerId as string;
      if (!workerMap.has(workerId)) {
        workerMap.set(workerId, {
          id: workerId,
          name: (tc.staffingWorkerName as string) || workerId,
          loggedBy: (tc.loggedBy as string) || '',
          loggedByName: (tc.loggedByName as string) || '',
          dayMap: new Map(),
        });
      }
      const entry = workerMap.get(workerId)!;
      const date = toETDate(tc.checkInTime);
      const existing = entry.dayMap.get(date) ?? { hours: 0, hasOpenShift: false };
      existing.hours += tc.totalHours || 0;
      entry.dayMap.set(date, existing);
    }

    for (const doc of openSnap.docs) {
      const tc = doc.data();
      const workerId = tc.staffingWorkerId as string;
      if (!workerMap.has(workerId)) {
        workerMap.set(workerId, {
          id: workerId,
          name: (tc.staffingWorkerName as string) || workerId,
          loggedBy: (tc.loggedBy as string) || '',
          loggedByName: (tc.loggedByName as string) || '',
          dayMap: new Map(),
        });
      }
      const entry = workerMap.get(workerId)!;
      const date = toETDate(tc.checkInTime);
      const partialHours = Math.round(
        ((nowMs - new Date(tc.checkInTime).getTime()) / 3600000) * 100
      ) / 100;
      const existing = entry.dayMap.get(date) ?? { hours: 0, hasOpenShift: false };
      existing.hours += partialHours;
      existing.hasOpenShift = true;
      entry.dayMap.set(date, existing);
    }

    const workers = Array.from(workerMap.values())
      .sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)))
      .map(worker => {
        const dayEntries = days.map(date => {
          const entry = worker.dayMap.get(date);
          return {
            date,
            hours: entry ? Math.round(entry.hours * 100) / 100 : 0,
            hasOpenShift: entry?.hasOpenShift ?? false,
          };
        });
        const totalHours = Math.round(dayEntries.reduce((s, d) => s + d.hours, 0) * 100) / 100;
        return {
          id: worker.id,
          name: worker.name,
          totalHours,
          loggedBy: worker.loggedBy,
          loggedByName: worker.loggedByName,
          hasOpenShift: dayEntries.some(d => d.hasOpenShift),
          days: dayEntries,
        };
      });

    return NextResponse.json({ startDate, endDate, workers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('requires an index')) {
      const urlMatch = message.match(/https:\/\/\S+/);
      console.error('[staffing reports GET] Missing Firestore index. Create it at:', urlMatch?.[0] ?? '(no URL in error)');
    }
    console.error('[staffing reports GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
