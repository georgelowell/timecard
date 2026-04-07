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

// POST — manager manually creates a completed timecard for an employee
export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth('manager');
  if (error) return error;

  const body = await request.json();
  const { employeeId, facilityId, checkInTimeET, checkOutTimeET, createNote, allocations } = body;

  if (!employeeId || !facilityId || !checkInTimeET || !checkOutTimeET || !createNote?.trim()) {
    return NextResponse.json(
      { error: 'employeeId, facilityId, checkInTimeET, checkOutTimeET, and createNote are required' },
      { status: 400 },
    );
  }

  const checkInUTC  = fromETLocal(checkInTimeET);
  const checkOutUTC = fromETLocal(checkOutTimeET);

  if (new Date(checkOutUTC) <= new Date(checkInUTC)) {
    return NextResponse.json({ error: 'Clock-out must be after clock-in' }, { status: 400 });
  }

  const totalHours =
    Math.round(
      ((new Date(checkOutUTC).getTime() - new Date(checkInUTC).getTime()) / 3600000) * 100,
    ) / 100;

  const now = new Date().toISOString();

  const timecardData: Record<string, unknown> = {
    employeeId,
    facilityId,
    checkInTime:  checkInUTC,
    checkOutTime: checkOutUTC,
    totalHours,
    remote: false,
    status: 'checked-out',
    manualEntry: true,
    manualEntryNote: createNote.trim(),
    createdAt: now,
    editedBy: session!.user.name || session!.user.email || session!.user.id,
    editedAt: now,
    editNote: createNote.trim(),
  };

  if (Array.isArray(allocations) && allocations.length > 0) {
    timecardData.allocations = allocations;
  }

  const docRef = await adminDb.collection('timecards').add(timecardData);
  return NextResponse.json({ success: true, id: docRef.id });
}
