export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { Timecard, Allocation } from '@/types';

function escapeCsv(val: string | number | undefined): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const employeeId = searchParams.get('employeeId');
  const facilityId = searchParams.get('facilityId');

  try {
    let query = adminDb
      .collection('timecards')
      .where('status', '==', 'checked-out') as FirebaseFirestore.Query;

    if (employeeId) query = query.where('employeeId', '==', employeeId);
    if (facilityId) query = query.where('facilityId', '==', facilityId);
    if (startDate) query = query.where('checkInTime', '>=', startDate);
    if (endDate) query = query.where('checkInTime', '<=', endDate + 'T23:59:59Z');

    // No .orderBy() — sort in memory to avoid composite index requirements.
    query = query.limit(1000);

    const snapshot = await query.get();

    const userIds = [...new Set(snapshot.docs.map(d => d.data().employeeId))];
    const facilityIds = [...new Set(snapshot.docs.map(d => d.data().facilityId))];

    const [usersSnap, facilitiesSnap] = await Promise.all([
      userIds.length > 0
        ? adminDb.getAll(...userIds.map(id => adminDb.collection('users').doc(id)))
        : Promise.resolve([]),
      facilityIds.length > 0
        ? adminDb.getAll(...facilityIds.map(id => adminDb.collection('facilities').doc(id)))
        : Promise.resolve([]),
    ]);

    const usersMap = new Map(usersSnap.map(d => [d.id, d.data()]));
    const facilitiesMap = new Map(facilitiesSnap.map(d => [d.id, d.data()]));

    const docs = [...snapshot.docs].sort((a, b) =>
      b.data().checkInTime.localeCompare(a.data().checkInTime)
    );

    const rows: string[] = [
      ['Date', 'Employee Name', 'Employee Email', 'Facility', 'Check In', 'Check Out',
        'Total Hours', 'Remote', 'Function', 'Percentage'].join(','),
    ];

    for (const doc of docs) {
      const tc = doc.data() as Timecard;
      const user = usersMap.get(tc.employeeId);
      const facility = facilitiesMap.get(tc.facilityId);
      const date = new Date(tc.checkInTime).toLocaleDateString('en-US');
      const checkIn = new Date(tc.checkInTime).toLocaleTimeString('en-US');
      const checkOut = tc.checkOutTime ? new Date(tc.checkOutTime).toLocaleTimeString('en-US') : '';

      if (tc.allocations && tc.allocations.length > 0) {
        for (const alloc of tc.allocations as Allocation[]) {
          rows.push([
            escapeCsv(date),
            escapeCsv(user?.name),
            escapeCsv(user?.email),
            escapeCsv(facility?.name),
            escapeCsv(checkIn),
            escapeCsv(checkOut),
            escapeCsv(tc.totalHours),
            escapeCsv(tc.remote ? 'Yes' : 'No'),
            escapeCsv(alloc.functionName),
            escapeCsv(alloc.percentage),
          ].join(','));
        }
      } else {
        rows.push([
          escapeCsv(date),
          escapeCsv(user?.name),
          escapeCsv(user?.email),
          escapeCsv(facility?.name),
          escapeCsv(checkIn),
          escapeCsv(checkOut),
          escapeCsv(tc.totalHours),
          escapeCsv(tc.remote ? 'Yes' : 'No'),
          '',
          '',
        ].join(','));
      }
    }

    const csv = rows.join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="timecards-export.csv"',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('requires an index')) {
      const urlMatch = message.match(/https:\/\/\S+/);
      console.error('[export GET] Missing Firestore index. Create it at:', urlMatch?.[0] ?? '(no URL in error)');
    }
    console.error('[export GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
