'use client';

import { useState, useEffect } from 'react';
import { Timecard, Allocation, Facility } from '@/types';

/** Returns "YYYY-MM-DD" in ET for the given Date. */
function toETDateStr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
}

/** Returns "YYYY-MM-DD" for Monday of the current ET week. */
function getWeekStartET(): string {
  const now = new Date();
  // Get today's day-of-week in ET (0 = Sun … 6 = Sat)
  const dowStr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(now);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[dowStr] ?? 0;
  const daysFromMonday = (dow + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(now.getTime() - daysFromMonday * 86400000);
  return toETDateStr(monday);
}

interface FunctionSummary {
  name: string;
  totalHours: number;
  percentage: number;
}

interface Report {
  totalHours: number;
  totalShifts: number;
  uniqueEmployees: number;
  functionBreakdown: FunctionSummary[];
}

export default function ReportsPage() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [filters, setFilters] = useState({
    startDate: getWeekStartET(),
    endDate: toETDateStr(new Date()),
    facilityId: '',
    employeeId: '',
  });
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateError, setDateError] = useState('');

  useEffect(() => {
    fetch('/api/facilities').then(r => r.json()).then(d => setFacilities(d.facilities || []));
  }, []);

  async function generateReport() {
    if (!filters.startDate || !filters.endDate) {
      setDateError('Please set both a start date and an end date before running a report.');
      return;
    }
    setDateError('');
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    params.set('status', 'checked-out');

    const res = await fetch(`/api/timecards?${params}`);
    const data = await res.json();
    const timecards: Timecard[] = data.timecards || [];

    const totalHours = timecards.reduce((sum, tc) => sum + (tc.totalHours || 0), 0);
    const uniqueEmployees = new Set(timecards.map(tc => tc.employeeId)).size;

    const fnMap = new Map<string, { name: string; hours: number }>();
    for (const tc of timecards) {
      if (!tc.allocations) continue;
      for (const alloc of tc.allocations as Allocation[]) {
        const hours = (tc.totalHours || 0) * (alloc.percentage / 100);
        const existing = fnMap.get(alloc.functionId);
        if (existing) {
          existing.hours += hours;
        } else {
          fnMap.set(alloc.functionId, { name: alloc.functionName, hours });
        }
      }
    }

    const functionBreakdown = Array.from(fnMap.entries())
      .map(([, v]) => ({
        name: v.name,
        totalHours: Math.round(v.hours * 100) / 100,
        percentage: totalHours > 0 ? Math.round((v.hours / totalHours) * 100 * 10) / 10 : 0,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    setReport({ totalHours: Math.round(totalHours * 100) / 100, totalShifts: timecards.length, uniqueEmployees, functionBreakdown });
    setLoading(false);
  }

  const exportCsv = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    window.open(`/api/export?${params}`, '_blank');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-black text-near-black">Reports</h1>
        <button
          onClick={exportCsv}
          className="bg-warm-brown text-off-white px-4 py-2 rounded-lg text-sm font-display font-bold
                     hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-tan shadow-card p-4 space-y-3">
        <p className="text-xs font-display font-bold text-sage uppercase tracking-widest">Filter</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-sage font-body mb-1">Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
              className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                         focus:outline-none focus:ring-2 focus:ring-warm-brown"
            />
          </div>
          <div>
            <label className="block text-xs text-sage font-body mb-1">End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
              className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                         focus:outline-none focus:ring-2 focus:ring-warm-brown"
            />
          </div>
          <div>
            <label className="block text-xs text-sage font-body mb-1">Facility</label>
            <select
              value={filters.facilityId}
              onChange={e => setFilters(f => ({ ...f, facilityId: e.target.value }))}
              className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                         focus:outline-none focus:ring-2 focus:ring-warm-brown"
            >
              <option value="">All facilities</option>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={generateReport}
              disabled={loading}
              className="w-full bg-near-black text-off-white py-2 rounded-lg text-sm font-display font-bold
                         hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Run report
            </button>
          </div>
        </div>
        {dateError && (
          <p className="text-xs text-red-600 font-body">{dateError}</p>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {report && !loading && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-tan shadow-card p-4 text-center">
              <p className="text-3xl font-display font-black text-warm-brown">{report.totalHours}h</p>
              <p className="text-xs text-sage font-body mt-1 uppercase tracking-wide">Total hours</p>
            </div>
            <div className="bg-white rounded-lg border border-tan shadow-card p-4 text-center">
              <p className="text-3xl font-display font-black text-near-black">{report.totalShifts}</p>
              <p className="text-xs text-sage font-body mt-1 uppercase tracking-wide">Shifts</p>
            </div>
            <div className="bg-white rounded-lg border border-tan shadow-card p-4 text-center">
              <p className="text-3xl font-display font-black text-near-black">{report.uniqueEmployees}</p>
              <p className="text-xs text-sage font-body mt-1 uppercase tracking-wide">Employees</p>
            </div>
          </div>

          {/* Function breakdown */}
          <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-tan/40">
              <h2 className="font-display font-bold text-near-black">Labor by function</h2>
            </div>
            {report.functionBreakdown.length === 0 ? (
              <p className="px-4 py-8 text-center text-sage text-sm font-body">Nothing here yet.</p>
            ) : (
              <div className="divide-y divide-tan/30">
                {report.functionBreakdown.map((fn, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-body text-near-black">{fn.name}</span>
                      <div className="text-right flex items-baseline gap-2">
                        <span className="text-sm font-display font-bold text-warm-brown font-mono">{fn.totalHours}h</span>
                        <span className="text-xs text-sage font-mono">{fn.percentage}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-tan/30 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${fn.percentage}%`, backgroundColor: 'var(--color-warm-brown)' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!report && !loading && (
        <div className="bg-white rounded-lg border border-tan shadow-card px-4 py-12 text-center">
          <p className="text-sage font-body text-sm">Set your filters and run a report.</p>
        </div>
      )}
    </div>
  );
}
