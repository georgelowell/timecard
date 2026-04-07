export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { etDateStr } from '@/lib/tz';
import { Timecard, Allocation } from '@/types';

interface FunctionRow { name: string; totalHours: number; }
interface CategoryRow { name: string; totalHours: number; percentage: number; }
interface EmployeeRow { employeeId: string; employeeName: string; totalHours: number; topFunction: string; shifts: number; }
interface DayRow { date: string; totalHours: number; }

function eachDateInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T12:00:00Z'); // noon UTC avoids DST edge-cases
  const last = new Date(end + 'T12:00:00Z');
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export async function GET(request: NextRequest) {
  const { error } = await requireAuth('manager');
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const startDate  = searchParams.get('startDate');
  const endDate    = searchParams.get('endDate');
  const facilityId = searchParams.get('facilityId') || '';
  const employeeId = searchParams.get('employeeId') || '';

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  try {
    // Build Firestore query — status filter first to use the collection index
    let query = adminDb.collection('timecards')
      .where('status', '==', 'checked-out')
      .where('checkInTime', '>=', startDate)
      .where('checkInTime', '<=', endDate + 'T23:59:59Z') as FirebaseFirestore.Query;

    if (facilityId) query = query.where('facilityId', '==', facilityId);
    if (employeeId) query = query.where('employeeId', '==', employeeId);

    const snap = await query.get();
    const timecards = snap.docs.map(d => ({ id: d.id, ...d.data() } as Timecard & { id: string }));

    if (timecards.length === 0) {
      return NextResponse.json({ empty: true });
    }

    // Resolve employee names
    const uniqueEmployeeIds = [...new Set(timecards.map(tc => tc.employeeId))];
    const employeeDocs = uniqueEmployeeIds.length > 0
      ? await adminDb.getAll(...uniqueEmployeeIds.map(id => adminDb.collection('users').doc(id)))
      : [];
    const employeeNames = new Map(employeeDocs.map(d => [d.id, (d.data()?.name as string) || d.id]));

    // Resolve category names from functions
    const functionIds = new Set<string>();
    for (const tc of timecards) {
      for (const alloc of (tc.allocations as Allocation[] | undefined) ?? []) {
        functionIds.add(alloc.functionId);
      }
    }

    // Get function→category mapping
    const fnCategoryMap = new Map<string, string>(); // functionId -> categoryId
    const fnNameMap = new Map<string, string>();       // functionId -> functionName
    if (functionIds.size > 0) {
      const fnDocs = await adminDb.getAll(
        ...[...functionIds].map(id => adminDb.collection('functions').doc(id))
      );
      const categoryIds = new Set<string>();
      for (const d of fnDocs) {
        if (d.exists) {
          const data = d.data()!;
          fnCategoryMap.set(d.id, data.categoryId as string);
          fnNameMap.set(d.id, data.name as string);
          categoryIds.add(data.categoryId as string);
        }
      }

      if (categoryIds.size > 0) {
        const catDocs = await adminDb.getAll(
          ...[...categoryIds].map(id => adminDb.collection('categories').doc(id))
        );
        const catNameMap = new Map(catDocs.map(d => [d.id, (d.data()?.name as string) || d.id]));
        // Replace categoryId with categoryName in fnCategoryMap
        for (const [fnId, catId] of fnCategoryMap) {
          fnCategoryMap.set(fnId, catNameMap.get(catId) || catId);
        }
      }
    }

    // ── 1. Summary ──────────────────────────────────────────────────────────
    const totalHours = Math.round(
      timecards.reduce((s, tc) => s + (tc.totalHours || 0), 0) * 100
    ) / 100;
    const totalShifts = timecards.length;
    const avgShiftLength = totalShifts > 0
      ? Math.round((totalHours / totalShifts) * 100) / 100
      : 0;
    const uniqueEmployees = uniqueEmployeeIds.length;

    // ── 2. Hours by Function ─────────────────────────────────────────────────
    const fnHoursMap = new Map<string, number>();
    for (const tc of timecards) {
      for (const alloc of (tc.allocations as Allocation[] | undefined) ?? []) {
        const h = (tc.totalHours || 0) * (alloc.percentage / 100);
        fnHoursMap.set(alloc.functionName, (fnHoursMap.get(alloc.functionName) || 0) + h);
      }
    }
    const hoursByFunction: FunctionRow[] = [...fnHoursMap.entries()]
      .map(([name, totalHours]) => ({ name, totalHours: Math.round(totalHours * 100) / 100 }))
      .sort((a, b) => b.totalHours - a.totalHours);

    // ── 3. Hours by Category ─────────────────────────────────────────────────
    const catHoursMap = new Map<string, number>();
    for (const tc of timecards) {
      for (const alloc of (tc.allocations as Allocation[] | undefined) ?? []) {
        const catName = fnCategoryMap.get(alloc.functionId) || 'Uncategorized';
        const h = (tc.totalHours || 0) * (alloc.percentage / 100);
        catHoursMap.set(catName, (catHoursMap.get(catName) || 0) + h);
      }
    }
    const catTotalHours = [...catHoursMap.values()].reduce((s, h) => s + h, 0);
    const hoursByCategory: CategoryRow[] = [...catHoursMap.entries()]
      .map(([name, h]) => ({
        name,
        totalHours: Math.round(h * 100) / 100,
        percentage: catTotalHours > 0 ? Math.round((h / catTotalHours) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    // ── 4. Employee Breakdown ────────────────────────────────────────────────
    const empMap = new Map<string, { hours: number; shifts: number; fnHours: Map<string, number> }>();
    for (const tc of timecards) {
      const existing = empMap.get(tc.employeeId);
      const fnHours = existing?.fnHours ?? new Map<string, number>();
      for (const alloc of (tc.allocations as Allocation[] | undefined) ?? []) {
        fnHours.set(alloc.functionName, (fnHours.get(alloc.functionName) || 0) + (tc.totalHours || 0) * (alloc.percentage / 100));
      }
      empMap.set(tc.employeeId, {
        hours: (existing?.hours ?? 0) + (tc.totalHours || 0),
        shifts: (existing?.shifts ?? 0) + 1,
        fnHours,
      });
    }
    const employeeBreakdown: EmployeeRow[] = [...empMap.entries()]
      .map(([empId, data]) => {
        const topFn = [...data.fnHours.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
          employeeId: empId,
          employeeName: employeeNames.get(empId) || empId,
          totalHours: Math.round(data.hours * 100) / 100,
          topFunction: topFn ? topFn[0] : '—',
          shifts: data.shifts,
        };
      })
      .sort((a, b) => b.totalHours - a.totalHours);

    // ── 5. Daily Hours Trend ─────────────────────────────────────────────────
    const dayMap = new Map<string, number>();
    for (const tc of timecards) {
      const d = etDateStr(tc.checkInTime);
      dayMap.set(d, (dayMap.get(d) || 0) + (tc.totalHours || 0));
    }
    const allDates = eachDateInRange(startDate, endDate);
    const dailyHours: DayRow[] = allDates.map(date => ({
      date,
      totalHours: Math.round((dayMap.get(date) || 0) * 100) / 100,
    }));

    return NextResponse.json({
      empty: false,
      summary: { totalHours, totalShifts, avgShiftLength, uniqueEmployees },
      hoursByFunction,
      hoursByCategory,
      employeeBreakdown,
      dailyHours,
    });
  } catch (err) {
    console.error('[GET /api/analytics]', err);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
