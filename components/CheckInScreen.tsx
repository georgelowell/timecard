'use client';

import { useState, useEffect } from 'react';
import { Timecard, GeoLocation } from '@/types';

interface Props {
  facilityId: string;
  facilityName: string;
  onCheckedIn: (timecard: Timecard) => void;
}

type LocStatus = 'pending' | 'captured' | 'unavailable';

export default function CheckInScreen({ facilityId, facilityName, onCheckedIn }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locStatus, setLocStatus] = useState<LocStatus>('pending');
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const now = new Date();

  useEffect(() => {
    if (!navigator?.geolocation) { setLocStatus('unavailable'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: new Date().toISOString(),
        });
        setLocStatus('captured');
      },
      () => setLocStatus('unavailable'),
      { timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  async function handleCheckIn(remote: boolean) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facilityId, remote, checkInLocation: location }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed');
      onCheckedIn({
        id: data.timecardId,
        employeeId: '',
        facilityId,
        checkInTime: now.toISOString(),
        remote,
        status: data.status,
        createdAt: now.toISOString(),
        ...(location ? { checkInLocation: location } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-tan shadow-card p-8 w-full">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-tan/20 rounded-lg flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-warm-brown" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-xs font-display font-bold text-sage uppercase tracking-widest mb-1">
            Check in
          </p>
          <h2 className="text-xl font-display font-bold text-near-black">{facilityName}</h2>
        </div>

        {/* Time display */}
        <div className="border border-tan rounded-lg p-4 mb-8 text-center bg-off-white">
          <p className="text-3xl font-display font-black text-near-black">
            {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-sm text-sage font-body mt-1">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-near-black text-off-white rounded-lg text-sm font-body">
            {error}
          </div>
        )}

        {/* Primary action */}
        <button
          onClick={() => handleCheckIn(false)}
          disabled={loading}
          className="w-full bg-warm-brown text-off-white py-4 rounded-lg font-display font-bold text-base
                     hover:opacity-90 transition-opacity disabled:opacity-40 mb-3"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-off-white/50 border-t-off-white rounded-full animate-spin" />
              Clocking in...
            </span>
          ) : 'Clock in'}
        </button>

        {/* Remote action */}
        <button
          onClick={() => handleCheckIn(true)}
          disabled={loading}
          className="w-full border border-sage text-sage py-4 rounded-lg font-display font-bold text-base
                     hover:border-warm-brown hover:text-warm-brown transition-colors disabled:opacity-40"
        >
          Working remote
        </button>

        <p className="text-xs text-sage/70 text-center mt-4 font-body">
          Remote shifts need manager approval
        </p>

        {/* Location indicator */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-xs font-body">
          {locStatus === 'pending' && (
            <span className="text-sage flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-sage/40 border-t-sage rounded-full animate-spin" />
              Getting location...
            </span>
          )}
          {locStatus === 'captured' && (
            <span className="text-warm-brown flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              Location saved
            </span>
          )}
          {locStatus === 'unavailable' && (
            <span className="text-sage/60 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
              </svg>
              No location
            </span>
          )}
        </div>

    </div>
  );
}
