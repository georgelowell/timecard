export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

// GET — returns all staffing timecards with status 'checked-in'
export async function GET(_request: NextRequest) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  try {
    const snap = await adminDb
      .collection('timecards')
      .where('isStaffingWorker', '==', true)
      .where('status', '==', 'checked-in')
      .orderBy('checkInTime', 'desc')
      .limit(50)
      .get();

    const timecards = snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; facilityId: string; facilityName?: string; [key: string]: unknown }));

    // Resolve facility names if needed
    const facilityIds = [...new Set(timecards.map(tc => tc.facilityId))];
    const facilityDocs = facilityIds.length > 0
      ? await adminDb.getAll(...facilityIds.map(id => adminDb.collection('facilities').doc(id)))
      : [];
    const facilityNames = new Map(facilityDocs.map(d => [d.id, (d.data()?.name as string) || 'Unknown']));

    const enriched = timecards.map(tc => ({
      ...tc,
      facilityName: tc.facilityName || facilityNames.get(tc.facilityId) || 'Unknown',
    }));

    return NextResponse.json({ timecards: enriched });
  } catch (err) {
    console.error('[GET /api/staffing/active]', err);
    return NextResponse.json({ error: 'Failed to load active staffing shifts' }, { status: 500 });
  }
}
