'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Timecard } from '@/types';

interface Props {
  userId: string;
  weekStartUTC: string;
}

// All display uses Intl API — no client-side date library needed.
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

interface ActivityEvent {
  type: 'clock-in' | 'clock-out';
  time: string; // UTC ISO
  timecardId: string;
  remote?: boolean;
  manualEntry?: boolean;
}

function buildActivityFeed(timecards: Timecard[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const tc of timecards) {
    events.push({
      type: 'clock-in',
      time: tc.checkInTime,
      timecardId: tc.id,
      remote: tc.remote,
      manualEntry: tc.manualEntry,
    });
    if (tc.checkOutTime) {
      events.push({
        type: 'clock-out',
        time: tc.checkOutTime,
        timecardId: tc.id,
        manualEntry: tc.manualEntry,
      });
    }
  }
  return events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

export default function EmployeeOverview({ userId, weekStartUTC }: Props) {
  const [weekTimecards, setWeekTimecards] = useState<Timecard[]>([]);
  const [currentStatus, setCurrentStatus] = useState<{
    checkedIn: boolean;
    timecard?: Timecard;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/timecards?startDate=${encodeURIComponent(weekStartUTC)}&limit=100`).then(r =>
        r.json(),
      ),
      fetch('/api/checkin').then(r => r.json()),
    ]).then(([tcData, statusData]) => {
      setWeekTimecards(tcData.timecards || []);
      setCurrentStatus(statusData);
      setLoading(false);
    });
  }, [userId, weekStartUTC]);

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
                  Since{' '}
                  {activeTimecard && formatTimeET(activeTimecard.checkInTime)} ET
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
          <div
            className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              checkedIn ? 'bg-sage/20' : 'bg-tan/20'
            }`}
          >
            <svg
              className={`w-6 h-6 ${checkedIn ? 'text-sage' : 'text-tan'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* This week */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-tan shadow-card p-4">
          <p className="text-3xl font-display font-black text-near-black">
            {weekHours.toFixed(1)}h
          </p>
          <p className="text-sm text-sage font-body mt-1">This week</p>
        </div>
        <div className="bg-white rounded-lg border border-tan shadow-card p-4">
          <p className="text-3xl font-display font-black text-near-black">{weekShifts}</p>
          <p className="text-sm text-sage font-body mt-1">
            {weekShifts === 1 ? 'Shift' : 'Shifts'} this week
          </p>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-tan/40 flex items-center justify-between">
          <h2 className="font-display font-bold text-near-black">Recent activity</h2>
          <Link
            href="/dashboard/history"
            className="text-xs text-warm-brown font-display font-bold hover:underline"
          >
            See all
          </Link>
        </div>

        {activityEvents.length === 0 ? (
          <p className="px-4 py-8 text-center text-sage text-sm font-body">No activity yet.</p>
        ) : (
          <div className="divide-y divide-tan/30">
            {activityEvents.map((ev, i) => (
              <div key={`${ev.timecardId}-${ev.type}`} className="px-4 py-3 flex items-center gap-3">
                {/* Icon */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    ev.type === 'clock-in' ? 'bg-sage/20' : 'bg-tan/20'
                  }`}
                >
                  {ev.type === 'clock-in' ? (
                    <svg
                      className="w-4 h-4 text-sage"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 16l-4-4m0 0l4-4m-4 4h14"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4 text-warm-brown"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 8l4 4m0 0l-4 4m4-4H3"
                      />
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
                  <p className="text-xs text-sage font-body mt-0.5">
                    {relDayLabel(ev.time)}
                  </p>
                </div>

                <span className="font-mono text-sm text-near-black flex-shrink-0">
                  {formatTimeET(ev.time)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
