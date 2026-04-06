export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { Allocation, RecentFunction } from '@/types';

export async function GET() {
  try {
    const { session, error } = await requireAuth();
    if (error) return NextResponse.json({ recent: [], lastShift: null }, { status: 401 });

    // Fetch last 10 completed timecards
    const snapshot = await adminDb
      .collection('timecards')
      .where('employeeId', '==', session!.user.id)
      .where('status', '==', 'checked-out')
      .orderBy('checkInTime', 'desc')
      .limit(10)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ recent: [], lastShift: null });
    }

    // Fetch all functions and categories for name lookups
    const [fnSnap, catSnap] = await Promise.all([
      adminDb.collection('functions').get(),
      adminDb.collection('categories').get(),
    ]);

    const categoryMap = new Map<string, string>();
    for (const doc of catSnap.docs) {
      categoryMap.set(doc.id, doc.data().name as string);
    }

    const fnCategoryMap = new Map<string, string>();
    for (const doc of fnSnap.docs) {
      fnCategoryMap.set(doc.id, doc.data().categoryId as string);
    }

    const getCategoryName = (functionId: string): string => {
      const catId = fnCategoryMap.get(functionId);
      return catId ? (categoryMap.get(catId) ?? '') : '';
    };

    // Most recent shift allocations — used for "Same as last time"
    const firstDoc = snapshot.docs[0];
    const firstAllocations = (firstDoc.data().allocations ?? []) as Allocation[];
    const lastShift = firstAllocations.length > 0
      ? firstAllocations.map(a => ({
          functionId: a.functionId,
          functionName: a.functionName,
          percentage: a.percentage,
        }))
      : null;

    // Build unique recent function list with per-function metadata
    // The first occurrence of each function (most recent shift) determines lastUsedPercentage + lastShiftDate
    const seen = new Set<string>();
    const recent: RecentFunction[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const allocations = (data.allocations ?? []) as Allocation[];
      const shiftDate = data.checkInTime as string;

      for (const alloc of allocations) {
        if (!seen.has(alloc.functionId)) {
          seen.add(alloc.functionId);
          recent.push({
            functionId: alloc.functionId,
            functionName: alloc.functionName,
            categoryName: getCategoryName(alloc.functionId),
            lastUsedPercentage: alloc.percentage,
            lastShiftDate: shiftDate,
          });
          if (recent.length >= 10) break;
        }
      }
      if (recent.length >= 10) break;
    }

    return NextResponse.json({ recent, lastShift });
  } catch {
    return NextResponse.json({ recent: [], lastShift: null }, { status: 500 });
  }
}
