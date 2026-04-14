export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

/** Returns 'YYYY-MM-DD' in ET for an ISO timestamp. */
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

    // Build ordered list of every calendar day in the range.
    const days: string[] = [];
    const cursor = new Date(startDate + 'T12:00:00');
    const endMs = new Date(endDate + 'T12:00:00').getTime();
    while (cursor.getTime() <= endMs) {
      days.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const endISO = endDate + 'T23:59:59Z';

    // Query completed shifts and open (checked-in) shifts separately.
    let completedQ = adminDb.collection('timecards')
      .where('status', '==', 'checked-out')
      .where('checkInTime', '>=', startDate)
      .where('checkInTime', '<=', endISO) as FirebaseFirestore.Query;

    let openQ = adminDb.collection('timecards')
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

    // Fetch user records for all employees found.
    const allDocs = [...completedSnap.docs, ...openSnap.docs];
    const userIds = [...new Set(allDocs.map(d => d.data().employeeId))];
    const usersSnap = userIds.length > 0
      ? await adminDb.getAll(...userIds.map(id => adminDb.collection('users').doc(id)))
      : [];
    const usersMap = new Map(usersSnap.map(d => [d.id, d.data()]));

    type DayEntry = { hours: number; hasOpenShift: boolean };
    type EmpEntry = { id: string; name: string; email: string; dayMap: Map<string, DayEntry> };
    const empMap = new Map<string, EmpEntry>();

    const nowMs = Date.now();

    for (const doc of completedSnap.docs) {
      const tc = doc.data();
      if (!empMap.has(tc.employeeId)) {
        const user = usersMap.get(tc.employeeId);
        empMap.set(tc.employeeId, {
          id: tc.employeeId,
          name: user?.name || tc.employeeId,
          email: user?.email || '',
          dayMap: new Map(),
        });
      }
      const emp = empMap.get(tc.employeeId)!;
      const date = toETDate(tc.checkInTime);
      const existing = emp.dayMap.get(date) ?? { hours: 0, hasOpenShift: false };
      existing.hours += tc.totalHours || 0;
      emp.dayMap.set(date, existing);
    }

    for (const doc of openSnap.docs) {
      const tc = doc.data();
      if (!empMap.has(tc.employeeId)) {
        const user = usersMap.get(tc.employeeId);
        empMap.set(tc.employeeId, {
          id: tc.employeeId,
          name: user?.name || tc.employeeId,
          email: user?.email || '',
          dayMap: new Map(),
        });
      }
      const emp = empMap.get(tc.employeeId)!;
      const date = toETDate(tc.checkInTime);
      // Partial hours for the still-open shift.
      const partialHours = Math.round(
        ((nowMs - new Date(tc.checkInTime).getTime()) / 3600000) * 100
      ) / 100;
      const existing = emp.dayMap.get(date) ?? { hours: 0, hasOpenShift: false };
      existing.hours += partialHours;
      existing.hasOpenShift = true;
      emp.dayMap.set(date, existing);
    }

    const employees = Array.from(empMap.values())
      .sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)))
      .map(emp => {
        const dayEntries = days.map(date => {
          const entry = emp.dayMap.get(date);
          return {
            date,
            hours: entry ? Math.round(entry.hours * 100) / 100 : 0,
            hasOpenShift: entry?.hasOpenShift ?? false,
          };
        });
        return {
          id: emp.id,
          name: emp.name,
          email: emp.email,
          totalHours: Math.round(dayEntries.reduce((s, d) => s + d.hours, 0) * 100) / 100,
          hasOpenShift: dayEntries.some(d => d.hasOpenShift),
          days: dayEntries,
        };
      });

    return NextResponse.json({ startDate, endDate, employees });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('requires an index')) {
      const urlMatch = message.match(/https:\/\/\S+/);
      console.error('[reports GET] Missing Firestore index. Create it at:', urlMatch?.[0] ?? '(no URL in error)');
    }
    console.error('[reports GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
