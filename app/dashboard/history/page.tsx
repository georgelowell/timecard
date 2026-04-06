'use client';

import { useState, useEffect } from 'react';
import { Timecard } from '@/types';

const PAGE_SIZE = 30;

function formatDateET(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(isoString));
}

function formatTimeET(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoString));
}

interface ActivityEvent {
  type: 'clock-in' | 'clock-out';
  time: string;
  timecardId: string;
  facilityName?: string;
  remote?: boolean;
  manualEntry?: boolean;
  location?: { lat: number; lng: number } | null;
}

function buildEvents(timecards: Timecard[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const tc of timecards) {
    events.push({
      type: 'clock-in',
      time: tc.checkInTime,
      timecardId: tc.id,
      facilityName: tc.facilityName,
      remote: tc.remote,
      manualEntry: tc.manualEntry,
      location: tc.checkInLocation ?? null,
    });
    if (tc.checkOutTime) {
      events.push({
        type: 'clock-out',
        time: tc.checkOutTime,
        timecardId: tc.id,
        facilityName: tc.facilityName,
        manualEntry: tc.manualEntry,
        location: tc.checkOutLocation ?? null,
      });
    }
  }
  return events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

export default function HistoryPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch('/api/timecards?limit=500')
      .then(r => r.json())
      .then(data => {
        setEvents(buildEvents(data.timecards || []));
        setLoading(false);
      });
  }, []);

  const totalPages = Math.ceil(events.length / PAGE_SIZE);
  const pageEvents = events.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-display font-black text-near-black">My history</h1>

      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <p className="px-4 py-8 text-center text-sage text-sm font-body">No activity yet.</p>
        ) : (
          <>
            <div className="divide-y divide-tan/30">
              {pageEvents.map(ev => (
                <div
                  key={`${ev.timecardId}-${ev.type}`}
                  className="px-4 py-3 flex items-center gap-3"
                >
                  {/* Type icon */}
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

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-display font-bold text-near-black text-sm">
                        {ev.type === 'clock-in' ? 'Clock in' : 'Clock out'}
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
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-xs text-sage font-body">{formatDateET(ev.time)}</p>
                      {ev.facilityName && (
                        <span className="text-xs text-sage font-body">· {ev.facilityName}</span>
                      )}
                      {ev.location && (
                        <a
                          href={`https://maps.google.com/?q=${ev.location.lat},${ev.location.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-warm-brown hover:underline font-body"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                          </svg>
                          Map
                        </a>
                      )}
                    </div>
                  </div>

                  <span className="font-mono text-sm text-near-black flex-shrink-0">
                    {formatTimeET(ev.time)}
                  </span>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-tan/40 flex items-center justify-between">
                <span className="text-xs text-sage font-body">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, events.length)} of{' '}
                  {events.length} events
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
