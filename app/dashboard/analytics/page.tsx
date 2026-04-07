'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Facility } from '@/types';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Tooltip, Legend,
);

// ── Date helpers (client-side, Intl only) ───────────────────────────────────

function toETDateStr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
}

function getWeekStartET(): string {
  const now = new Date();
  const dowStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  }).format(now);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[dowStr] ?? 0;
  const daysFromMonday = (dow + 6) % 7;
  const monday = new Date(now.getTime() - daysFromMonday * 86400000);
  return toETDateStr(monday);
}

function fmtDate(dateStr: string): string {
  // "2025-04-01" → "Apr 1"
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(y, m - 1, d),
  );
}

// ── Brand palette ────────────────────────────────────────────────────────────
const PALETTE = ['#7B604B', '#777D64', '#C7AF87', '#231F20', '#E9E8E0', '#a8998a', '#5a6b4e'];

// ── Types ────────────────────────────────────────────────────────────────────
interface Summary {
  totalHours: number;
  totalShifts: number;
  avgShiftLength: number;
  uniqueEmployees: number;
}
interface FnRow    { name: string; totalHours: number; }
interface CatRow   { name: string; totalHours: number; percentage: number; }
interface EmpRow   { employeeId: string; employeeName: string; totalHours: number; topFunction: string; shifts: number; }
interface DayRow   { date: string; totalHours: number; }

interface AnalyticsData {
  empty: boolean;
  summary?: Summary;
  hoursByFunction?: FnRow[];
  hoursByCategory?: CatRow[];
  employeeBreakdown?: EmpRow[];
  dailyHours?: DayRow[];
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-tan shadow-card p-5 text-center">
      <p className="text-3xl font-display font-black text-warm-brown">{value}</p>
      <p className="text-xs text-sage font-body mt-1 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-display font-bold text-near-black px-4 py-3 border-b border-tan/40">
      {children}
    </h2>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
      <SectionHeading>{title}</SectionHeading>
      <div className="p-4">{children}</div>
    </div>
  );
}

function HoursByFunctionChart({ data }: { data: FnRow[] }) {
  const chartData = {
    labels: data.map(r => r.name),
    datasets: [{
      label: 'Hours',
      data: data.map(r => r.totalHours),
      backgroundColor: '#7B604B',
      borderRadius: 4,
    }],
  };
  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: '#C7AF8730' }, ticks: { font: { family: 'JetBrains Mono, monospace', size: 11 } } },
      y: { grid: { display: false }, ticks: { font: { family: 'Lora, serif', size: 12 } } },
    },
  };
  // Dynamic height: 40px per bar + padding
  const height = Math.max(200, data.length * 44 + 40);
  return (
    <div style={{ height }}>
      <Bar data={chartData} options={{ ...options, maintainAspectRatio: false }} />
    </div>
  );
}

function HoursByCategoryChart({ data }: { data: CatRow[] }) {
  const chartData = {
    labels: data.map(r => r.name),
    datasets: [{
      data: data.map(r => r.totalHours),
      backgroundColor: PALETTE.slice(0, data.length),
      borderWidth: 1,
      borderColor: '#E9E8E0',
    }],
  };
  const options = {
    responsive: true,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          font: { family: 'Lora, serif', size: 12 },
          generateLabels: (chart: ChartJS) => {
            const ds = chart.data.datasets[0];
            return (chart.data.labels as string[]).map((label, i) => ({
              text: `${label}  ${data[i]?.percentage ?? 0}%`,
              fillStyle: (ds.backgroundColor as string[])[i],
              strokeStyle: '#E9E8E0',
              lineWidth: 1,
              index: i,
              hidden: false,
              datasetIndex: 0,
            }));
          },
        },
      },
    },
  };
  return (
    <div className="flex justify-center">
      <div style={{ width: '100%', maxWidth: 400 }}>
        <Doughnut data={chartData} options={{ ...options, maintainAspectRatio: true }} />
      </div>
    </div>
  );
}

function DailyHoursTrendChart({ data }: { data: DayRow[] }) {
  const chartData = {
    labels: data.map(r => fmtDate(r.date)),
    datasets: [{
      label: 'Hours',
      data: data.map(r => r.totalHours),
      borderColor: '#7B604B',
      backgroundColor: '#7B604B20',
      fill: true,
      tension: 0.3,
      pointBackgroundColor: '#7B604B',
      pointRadius: data.length > 30 ? 2 : 4,
    }],
  };
  const options = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          font: { family: 'Lora, serif', size: 11 },
          maxRotation: 45,
          autoSkip: true,
          maxTicksLimit: 14,
        },
      },
      y: {
        grid: { color: '#C7AF8730' },
        ticks: { font: { family: 'JetBrains Mono, monospace', size: 11 } },
        beginAtZero: true,
      },
    },
  };
  return (
    <div style={{ height: 240 }}>
      <Line data={chartData} options={{ ...options, maintainAspectRatio: false }} />
    </div>
  );
}

function EmployeeTable({ data }: { data: EmpRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-near-black text-tan">
            <th className="px-4 py-2.5 text-left font-display font-bold text-xs tracking-wide">Employee</th>
            <th className="px-4 py-2.5 text-right font-display font-bold text-xs tracking-wide">Hours</th>
            <th className="px-4 py-2.5 text-left font-display font-bold text-xs tracking-wide hidden sm:table-cell">Top Function</th>
            <th className="px-4 py-2.5 text-right font-display font-bold text-xs tracking-wide">Shifts</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.employeeId} className={i % 2 === 0 ? 'bg-white' : 'bg-off-white'}>
              <td className="px-4 py-2.5 font-body text-near-black">{row.employeeName}</td>
              <td className="px-4 py-2.5 text-right font-mono text-warm-brown font-bold">{row.totalHours}h</td>
              <td className="px-4 py-2.5 font-body text-sage text-xs hidden sm:table-cell">{row.topFunction}</td>
              <td className="px-4 py-2.5 text-right font-mono text-near-black">{row.shifts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [filters, setFilters] = useState({
    startDate: getWeekStartET(),
    endDate: toETDateStr(new Date()),
    facilityId: '',
    employeeId: '',
  });
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateError, setDateError] = useState('');
  const [apiError, setApiError] = useState('');

  // Employee list derived from last full (no-employee-filter) run
  const [knownEmployees, setKnownEmployees] = useState<{ id: string; name: string }[]>([]);
  const lastFullRunRef = useRef<AnalyticsData | null>(null);

  useEffect(() => {
    fetch('/api/facilities')
      .then(r => r.json())
      .then(d => setFacilities(d.facilities || []));
    // Auto-run on mount with default week
    runReport({ startDate: getWeekStartET(), endDate: toETDateStr(new Date()), facilityId: '', employeeId: '' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runReport(f: typeof filters) {
    if (!f.startDate || !f.endDate) {
      setDateError('Please set both a start date and an end date.');
      return;
    }
    setDateError('');
    setApiError('');
    setLoading(true);

    try {
      const params = new URLSearchParams({
        startDate: f.startDate,
        endDate: f.endDate,
        ...(f.facilityId  ? { facilityId:  f.facilityId  } : {}),
        ...(f.employeeId  ? { employeeId:  f.employeeId  } : {}),
      });
      const res  = await fetch(`/api/analytics?${params}`);
      const json = await res.json() as AnalyticsData & { error?: string };

      if (!res.ok) throw new Error(json.error || 'Failed to load analytics');
      setData(json);

      // Build employee dropdown from a full (no-employee) run
      if (!f.employeeId && !json.empty && json.employeeBreakdown) {
        const list = json.employeeBreakdown.map(r => ({ id: r.employeeId, name: r.employeeName }));
        setKnownEmployees(list);
        lastFullRunRef.current = json;
      }
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  function handleRun() {
    runReport(filters);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <h1 className="text-2xl font-display font-black text-near-black">Analytics</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-tan shadow-card p-4 space-y-3">
        <p className="text-xs font-display font-bold text-sage uppercase tracking-widest">Filters</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
              <option value="">All Facilities</option>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-sage font-body mb-1">Employee</label>
            <select
              value={filters.employeeId}
              onChange={e => setFilters(f => ({ ...f, employeeId: e.target.value }))}
              className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                         focus:outline-none focus:ring-2 focus:ring-warm-brown"
            >
              <option value="">All Employees</option>
              {knownEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end col-span-2 md:col-span-1">
            <button
              onClick={handleRun}
              disabled={loading}
              className="w-full bg-warm-brown text-off-white py-2 rounded-lg text-sm font-display font-bold
                         hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? 'Loading…' : 'Run'}
            </button>
          </div>
        </div>
        {dateError && <p className="text-xs text-red-600 font-body">{dateError}</p>}
        {apiError  && <p className="text-xs text-red-600 font-body">{apiError}</p>}
      </div>

      {/* Loading spinner */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && data?.empty && (
        <div className="bg-white rounded-lg border border-tan shadow-card px-4 py-12 text-center">
          <p className="text-sage font-body text-sm">No shifts logged for this period.</p>
        </div>
      )}

      {/* Results */}
      {!loading && data && !data.empty && (
        <>
          {/* Section 1 — Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Total Hours Worked" value={`${data.summary!.totalHours}h`} />
            <SummaryCard label="Total Shifts"        value={`${data.summary!.totalShifts}`} />
            <SummaryCard label="Avg Shift Length"    value={`${data.summary!.avgShiftLength}h`} />
            <SummaryCard label="Employees Worked"    value={`${data.summary!.uniqueEmployees}`} />
          </div>

          {/* Section 2 — Hours by Function */}
          {data.hoursByFunction && data.hoursByFunction.length > 0 && (
            <ChartCard title="Hours by Function">
              <HoursByFunctionChart data={data.hoursByFunction} />
            </ChartCard>
          )}

          {/* Section 3 — Hours by Category */}
          {data.hoursByCategory && data.hoursByCategory.length > 0 && (
            <ChartCard title="Hours by Category">
              <HoursByCategoryChart data={data.hoursByCategory} />
            </ChartCard>
          )}

          {/* Section 4 — Employee Breakdown */}
          {data.employeeBreakdown && data.employeeBreakdown.length > 0 && (
            <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
              <SectionHeading>Employee Breakdown</SectionHeading>
              <EmployeeTable data={data.employeeBreakdown} />
            </div>
          )}

          {/* Section 5 — Daily Hours Trend */}
          {data.dailyHours && data.dailyHours.length > 0 && (
            <ChartCard title="Daily Hours Trend">
              <DailyHoursTrendChart data={data.dailyHours} />
            </ChartCard>
          )}
        </>
      )}

      {/* Idle state (no run yet — shouldn't normally show since we auto-run) */}
      {!loading && !data && (
        <div className="bg-white rounded-lg border border-tan shadow-card px-4 py-12 text-center">
          <p className="text-sage font-body text-sm">Set your filters and click Run.</p>
        </div>
      )}
    </div>
  );
}
