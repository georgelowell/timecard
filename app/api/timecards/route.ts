export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { fromETLocal } from '@/lib/tz';
import { Timecard } from '@/types';

export async function GET(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const employeeId = searchParams.get('employeeId');
  const facilityId = searchParams.get('facilityId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const status = searchParams.get('status');
  const limitParam = parseInt(searchParams.get('limit') || '200', 10);

  const isManager = session!.user.role === 'manager' || session!.user.role === 'admin';

  let query = adminDb.collection('timecards') as FirebaseFirestore.Query;

  if (!isManager) {
    query = query.where('employeeId', '==', session!.user.id);
  } else if (employeeId) {
    query = query.where('employeeId', '==', employeeId);
  }

  if (facilityId) {
    query = query.where('facilityId', '==', facilityId);
  }
  if (status) {
    query = query.where('status', '==', status);
  }
  if (startDate) {
    query = query.where('checkInTime', '>=', startDate);
  }
  if (endDate) {
    query = query.where('checkInTime', '<=', endDate + 'T23:59:59Z');
  }

  query = query.orderBy('checkInTime', 'desc').limit(Math.min(limitParam, 500));

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

  const timecards = snapshot.docs.map(doc => {
    const data = doc.data() as Omit<Timecard, 'id'>;
    const user = usersMap.get(data.employeeId);
    const facility = facilitiesMap.get(data.facilityId);
    return {
      id: doc.id,
      ...data,
      employeeName: user?.name || '',
      employeeEmail: user?.email || '',
      facilityName: facility?.name || '',
    };
  });

  return NextResponse.json({ timecards });
}

// PATCH — manager edits a timecard with ET→UTC conversion
export async function PATCH(request: NextRequest) {
  const { session, error } = await requireAuth('manager');
  if (error) return error;

  const body = await request.json();
  const { id, checkInTimeET, checkOutTimeET, editNote, allocations } = body;

  if (!id || !editNote?.trim()) {
    return NextResponse.json({ error: 'id and editNote are required' }, { status: 400 });
  }

  const checkInUTC = fromETLocal(checkInTimeET);
  const checkOutUTC = checkOutTimeET ? fromETLocal(checkOutTimeET) : undefined;
  const totalHours = checkOutUTC
    ? Math.round(
        ((new Date(checkOutUTC).getTime() - new Date(checkInUTC).getTime()) / 3600000) * 100
      ) / 100
    : undefined;

  const updates: Record<string, unknown> = {
    checkInTime: checkInUTC,
    editedBy: session!.user.name || session!.user.email || session!.user.id,
    editedAt: new Date().toISOString(),
    editNote: editNote.trim(),
  };

  if (checkOutUTC) {
    updates.checkOutTime = checkOutUTC;
    updates.status = 'checked-out';
    updates.totalHours = totalHours;
  }

  if (Array.isArray(allocations) && allocations.length > 0) {
    updates.allocations = allocations;
    updates.allocationsEdited = true;
  }

  await adminDb.collection('timecards').doc(id).update(updates);

  return NextResponse.json({ success: true });
}

// DELETE — manager permanently removes a timecard
export async function DELETE(request: NextRequest) {
  const { session, error } = await requireAuth('manager');
  if (error) return error;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  await adminDb.collection('timecards').doc(id).delete();

  return NextResponse.json({ success: true });
}

// POST — legacy manager create/edit (kept for backward compat)
export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth('manager');
  if (error) return error;

  const body = await request.json();
  const now = new Date().toISOString();

  if (body.id) {
    const ref = adminDb.collection('timecards').doc(body.id);
    await ref.update({
      ...body,
      editedBy: session!.user.id,
      editedAt: now,
      editNote: body.editNote || '',
    });
    return NextResponse.json({ success: true, id: body.id });
  }

  const docRef = await adminDb.collection('timecards').add({
    ...body,
    createdAt: now,
    editedBy: session!.user.id,
    editedAt: now,
    editNote: body.editNote || 'Manually created by manager',
  });

  return NextResponse.json({ success: true, id: docRef.id });
}
