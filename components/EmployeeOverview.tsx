'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Timecard, LeaveBalance, LeaveRequest } from '@/types';
import LeaveRequestModal from '@/components/LeaveRequestModal';

interface Props {
  userId: string;
  weekStartUTC: string;
}

function formatTimeET(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoString));
}

function formatDateET(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoString));
}

function isTodayET(isoString: string): boolean {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(isoString)) === fmt.format(new Date());
}

function isYesterdayET(isoString: string): boolean {
  const d = new Date(new Date().getTime() - 86400000);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date(isoString)) === fmt.format(d);
}

function relDayLabel(isoString: string): string {
  if (isTodayET(isoString)) return 'Today';
  if (isYesterdayET(isoString)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoString));
}

function formatLeaveDates(dates: { date: string; hours: number }[]): string {
  if (dates.length === 0) return '—';
  if (dates.length === 1) {
    const [y, m, d] = dates[0].date.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
      new Date(y, m - 1, d, 12),
    );
  }
  const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date));
  const [ay, am, ad] = sorted[0].date.split('-').map(Number);
  const [zy, zm, zd] = sorted[sorted.length - 1].date.split('-').map(Number);
  const first = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(ay, am - 1, ad, 12),
  );
  const last = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(zy, zm - 1, zd, 12),
  );
  return `${first} – ${last} (${dates.length} days)`;
}

interface ActivityEvent {
  type: 'clock-in' | 'clock-out';
  time: string;
  timecardId: string;
  remote?: boolean;
  manualEntry?: boolean;
}

function buildActivityFeed(timecards: Timecard[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const tc of timecards) {
    events.push({ type: 'clock-in', time: tc.checkInTime, timecardId: tc.id, remote: tc.remote, manualEntry: tc.manualEntry });
    if (tc.checkOutTime) {
      events.push({ type: 'clock-out', time: tc.checkOutTime, timecardId: tc.id, manualEntry: tc.manualEntry });
    }
  }
  return events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-tan text-near-black',
  approved: 'bg-sage text-off-white',
  denied: 'bg-near-black text-off-white',
};

export default function EmployeeOverview({ userId, weekStartUTC }: Props) {
  const [weekTimecards, setWeekTimecards] = useState<Timecard[]>([]);
  const [currentStatus, setCurrentStatus] = useState<{ checkedIn: boolean; timecard?: Timecard } | null>(null);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expandedDenial, setExpandedDenial] = useState<string | null>(null);

  const loadData = useCallback(() => {
    return Promise.all([
      fetch(`/api/timecards?startDate=${encodeURIComponent(weekStartUTC)}&limit=100`).then(r => r.json()),
      fetch('/api/checkin').then(r => r.json()),
      fetch('/api/leave/balance').then(r => r.json()),
      fetch('/api/leave/requests').then(r => r.json()),
    ]).then(([tcData, statusData, balanceData, leaveData]) => {
      setWeekTimecards(tcData.timecards || []);
      setCurrentStatus(statusData);
      if (balanceData.balance) setBalance(balanceData.balance);
      setLeaveRequests(leaveData.requests || []);
      setLoading(false);
    });
  }, [userId, weekStartUTC]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
      </div>
    );

  const checkedIn = currentStatus?.checkedIn;
  const isPending = currentStatus?.timecard?.status === 'pending-approval';
  const activeTimecard = currentStatus?.timecard;

  const weekHours = weekTimecards
    .filter(tc => tc.status === 'checked-out')
    .reduce((sum, tc) => sum + (tc.totalHours || 0), 0);
  const weekShifts = weekTimecards.filter(tc => tc.status === 'checked-out').length;
  const activityEvents = buildActivityFeed(weekTimecards).slice(0, 8);

  const ptoRemaining = balance ? (balance.ptoTotal - balance.ptoUsed) : 40;
  const sickRemaining = balance ? (balance.sickTotal - balance.sickUsed) : 40;
  const ptoTotal = balance?.ptoTotal ?? 40;
  const sickTotal = balance?.sickTotal ?? 40;

  const recentLeave = leaveRequests.slice(0, 5);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-black text-near-black">My hours</h1>

      {/* Current status */}
      <div className="bg-white rounded-lg border border-tan shadow-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-display font-bold text-sage uppercase tracking-widest mb-1">
              Status
            </p>
            {checkedIn ? (
              <>
                <p className="text-xl font-display font-black text-near-black">
                  {isPending ? 'Waiting on manager' : 'Clocked in'}
                </p>
                <p className="text-sm text-sage font-body mt-1">
                  Since {activeTimecard && formatTimeET(activeTimecard.checkInTime)} ET
                  {activeTimecard?.remote && (
                    <span className="ml-2 text-xs px-2 py-0.5 bg-tan/30 text-warm-brown rounded font-display font-bold">
                      Remote
                    </span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-xl font-display font-black text-near-black">Not clocked in</p>
            )}
          </div>
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${checkedIn ? 'bg-sage/20' : 'bg-tan/20'}`}>
            <svg className={`w-6 h-6 ${checkedIn ? 'text-sage' : 'text-tan'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* This week */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-tan shadow-card p-4">
          <p className="text-3xl font-display font-black text-near-black">{weekHours.toFixed(1)}h</p>
          <p className="text-sm text-sage font-body mt-1">This week</p>
        </div>
        <div className="bg-white rounded-lg border border-tan shadow-card p-4">
          <p className="text-3xl font-display font-black text-near-black">{weekShifts}</p>
          <p className="text-sm text-sage font-body mt-1">{weekShifts === 1 ? 'Shift' : 'Shifts'} this week</p>
        </div>
      </div>

      {/* Leave balance cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-tan shadow-card p-4">
          <p className="text-xs font-body text-sage mb-1">PTO Balance</p>
          <p className="text-3xl font-display font-black text-near-black">{ptoRemaining}h</p>
          <p className="text-xs font-body text-sage mt-1">of {ptoTotal}h remaining</p>
        </div>
        <div className="bg-white rounded-lg border border-tan shadow-card p-4">
          <p className="text-xs font-body text-sage mb-1">Sick Time Balance</p>
          <p className="text-3xl font-display font-black text-near-black">{sickRemaining}h</p>
          <p className="text-xs font-body text-sage mt-1">of {sickTotal}h remaining</p>
        </div>
      </div>

      {/* Request Leave button */}
      <button
        onClick={() => setShowModal(true)}
        className="w-full bg-warm-brown text-off-white py-3 rounded-lg font-display font-bold
                   hover:opacity-90 transition-opacity"
      >
        Request Leave
      </button>

      {/* Leave history */}
      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-tan/40">
          <h2 className="font-display font-bold text-near-black">Leave History</h2>
        </div>
        {recentLeave.length === 0 ? (
          <p className="px-4 py-8 text-center text-sage text-sm font-body">No leave requests yet.</p>
        ) : (
          <div className="divide-y divide-tan/30">
            {recentLeave.map(req => (
              <div key={req.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-bold text-near-black text-sm">
                        {req.type === 'pto' ? 'PTO' : 'Sick Time'}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-display font-bold ${STATUS_BADGE[req.status] ?? 'bg-tan text-near-black'}`}
                      >
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-xs text-sage font-body mt-0.5">
                      {formatLeaveDates(req.dates)} · {req.totalHours}h
                    </p>
                  </div>
                  {req.status === 'denied' && req.denialReason && (
                    <button
                      onClick={() => setExpandedDenial(expandedDenial === req.id ? null : req.id)}
                      className="text-xs text-sage hover:text-near-black font-body flex-shrink-0"
                    >
                      {expandedDenial === req.id ? 'Hide' : 'Reason'}
                    </button>
                  )}
                </div>
                {req.status === 'denied' && req.denialReason && expandedDenial === req.id && (
                  <p className="mt-2 text-xs text-sage font-body bg-off-white rounded px-2 py-1.5">
                    {req.denialReason}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-tan/40 flex items-center justify-between">
          <h2 className="font-display font-bold text-near-black">Recent activity</h2>
          <Link href="/dashboard/history" className="text-xs text-warm-brown font-display font-bold hover:underline">
            See all
          </Link>
        </div>

        {activityEvents.length === 0 ? (
          <p className="px-4 py-8 text-center text-sage text-sm font-body">No activity yet.</p>
        ) : (
          <div className="divide-y divide-tan/30">
            {activityEvents.map(ev => (
              <div key={`${ev.timecardId}-${ev.type}`} className="px-4 py-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${ev.type === 'clock-in' ? 'bg-sage/20' : 'bg-tan/20'}`}>
                  {ev.type === 'clock-in' ? (
                    <svg className="w-4 h-4 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-warm-brown" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-display font-bold text-near-black text-sm">
                      {ev.type === 'clock-in' ? 'Clocked in' : 'Clocked out'}
                    </span>
                    {ev.remote && (
                      <span className="text-xs px-1.5 py-0.5 bg-tan/30 text-warm-brown rounded font-display font-bold">
                        Remote
                      </span>
                    )}
                    {ev.manualEntry && (
                      <span className="text-xs px-1.5 py-0.5 bg-off-white border border-tan text-sage rounded font-display font-bold">
                        Manual
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-sage font-body mt-0.5">{relDayLabel(ev.time)}</p>
                </div>
                <span className="font-mono text-sm text-near-black flex-shrink-0">{formatTimeET(ev.time)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Leave request modal */}
      {showModal && balance && (
        <LeaveRequestModal
          balance={balance}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}
