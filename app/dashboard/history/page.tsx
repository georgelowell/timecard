'use client';

import { useState, useEffect } from 'react';
import { Timecard } from '@/types';

// ── Display helpers (Intl only, no library) ──────────────────────────────────

function toETDateStr(isoString: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
    new Date(isoString),
  );
}

function formatDayLabel(dateStr: string): string {
  // dateStr is "YYYY-MM-DD"
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const todayStr  = toETDateStr(new Date().toISOString());
  const yesterdayDate = new Date(Date.now() - 86400000);
  const yestStr   = toETDateStr(yesterdayDate.toISOString());
  if (dateStr === todayStr)  return 'Today';
  if (dateStr === yestStr)   return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).format(date);
}

function formatTimeET(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
  }).format(new Date(isoString));
}

// ── Data builders ────────────────────────────────────────────────────────────

interface DaySummary {
  dateStr: string;   // "YYYY-MM-DD" in ET
  totalHours: number;
  shifts: CompletedShift[];
}

interface CompletedShift {
  id: string;
  checkInTime: string;
  checkOutTime: string;
  totalHours: number;
  facilityName?: string;
  remote: boolean;
  manualEntry?: boolean;
  allocations?: { functionName: string; percentage: number }[];
}

function buildDays(timecards: Timecard[]): DaySummary[] {
  const dayMap = new Map<string, DaySummary>();

  for (const tc of timecards) {
    if (tc.status !== 'checked-out' || !tc.checkOutTime) continue;
    const dateStr = toETDateStr(tc.checkInTime);
    if (!dayMap.has(dateStr)) {
      dayMap.set(dateStr, { dateStr, totalHours: 0, shifts: [] });
    }
    const day = dayMap.get(dateStr)!;
    const shift: CompletedShift = {
      id: tc.id,
      checkInTime: tc.checkInTime,
      checkOutTime: tc.checkOutTime,
      totalHours: tc.totalHours ?? 0,
      facilityName: tc.facilityName,
      remote: tc.remote,
      manualEntry: tc.manualEntry,
      allocations: tc.allocations,
    };
    day.shifts.push(shift);
    day.totalHours += tc.totalHours ?? 0;
  }

  // Sort days newest-first; sort shifts within a day newest-first
  return [...dayMap.values()]
    .sort((a, b) => b.dateStr.localeCompare(a.dateStr))
    .map(day => ({
      ...day,
      totalHours: Math.round(day.totalHours * 100) / 100,
      shifts: day.shifts.sort(
        (a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime(),
      ),
    }));
}

// ── Components ───────────────────────────────────────────────────────────────

function ShiftRow({ shift }: { shift: CompletedShift }) {
  const [expanded, setExpanded] = useState(false);
  const hasAllocations = shift.allocations && shift.allocations.length > 0;

  return (
    <div className="border-t border-tan/30 first:border-t-0">
      <button
        onClick={() => hasAllocations && setExpanded(e => !e)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          hasAllocations ? 'hover:bg-off-white' : ''
        }`}
      >
        {/* Time range */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-body text-near-black">
            <span className="font-mono">{formatTimeET(shift.checkInTime)}</span>
            <span className="text-sage mx-1.5">→</span>
            <span className="font-mono">{formatTimeET(shift.checkOutTime)}</span>
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {shift.facilityName && (
              <p className="text-xs text-sage font-body">{shift.facilityName}</p>
            )}
            {shift.remote && (
              <span className="text-xs px-1.5 py-0.5 bg-tan/30 text-warm-brown rounded font-display font-bold">Remote</span>
            )}
            {shift.manualEntry && (
              <span className="text-xs px-1.5 py-0.5 bg-off-white border border-tan text-sage rounded font-display font-bold">Manual</span>
            )}
          </div>
        </div>

        {/* Hours */}
        <span className="font-mono font-bold text-warm-brown text-sm flex-shrink-0">
          {shift.totalHours.toFixed(2)}h
        </span>

        {/* Expand chevron if allocations exist */}
        {hasAllocations && (
          <svg
            className={`w-4 h-4 text-sage flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Allocation breakdown */}
      {expanded && hasAllocations && (
        <div className="px-4 pb-3 bg-off-white border-t border-tan/20">
          <p className="text-xs font-display font-bold text-sage uppercase tracking-widest pt-2.5 mb-2">
            Time allocation
          </p>
          <div className="space-y-1.5">
            {shift.allocations!.map((alloc, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 bg-tan/30 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full"
                    style={{ width: `${alloc.percentage}%`, backgroundColor: 'var(--color-warm-brown)' }}
                  />
                </div>
                <span className="text-xs font-body text-near-black w-36 truncate">{alloc.functionName}</span>
                <span className="text-xs font-mono text-warm-brown font-bold w-10 text-right">{Math.round(alloc.percentage)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30; // days per page

export default function HistoryPage() {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch('/api/timecards?limit=500')
      .then(r => r.json())
      .then(data => {
        setDays(buildDays(data.timecards || []));
        setLoading(false);
      });
  }, []);

  // Total hours across all completed shifts
  const totalHours = Math.round(days.reduce((s, d) => s + d.totalHours, 0) * 100) / 100;

  const totalPages = Math.ceil(days.length / PAGE_SIZE);
  const pageDays   = days.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-black text-near-black">My hours</h1>
        {!loading && days.length > 0 && (
          <p className="text-sm text-sage font-body">
            <span className="font-mono font-bold text-warm-brown text-base">{totalHours}h</span>
            {' '}total
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
          </div>
        ) : days.length === 0 ? (
          <p className="px-4 py-8 text-center text-sage text-sm font-body">No completed shifts yet.</p>
        ) : (
          <>
            {pageDays.map(day => (
              <div key={day.dateStr} className="border-b border-tan/40 last:border-b-0">
                {/* Day header */}
                <div className="px-4 py-2.5 bg-off-white flex items-center justify-between">
                  <p className="text-xs font-display font-bold text-near-black uppercase tracking-wide">
                    {formatDayLabel(day.dateStr)}
                  </p>
                  <p className="text-xs font-mono font-bold text-warm-brown">
                    {day.totalHours.toFixed(2)}h
                  </p>
                </div>

                {/* Shifts for this day */}
                <div>
                  {day.shifts.map(shift => (
                    <ShiftRow key={shift.id} shift={shift} />
                  ))}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-tan/40 flex items-center justify-between">
                <span className="text-xs text-sage font-body">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, days.length)} of {days.length} days
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => p - 1)}
                    disabled={page === 0}
                    className="px-3 py-1.5 text-xs font-display font-bold border border-tan rounded
                               text-near-black hover:bg-off-white disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 text-xs font-display font-bold border border-tan rounded
                               text-near-black hover:bg-off-white disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
