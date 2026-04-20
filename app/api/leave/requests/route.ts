export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const statusFilter = searchParams.get('status');
  const employeeIdFilter = searchParams.get('employeeId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const isManager =
    session!.user.role === 'manager' || session!.user.role === 'admin';

  try {
    let query: FirebaseFirestore.Query = adminDb.collection('leaveRequests');

    if (!isManager) {
      query = query.where('employeeId', '==', session!.user.id);
    } else {
      if (employeeIdFilter) query = query.where('employeeId', '==', employeeIdFilter);
      if (statusFilter) query = query.where('status', '==', statusFilter);
    }

    const snap = await query.limit(500).get();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let requests: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Sort most-recent first in memory (avoids composite index requirement)
    requests.sort((a, b) => {
      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
    });

    // Date-range filter in memory
    if (startDate || endDate) {
      requests = requests.filter(r =>
        r.dates?.some((d: { date: string }) => {
          if (startDate && d.date < startDate) return false;
          if (endDate && d.date > endDate) return false;
          return true;
        }),
      );
    }

    return NextResponse.json({ requests });
  } catch (err) {
    console.error('[leave/requests GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
