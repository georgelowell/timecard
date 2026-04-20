export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { sendLeaveRequestEmail } from '@/lib/email';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const { type, dates } = body;

    if (!type || !Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (type !== 'pto' && type !== 'sick') {
      return NextResponse.json({ error: 'Invalid leave type' }, { status: 400 });
    }

    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
    for (const d of dates) {
      if (!d.date || !d.hours) {
        return NextResponse.json({ error: 'Each date must have a date and hours' }, { status: 400 });
      }
      if (d.hours < 1 || d.hours > 8) {
        return NextResponse.json({ error: 'Hours per day must be between 1 and 8' }, { status: 400 });
      }
      const [y, m, day] = (d.date as string).split('-').map(Number);
      if (new Date(y, m - 1, day) < cutoff) {
        return NextResponse.json(
          { error: 'Dates cannot be more than 7 days in the past' },
          { status: 400 },
        );
      }
    }

    const totalHours: number = dates.reduce((s: number, d: { hours: number }) => s + d.hours, 0);

    const userSnap = await adminDb.collection('users').doc(session!.user.id).get();
    const userData = userSnap.data();
    if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const year = new Date().getFullYear();
    const balanceDocId = `${session!.user.id}_${year}`;
    const balanceRef = adminDb.collection('leaveBalances').doc(balanceDocId);
    let balanceSnap = await balanceRef.get();

    let balance: { ptoUsed: number; ptoTotal: number; sickUsed: number; sickTotal: number };
    if (!balanceSnap.exists) {
      const defaultData = {
        employeeId: session!.user.id,
        year,
        ptoTotal: 40,
        ptoUsed: 0,
        ptoAdjustments: [],
        sickTotal: 40,
        sickUsed: 0,
        sickAdjustments: [],
        updatedAt: new Date().toISOString(),
      };
      await balanceRef.set(defaultData);
      balance = defaultData;
    } else {
      balance = balanceSnap.data() as { ptoUsed: number; ptoTotal: number; sickUsed: number; sickTotal: number };
    }

    const used = type === 'pto' ? (balance.ptoUsed ?? 0) : (balance.sickUsed ?? 0);
    const total = type === 'pto' ? (balance.ptoTotal ?? 40) : (balance.sickTotal ?? 40);
    const remaining = total - used;

    if (totalHours > remaining) {
      return NextResponse.json(
        {
          error: `Requested ${totalHours}h exceeds your remaining ${type === 'pto' ? 'PTO' : 'sick time'} balance of ${remaining}h`,
        },
        { status: 400 },
      );
    }

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
      new Date(),
    );
    const isRetroactive = dates.some((d: { date: string }) => d.date < todayStr);

    const now = new Date().toISOString();
    const requestData = {
      employeeId: session!.user.id,
      employeeName: userData.name ?? '',
      employeeEmail: userData.email ?? '',
      type,
      dates,
      totalHours,
      status: 'pending',
      submittedAt: now,
      reviewedBy: '',
      reviewedAt: '',
      denialReason: '',
      isRetroactive,
    };

    const docRef = await adminDb.collection('leaveRequests').add(requestData);

    const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
    try {
      await sendLeaveRequestEmail({
        employeeName: userData.name ?? '',
        employeeEmail: userData.email ?? '',
        type,
        dates,
        totalHours,
        remaining,
        requestId: docRef.id,
        appUrl,
      });
    } catch (emailErr) {
      console.error('[leave/request] Email send failed:', emailErr);
    }

    return NextResponse.json({ id: docRef.id, success: true });
  } catch (err) {
    console.error('[leave/request POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
