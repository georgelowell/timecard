export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';

function balanceDocId(employeeId: string, year: number): string {
  return `${employeeId}_${year}`;
}

const DEFAULT_BALANCE = { ptoTotal: 40, ptoUsed: 0, sickTotal: 40, sickUsed: 0 };

async function getOrCreateBalance(employeeId: string, year: number) {
  const docId = balanceDocId(employeeId, year);
  const ref = adminDb.collection('leaveBalances').doc(docId);
  const snap = await ref.get();

  if (snap.exists) {
    return { id: snap.id, ...snap.data() };
  }

  const now = new Date().toISOString();
  const data = {
    employeeId,
    year,
    ...DEFAULT_BALANCE,
    ptoAdjustments: [],
    sickAdjustments: [],
    updatedAt: now,
  };
  await ref.set(data);
  return { id: docId, ...data };
}

export async function GET(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const reqEmployeeId = searchParams.get('employeeId');
  const all = searchParams.get('all') === 'true';
  const year = new Date().getFullYear();

  const isManager =
    session!.user.role === 'manager' || session!.user.role === 'admin';

  if (all) {
    if (!isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const usersSnap = await adminDb
      .collection('users')
      .where('active', '==', true)
      .get();

    const balances = await Promise.all(
      usersSnap.docs.map(async d => {
        const user = d.data();
        const balance = await getOrCreateBalance(d.id, year);
        return { ...balance, employeeName: user.name, employeeEmail: user.email };
      }),
    );

    return NextResponse.json({ balances });
  }

  let targetEmployeeId = session!.user.id;
  if (reqEmployeeId) {
    if (!isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    targetEmployeeId = reqEmployeeId;
  }

  try {
    const balance = await getOrCreateBalance(targetEmployeeId, year);
    return NextResponse.json({ balance });
  } catch (err) {
    console.error('[leave/balance GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { session, error } = await requireAuth('manager');
  if (error) return error;

  try {
    const body = await request.json();
    const { employeeId, type, adjustment, reason } = body;

    if (!employeeId || !type || adjustment === undefined || !reason?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (type !== 'pto' && type !== 'sick') {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const year = new Date().getFullYear();
    const docId = balanceDocId(employeeId, year);
    const ref = adminDb.collection('leaveBalances').doc(docId);
    let snap = await ref.get();

    if (!snap.exists) {
      await ref.set({
        employeeId,
        year,
        ...DEFAULT_BALANCE,
        ptoAdjustments: [],
        sickAdjustments: [],
        updatedAt: new Date().toISOString(),
      });
      snap = await ref.get();
    }

    const data = snap.data()!;
    const now = new Date().toISOString();
    const entry = {
      amount: adjustment,
      reason: reason.trim(),
      adjustedBy: session!.user.email || session!.user.id,
      adjustedAt: now,
    };

    if (type === 'pto') {
      const newTotal = (data.ptoTotal ?? 40) + adjustment;
      if (newTotal < 0)
        return NextResponse.json(
          { error: 'Adjustment would result in negative total' },
          { status: 400 },
        );
      await ref.update({
        ptoTotal: newTotal,
        ptoAdjustments: [...(data.ptoAdjustments ?? []), entry],
        updatedAt: now,
      });
    } else {
      const newTotal = (data.sickTotal ?? 40) + adjustment;
      if (newTotal < 0)
        return NextResponse.json(
          { error: 'Adjustment would result in negative total' },
          { status: 400 },
        );
      await ref.update({
        sickTotal: newTotal,
        sickAdjustments: [...(data.sickAdjustments ?? []), entry],
        updatedAt: now,
      });
    }

    const updated = await ref.get();
    return NextResponse.json({ balance: { id: docId, ...updated.data() } });
  } catch (err) {
    console.error('[leave/balance PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
