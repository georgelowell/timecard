'use client';

import { useState } from 'react';
import { Timecard } from '@/types';

interface EnrichedTimecard extends Timecard {
  employeeName: string;
  facilityName: string;
  employeeEmail?: string;
}

interface Props {
  data: {
    activeTimecards: EnrichedTimecard[];
    pending: EnrichedTimecard[];
    facilities: { id: string; name: string }[];
  };
}

export default function ManagerOverview({ data }: Props) {
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [pendingList, setPendingList] = useState(data.pending);

  async function approve(timecardId: string) {
    setApprovingId(timecardId);
    try {
      const res = await fetch('/api/approve-remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timecardId }),
      });
      if (res.ok) setPendingList(prev => prev.filter(p => p.id !== timecardId));
    } finally {
      setApprovingId(null);
    }
  }

  const checkedIn = data.activeTimecards.filter(tc => tc.status === 'checked-in');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-black text-near-black">Today</h1>
        <p className="text-sage text-sm font-body mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-tan shadow-card p-4 text-center">
          <p className="text-3xl font-display font-black text-warm-brown">{checkedIn.length}</p>
          <p className="text-xs text-sage font-body mt-1 uppercase tracking-wide">On the clock</p>
        </div>
        <div className="bg-white rounded-lg border border-tan shadow-card p-4 text-center">
          <p className="text-3xl font-display font-black text-near-black">{pendingList.length}</p>
          <p className="text-xs text-sage font-body mt-1 uppercase tracking-wide">Pending</p>
        </div>
        <div className="bg-white rounded-lg border border-tan shadow-card p-4 text-center">
          <p className="text-3xl font-display font-black text-near-black">{data.facilities.length}</p>
          <p className="text-xs text-sage font-body mt-1 uppercase tracking-wide">Facilities</p>
        </div>
      </div>

      {/* Pending remote approvals */}
      {pendingList.length > 0 && (
        <div className="bg-tan/10 border border-tan rounded-lg p-4">
          <h2 className="font-display font-bold text-near-black mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-warm-brown" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Waiting on approval
          </h2>
          <div className="space-y-2">
            {pendingList.map(tc => (
              <div key={tc.id} className="bg-white rounded-lg border border-tan p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-near-black text-sm">{tc.employeeName}</p>
                  <p className="text-xs text-sage font-mono mt-0.5">
                    {tc.employeeEmail} · {new Date(tc.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button
                  onClick={() => approve(tc.id)}
                  disabled={approvingId === tc.id}
                  className="bg-warm-brown text-off-white px-4 py-2 rounded-lg text-sm font-display font-bold
                             hover:opacity-90 disabled:opacity-40 transition-opacity flex-shrink-0"
                >
                  {approvingId === tc.id ? 'Approving...' : 'Approve'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Currently clocked in */}
      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-tan/40">
          <h2 className="font-display font-bold text-near-black">On the clock</h2>
        </div>
        {checkedIn.length === 0 ? (
          <p className="px-4 py-6 text-sage text-center text-sm font-body">Nobody on the clock.</p>
        ) : (
          <div className="divide-y divide-tan/30">
            {checkedIn.map(tc => {
              const elapsed = (Date.now() - new Date(tc.checkInTime).getTime()) / (1000 * 60 * 60);
              return (
                <div key={tc.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-display font-bold text-near-black text-sm">{tc.employeeName}</p>
                    <p className="text-xs text-sage font-body mt-0.5">
                      {tc.facilityName} · since {new Date(tc.checkInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      {tc.remote && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 bg-tan/30 text-warm-brown rounded font-display font-bold">Remote</span>
                      )}
                    </p>
                  </div>
                  <span className="text-sm font-display font-bold text-warm-brown font-mono">{elapsed.toFixed(1)}h</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
