export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { timecardId } = await request.json() as { timecardId: string };

  if (!timecardId) {
    return NextResponse.json({ error: 'timecardId is required' }, { status: 400 });
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

  if (timecard.status !== 'checked-out') {
    return NextResponse.json({ error: 'Timecard is not checked out' }, { status: 409 });
  }

  await timecardRef.update({
    status: 'checked-in',
    checkOutTime: FieldValue.delete(),
    totalHours: FieldValue.delete(),
    allocations: FieldValue.delete(),
    checkOutLocation: FieldValue.delete(),
  });

  return NextResponse.json({ success: true });
}
