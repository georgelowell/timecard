export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { sendLeaveApprovedEmail, sendLeaveDeniedEmail } from '@/lib/email';

type Action = 'approved' | 'denied';

async function applyReview(
  requestId: string,
  action: Action,
  reviewerName: string,
  denialReason?: string,
) {
  const reqRef = adminDb.collection('leaveRequests').doc(requestId);
  const reqSnap = await reqRef.get();

  if (!reqSnap.exists) throw new Error('Leave request not found');

  const req = reqSnap.data()!;
  if (req.status !== 'pending') throw new Error(`Request is already ${req.status}`);

  const now = new Date().toISOString();
  const year = new Date().getFullYear();
  const balanceDocId = `${req.employeeId}_${year}`;
  const balanceRef = adminDb.collection('leaveBalances').doc(balanceDocId);

  if (action === 'approved') {
    await reqRef.update({ status: 'approved', reviewedBy: reviewerName, reviewedAt: now });

    const bSnap = await balanceRef.get();
    const bData = bSnap.exists
      ? bSnap.data()!
      : { ptoUsed: 0, ptoTotal: 40, sickUsed: 0, sickTotal: 40 };

    if (!bSnap.exists) {
      await balanceRef.set({
        ...bData,
        employeeId: req.employeeId,
        year,
        ptoAdjustments: [],
        sickAdjustments: [],
        updatedAt: now,
      });
    }

    if (req.type === 'pto') {
      await balanceRef.update({ ptoUsed: (bData.ptoUsed ?? 0) + req.totalHours, updatedAt: now });
    } else {
      await balanceRef.update({
        sickUsed: (bData.sickUsed ?? 0) + req.totalHours,
        updatedAt: now,
      });
    }

    const updatedB = (await balanceRef.get()).data()!;
    const remaining =
      req.type === 'pto'
        ? (updatedB.ptoTotal ?? 40) - (updatedB.ptoUsed ?? 0)
        : (updatedB.sickTotal ?? 40) - (updatedB.sickUsed ?? 0);

    try {
      await sendLeaveApprovedEmail({
        employeeEmail: req.employeeEmail,
        employeeName: req.employeeName,
        type: req.type,
        dates: req.dates,
        totalHours: req.totalHours,
        remainingBalance: remaining,
      });
    } catch (e) {
      console.error('[leave/review] Approval email failed:', e);
    }
  } else {
    await reqRef.update({
      status: 'denied',
      reviewedBy: reviewerName,
      reviewedAt: now,
      denialReason: denialReason ?? '',
    });

    const bSnap = await balanceRef.get();
    const bData = bSnap.data() ?? { ptoTotal: 40, ptoUsed: 0, sickTotal: 40, sickUsed: 0 };
    const remaining =
      req.type === 'pto'
        ? (bData.ptoTotal ?? 40) - (bData.ptoUsed ?? 0)
        : (bData.sickTotal ?? 40) - (bData.sickUsed ?? 0);

    try {
      await sendLeaveDeniedEmail({
        employeeEmail: req.employeeEmail,
        employeeName: req.employeeName,
        type: req.type,
        dates: req.dates,
        denialReason: denialReason,
        remainingBalance: remaining,
      });
    } catch (e) {
      console.error('[leave/review] Denial email failed:', e);
    }
  }
}

// GET: one-click approve from email link
export async function GET(request: NextRequest) {
  const { session, error } = await requireAuth('manager');
  if (error) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(loginUrl);
  }

  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action');
  const id = searchParams.get('id');

  if (action !== 'approved' || !id) {
    return NextResponse.redirect(new URL('/dashboard/leave', request.url));
  }

  try {
    const reviewerName = (session!.user as { name?: string }).name ?? session!.user.email ?? '';
    await applyReview(id, 'approved', reviewerName);
    return NextResponse.redirect(new URL('/dashboard/leave?approved=1', request.url));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[leave/review GET]', msg);
    return NextResponse.redirect(
      new URL(`/dashboard/leave?error=${encodeURIComponent(msg)}`, request.url),
    );
  }
}

// POST: approve or deny from dashboard
export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth('manager');
  if (error) return error;

  try {
    const body = await request.json();
    const { requestId, action, denialReason } = body;

    if (!requestId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (action !== 'approved' && action !== 'denied') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const reviewerName = (session!.user as { name?: string }).name ?? session!.user.email ?? '';
    await applyReview(requestId, action, reviewerName, denialReason);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[leave/review POST]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
