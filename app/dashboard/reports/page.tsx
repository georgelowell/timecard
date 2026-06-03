'use client';

import { useState, useEffect } from 'react';
import { Facility } from '@/types';

// ── Date helpers ──────────────────────────────────────────────────────────────

function toETDateStr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
}

function getWeekStartET(): string {
  const now = new Date();
  const dowStr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(now);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[dowStr] ?? 0;
  const monday = new Date(now.getTime() - ((dow + 6) % 7) * 86400000);
  return toETDateStr(monday);
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toETDateStr(new Date(y, m - 1, d + days, 12, 0, 0));
}

/** "2026-04-07" → "Mon Apr 7" */
function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .format(new Date(y, m - 1, d, 12));
}

function escapeCsv(val: string | number | undefined): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmployeeDay  { date: string; hours: number; hasOpenShift: boolean; }
interface EmployeeReport {
  id: string; name: string; email: string;
  workedHours: number; ptoHours: number; sickHours: number;
  totalHours: number; hasOpenShift: boolean;
  days: EmployeeDay[];
}
interface PayrollReport { startDate: string; endDate: string; employees: EmployeeReport[]; }

interface StaffingWorkerDay  { date: string; hours: number; hasOpenShift: boolean; }
interface StaffingWorkerReport {
  id: string; name: string; totalHours: number;
  loggedBy: string; loggedByName: string;
  hasOpenShift: boolean;
  days: StaffingWorkerDay[];
}
interface StaffingReport { startDate: string; endDate: string; workers: StaffingWorkerReport[]; }

type ReportType = 'payroll' | 'staffing';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('payroll');
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [filters, setFilters] = useState({
    startDate: getWeekStartET(),
    weeksDuration: 1,
    facilityId: '',
  });
  const [report, setReport]       = useState<PayrollReport | null>(null);
  const [staffingReport, setStaffingReport] = useState<StaffingReport | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [copied, setCopied]       = useState(false);

  useEffect(() => {
    fetch('/api/facilities').then(r => r.json()).then(d => setFacilities(d.facilities || []));
  }, []);

  function endDate(): string {
    return addDaysToDateStr(filters.startDate, filters.weeksDuration * 7 - 1);
  }

  async function generateReport() {
    if (!filters.startDate) {
      setError('Please set a start date before running a report.');
      return;
    }
    setError('');
    setLoading(true);
    setReport(null);
    setStaffingReport(null);
    try {
      const params = new URLSearchParams({
        startDate: filters.startDate,
        endDate: endDate(),
      });
      if (filters.facilityId) params.set('facilityId', filters.facilityId);

      const apiPath = reportType === 'staffing' ? '/api/reports/staffing' : '/api/reports';
      const res = await fetch(`${apiPath}?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load report data.');
        return;
      }
      if (reportType === 'staffing') {
        setStaffingReport(data as StaffingReport);
      } else {
        setReport(data as PayrollReport);
      }
    } catch {
      setError('Failed to load report data. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    if (reportType === 'staffing' && staffingReport) {
      const lines = ['Worker Name\tTotal Hours\tLogged By'];
      for (const w of staffingReport.workers) {
        lines.push(`${w.name}\t${w.totalHours}\t${w.loggedByName}`);
      }
      navigator.clipboard.writeText(lines.join('\n')).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
      return;
    }
    if (!report) return;
    const lines = ['Employee Name\tHours Worked\tPTO\tSick Time\tTotal Hours'];
    for (const emp of report.employees) {
      lines.push(`${emp.name}\t${emp.workedHours ?? emp.totalHours}\t${emp.ptoHours ?? 0}\t${emp.sickHours ?? 0}\t${emp.totalHours}`);
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function exportCsv() {
    if (reportType === 'staffing' && staffingReport) {
      const workers = staffingReport.workers;
      const days = workers[0]?.days ?? [];
      const dayHeaders = days.flatMap(d => [formatDayLabel(d.date), formatDayLabel(d.date) + ' Hrs']);
      const headerRow = ['Start Date', 'End Date', 'Worker', 'Total Hours', 'Logged By', ...dayHeaders].join(',');
      const rows = [headerRow];
      for (const w of workers) {
        const dayCols = w.days.flatMap(d => [
          escapeCsv(d.date),
          escapeCsv(d.hours > 0 ? d.hours : ''),
        ]);
        rows.push([
          escapeCsv(staffingReport.startDate),
          escapeCsv(staffingReport.endDate),
          escapeCsv(w.name),
          escapeCsv(w.totalHours),
          escapeCsv(w.loggedByName),
          ...dayCols,
        ].join(','));
      }
      const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staffing-report-${staffingReport.startDate}-to-${staffingReport.endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (!report) return;
    const days = report.employees[0]?.days ?? [];
    const dayHeaders = days.flatMap(d => [formatDayLabel(d.date), formatDayLabel(d.date) + ' Hrs']);
    const headerRow = ['Start Date', 'End Date', 'Employee', 'Hours Worked', 'PTO Hours', 'Sick Time Hours', 'Total Hours', ...dayHeaders].join(',');
    const rows = [headerRow];
    for (const emp of report.employees) {
      const dayCols = emp.days.flatMap(d => [
        escapeCsv(d.date),
        escapeCsv(d.hours > 0 ? d.hours : ''),
      ]);
      rows.push([
        escapeCsv(report.startDate),
        escapeCsv(report.endDate),
        escapeCsv(emp.name),
        escapeCsv(emp.workedHours ?? emp.totalHours),
        escapeCsv(emp.ptoHours ?? 0),
        escapeCsv(emp.sickHours ?? 0),
        escapeCsv(emp.totalHours),
        ...dayCols,
      ].join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-${report.startDate}-to-${report.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const anyOpenShift = report?.employees.some(e => e.hasOpenShift) ?? false;
  const staffingAnyOpenShift = staffingReport?.workers.some(w => w.hasOpenShift) ?? false;
  const hasReport = reportType === 'staffing' ? staffingReport : report;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-black text-near-black">Reports</h1>
        <div className="flex items-center gap-2">
          {/* Report type toggle */}
          <div className="flex bg-off-white rounded-lg border border-tan overflow-hidden">
            <button
              onClick={() => { setReportType('payroll'); setReport(null); setStaffingReport(null); }}
              className={`px-3 py-1.5 text-xs font-display font-bold transition-colors ${
                reportType === 'payroll'
                  ? 'bg-warm-brown text-off-white'
                  : 'text-sage hover:text-near-black'
              }`}
            >
              Payroll
            </button>
            <button
              onClick={() => { setReportType('staffing'); setReport(null); setStaffingReport(null); }}
              className={`px-3 py-1.5 text-xs font-display font-bold transition-colors ${
                reportType === 'staffing'
                  ? 'bg-warm-brown text-off-white'
                  : 'text-sage hover:text-near-black'
              }`}
            >
              Staffing
            </button>
          </div>
          {hasReport && (
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
          )}
        </div>
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
            <label className="block text-xs text-sage font-body mb-1">Duration</label>
            <select
              value={filters.weeksDuration}
              onChange={e => setFilters(f => ({ ...f, weeksDuration: Number(e.target.value) }))}
              className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                         focus:outline-none focus:ring-2 focus:ring-warm-brown"
            >
              <option value={1}>1 week</option>
              <option value={2}>2 weeks</option>
              <option value={4}>4 weeks</option>
            </select>
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
        {error && <p className="text-xs text-red-600 font-body">{error}</p>}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Payroll Results ──────────────────────────────────────────────────── */}
      {reportType === 'payroll' && report && !loading && (
        <>
          {/* Per-employee detail cards */}
          {report.employees.length === 0 ? (
            <div className="bg-white rounded-lg border border-tan shadow-card px-4 py-8 text-center">
              <p className="text-sage font-body text-sm">No completed shifts found for this period.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {report.employees.map(emp => (
                <div key={emp.id} className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
                  {/* Employee header */}
                  <div className="px-4 py-3 border-b border-tan/40">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display font-bold text-near-black">{emp.name}</p>
                        <p className="text-xs font-body text-sage">{emp.email}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div>
                        <p className="text-xs font-body text-sage">Hours Worked</p>
                        <p className="font-mono font-bold text-near-black">
                          {emp.workedHours ?? emp.totalHours}h{emp.hasOpenShift && <span className="text-warm-brown">*</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-body text-sage">PTO</p>
                        <p className="font-mono font-bold text-near-black">{emp.ptoHours ?? 0}h</p>
                      </div>
                      <div>
                        <p className="text-xs font-body text-sage">Sick Time</p>
                        <p className="font-mono font-bold text-near-black">{emp.sickHours ?? 0}h</p>
                      </div>
                    </div>
                    {((emp.ptoHours ?? 0) > 0 || (emp.sickHours ?? 0) > 0) && (
                      <p className="text-xs font-body text-sage mt-2 italic">
                        PTO and Sick Time do not count toward overtime threshold.
                      </p>
                    )}
                  </div>
                  {/* Day rows */}
                  <div className="divide-y divide-tan/20">
                    {emp.days.map(day => (
                      <div key={day.date} className="flex items-center justify-between px-4 py-2">
                        <span className="text-sm font-body text-near-black w-28">{formatDayLabel(day.date)}</span>
                        {day.hours > 0 ? (
                          <span className="font-mono text-sm text-near-black">
                            {day.hours}h{day.hasOpenShift && <span className="text-warm-brown">*</span>}
                          </span>
                        ) : (
                          <span className="font-mono text-sm text-sage">—</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary table */}
          {report.employees.length > 0 && (
            <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-tan/40">
                <h2 className="font-display font-bold text-near-black">Summary</h2>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1.5 border border-sage text-sage px-3 py-1.5 rounded-lg
                             text-xs font-display font-bold hover:text-near-black hover:border-near-black transition-colors"
                >
                  {copied ? (
                    'Copied!'
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy to clipboard
                    </>
                  )}
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--color-near-black)' }}>
                    {['Employee', 'Hours Worked', 'PTO', 'Sick Time', 'Total Hours'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-display font-bold text-tan text-xs uppercase tracking-wide last:text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.employees.map((emp, i) => (
                    <tr key={emp.id} className={i % 2 === 0 ? 'bg-white' : 'bg-off-white'}>
                      <td className="px-4 py-2.5 font-body text-near-black">{emp.name}</td>
                      <td className="px-4 py-2.5 font-mono text-near-black">
                        {emp.workedHours ?? emp.totalHours}h{emp.hasOpenShift && <span className="text-warm-brown">*</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-near-black">{emp.ptoHours ?? 0}h</td>
                      <td className="px-4 py-2.5 font-mono text-near-black">{emp.sickHours ?? 0}h</td>
                      <td className="px-4 py-2.5 font-mono text-right text-near-black font-bold">
                        {emp.totalHours}h{emp.hasOpenShift && <span className="text-warm-brown">*</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {anyOpenShift && (
                <p className="px-4 py-2 text-xs font-body italic text-warm-brown border-t border-tan/40">
                  * Hours marked with asterisk include open shifts and may be incomplete.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Staffing Results ──────────────────────────────────────────────────── */}
      {reportType === 'staffing' && staffingReport && !loading && (
        <>
          {staffingReport.workers.length === 0 ? (
            <div className="bg-white rounded-lg border border-tan shadow-card px-4 py-8 text-center">
              <p className="text-sage font-body text-sm">No staffing shifts found for this period.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {staffingReport.workers.map(worker => (
                <div key={worker.id} className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
                  <div className="px-4 py-3 border-b border-tan/40">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display font-bold text-near-black">{worker.name}</p>
                        <p className="text-xs font-body text-sage">Logged by {worker.loggedByName}</p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className="text-xs font-body text-sage">Total Hours</p>
                      <p className="font-mono font-bold text-near-black">
                        {worker.totalHours}h{worker.hasOpenShift && <span className="text-warm-brown">*</span>}
                      </p>
                    </div>
                  </div>
                  <div className="divide-y divide-tan/20">
                    {worker.days.map(day => (
                      <div key={day.date} className="flex items-center justify-between px-4 py-2">
                        <span className="text-sm font-body text-near-black w-28">{formatDayLabel(day.date)}</span>
                        {day.hours > 0 ? (
                          <span className="font-mono text-sm text-near-black">
                            {day.hours}h{day.hasOpenShift && <span className="text-warm-brown">*</span>}
                          </span>
                        ) : (
                          <span className="font-mono text-sm text-sage">—</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Staffing Summary table */}
          {staffingReport.workers.length > 0 && (
            <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-tan/40">
                <h2 className="font-display font-bold text-near-black">Summary</h2>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1.5 border border-sage text-sage px-3 py-1.5 rounded-lg
                             text-xs font-display font-bold hover:text-near-black hover:border-near-black transition-colors"
                >
                  {copied ? (
                    'Copied!'
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy to clipboard
                    </>
                  )}
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--color-near-black)' }}>
                    {['Worker', 'Total Hours', 'Logged By'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-display font-bold text-tan text-xs uppercase tracking-wide last:text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staffingReport.workers.map((worker, i) => (
                    <tr key={worker.id} className={i % 2 === 0 ? 'bg-white' : 'bg-off-white'}>
                      <td className="px-4 py-2.5 font-body text-near-black">{worker.name}</td>
                      <td className="px-4 py-2.5 font-mono text-near-black">
                        {worker.totalHours}h{worker.hasOpenShift && <span className="text-warm-brown">*</span>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-right text-near-black">{worker.loggedByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {staffingAnyOpenShift && (
                <p className="px-4 py-2 text-xs font-body italic text-warm-brown border-t border-tan/40">
                  * Hours marked with asterisk include open shifts and may be incomplete.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {!hasReport && !loading && (
        <div className="bg-white rounded-lg border border-tan shadow-card px-4 py-12 text-center">
          <p className="text-sage font-body text-sm">Set your filters and run a report.</p>
        </div>
      )}
    </div>
  );
}
