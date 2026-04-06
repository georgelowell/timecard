'use client';

import { useSession, signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import CheckInScreen from '@/components/CheckInScreen';
import CheckOutScreen from '@/components/CheckOutScreen';
import { Timecard } from '@/types';

// ─── Client-side ET helpers (Intl API only) ───────────────────────────────────

function formatTimeET(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoString));
}

function formatDayTimeET(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoString));
}

function getTodayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function isTodayET(isoString: string): boolean {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
  return fmt.format(new Date(isoString)) === fmt.format(new Date());
}

function forgotCheckOutLabel(isoString: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
  const yesterday = fmt.format(new Date(Date.now() - 86400000));
  if (fmt.format(new Date(isoString)) === yesterday) return 'yesterday';
  return `on ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }).format(new Date(isoString))}`;
}

// ─── Status strip ─────────────────────────────────────────────────────────────

function useElapsed(checkInTime: string | undefined): string {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!checkInTime) return;
    function compute() {
      const ms = Date.now() - new Date(checkInTime!).getTime();
      const totalMins = Math.floor(ms / 60000);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      setElapsed(h > 0 ? `${h}h ${m}m` : `${m}m`);
    }
    compute();
    const id = setInterval(compute, 30000);
    return () => clearInterval(id);
  }, [checkInTime]);
  return elapsed;
}

function StatusStrip({
  onClock,
  checkInTime,
  lastCheckout,
}: {
  onClock: boolean;
  checkInTime?: string;
  lastCheckout?: { checkOutTime: string } | null;
}) {
  const elapsed = useElapsed(onClock ? checkInTime : undefined);

  if (onClock) {
    return (
      <div className="bg-white border border-tan rounded-lg px-4 py-3 shadow-card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-sage flex-shrink-0" />
          <div>
            <p className="font-display font-black text-near-black leading-tight">On the clock</p>
            {checkInTime && (
              <p className="text-xs text-sage font-body mt-0.5">
                Since {formatTimeET(checkInTime)} ET
              </p>
            )}
          </div>
        </div>
        {elapsed && (
          <span className="font-mono font-bold text-near-black tabular-nums">{elapsed}</span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-tan rounded-lg px-4 py-3 shadow-card flex items-center gap-3">
      <div className="w-2.5 h-2.5 rounded-full bg-tan flex-shrink-0" />
      <div>
        <p className="font-display font-black text-near-black leading-tight">Off the clock</p>
        {lastCheckout ? (
          <p className="text-xs text-sage font-body mt-0.5">
            Last clocked out {formatDayTimeET(lastCheckout.checkOutTime)} ET
          </p>
        ) : (
          <p className="text-xs text-sage font-body mt-0.5">No previous shifts on record</p>
        )}
      </div>
    </div>
  );
}

// ─── Shared layout wrappers ───────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-off-white">
      <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** Full-page centered card for terminal / error states. */
function FullCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-off-white p-8">
      <div className="bg-white rounded-lg border border-tan shadow-card p-8 w-full max-w-sm text-center">
        {children}
      </div>
    </div>
  );
}

/** Full-page layout for interactive states: status strip at top, action card below. */
function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-off-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-3">
        {children}
      </div>
    </div>
  );
}

// ─── Flow components (card content only — no full-page wrapper) ───────────────

/** Feature 4: already clocked in — confirm before checkout. */
function AlreadyCheckedInConfirm({
  onProceed,
  onDismiss,
}: {
  onProceed: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-tan shadow-card p-8 w-full text-center">
      <h2 className="text-xl font-display font-black text-near-black mb-2">Ready to clock out?</h2>
      <p className="text-sage text-sm font-body mb-6">
        Tap below to clock out and log your time.
      </p>
      <div className="space-y-3">
        <button
          onClick={onProceed}
          className="w-full bg-warm-brown text-off-white py-3 rounded-lg font-display font-bold
                     hover:opacity-90 transition-opacity"
        >
          Clock out
        </button>
        <button
          onClick={onDismiss}
          className="w-full border border-tan text-sage py-3 rounded-lg font-display font-bold
                     hover:text-near-black transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

/** Feature 5: open shift from a previous day — close it. */
function ForgotClockOut({
  timecard,
  onClosed,
  onSkip,
}: {
  timecard: Timecard;
  onClosed: () => void;
  onSkip: () => void;
}) {
  const checkInDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(new Date(timecard.checkInTime));

  const [checkOutTimeET, setCheckOutTimeET] = useState(`${checkInDate}T17:00`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleClose() {
    setSubmitting(true);
    setError('');
    const res = await fetch('/api/close-shift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timecardId: timecard.id, checkOutTimeET }),
    });
    setSubmitting(false);
    if (!res.ok) { setError((await res.json()).error || 'Something went wrong.'); return; }
    onClosed();
  }

  return (
    <div className="bg-white rounded-lg border border-tan shadow-card p-8 w-full">
      <h2 className="text-xl font-display font-black text-near-black mb-2">
        Forgot to clock out?
      </h2>
      <p className="text-sage text-sm font-body mb-6">
        You clocked in {forgotCheckOutLabel(timecard.checkInTime)} at{' '}
        {formatTimeET(timecard.checkInTime)} ET and never clocked out.
        Enter the time you finished.
      </p>

      <div className="mb-4">
        <label className="block text-xs font-display font-bold text-sage uppercase tracking-widest mb-1.5">
          Clock-out time (Eastern Time)
        </label>
        <input
          type="datetime-local"
          value={checkOutTimeET}
          onChange={e => setCheckOutTimeET(e.target.value)}
          className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-mono
                     focus:outline-none focus:ring-2 focus:ring-warm-brown"
        />
      </div>

      {error && <p className="text-xs text-red-600 font-body mb-3">{error}</p>}

      <div className="space-y-3">
        <button
          onClick={handleClose}
          disabled={submitting}
          className="w-full bg-warm-brown text-off-white py-3 rounded-lg font-display font-bold
                     hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {submitting ? 'Saving...' : 'Save clock-out time'}
        </button>
        <button
          onClick={onSkip}
          className="w-full border border-tan text-sage py-3 rounded-lg font-display font-bold
                     hover:text-near-black transition-colors text-sm"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

/** Feature 3: already completed a shift today — offer to log missed clock-in. */
function AlreadyCheckedOut({
  lastCheckoutId,
  lastCheckoutTime,
  facilityId,
  onManualEntryDone,
  onDismiss,
}: {
  lastCheckoutId: string;
  lastCheckoutTime: string;
  facilityId: string;
  onManualEntryDone: () => void;
  onDismiss: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const todayStr = getTodayET();
  const [checkInTimeET, setCheckInTimeET] = useState(`${todayStr}T08:00`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    const res = await fetch('/api/manual-check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facilityId, checkInTimeET, linkedCheckoutTimecardId: lastCheckoutId }),
    });
    setSubmitting(false);
    if (!res.ok) { setError((await res.json()).error || 'Something went wrong.'); return; }
    onManualEntryDone();
  }

  if (showForm) {
    return (
      <div className="bg-white rounded-lg border border-tan shadow-card p-8 w-full">
        <button
          onClick={() => setShowForm(false)}
          className="text-sage hover:text-near-black text-sm font-body mb-4 flex items-center gap-1 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h2 className="text-xl font-display font-black text-near-black mb-2">Log start time</h2>
        <p className="text-sage text-sm font-body mb-1">
          Your shift ended at{' '}
          <span className="font-display font-bold text-near-black">{formatTimeET(lastCheckoutTime)} ET</span>.
        </p>
        <p className="text-sage text-sm font-body mb-6">When did you start today?</p>

        <div className="mb-4">
          <label className="block text-xs font-display font-bold text-sage uppercase tracking-widest mb-1.5">
            Clock-in time (Eastern Time)
          </label>
          <input
            type="datetime-local"
            value={checkInTimeET}
            max={`${todayStr}T23:59`}
            onChange={e => setCheckInTimeET(e.target.value)}
            className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-mono
                       focus:outline-none focus:ring-2 focus:ring-warm-brown"
          />
        </div>

        {error && <p className="text-xs text-red-600 font-body mb-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-warm-brown text-off-white py-3 rounded-lg font-display font-bold
                     hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {submitting ? 'Saving...' : 'Save clock-in time'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-tan shadow-card p-8 w-full text-center">
      <h2 className="text-xl font-display font-black text-near-black mb-2">
        Forgot to log your start time?
      </h2>
      <p className="text-sage text-sm font-body mb-6">
        You can add the time you clocked in if you missed it.
      </p>
      <div className="space-y-3">
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-warm-brown text-off-white py-3 rounded-lg font-display font-bold
                     hover:opacity-90 transition-opacity"
        >
          Add missed clock-in
        </button>
        <button
          onClick={onDismiss}
          className="w-full border border-tan text-sage py-3 rounded-lg font-display font-bold
                     hover:text-near-black transition-colors text-sm"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── Main Scan Content ────────────────────────────────────────────────────────

type ScanState =
  | 'loading'
  | 'facilityNotFound'
  | 'checkIn'
  | 'checkInDone'
  | 'confirmCheckOut'
  | 'checkOut'
  | 'forgotCheckOut'
  | 'alreadyCheckedOut'
  | 'checkoutDone'
  | 'undoDone'
  | 'manualEntryDone'
  | 'shiftClosedDone';

function ScanContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const facilityId = searchParams.get('facility') || '';

  const [scanState, setScanState] = useState<ScanState>('loading');
  const [currentTimecard, setCurrentTimecard] = useState<Timecard | null>(null);
  const [lastCheckout, setLastCheckout] = useState<{
    id: string;
    checkOutTime: string;
    checkInTime: string;
  } | null>(null);
  const [facilityName, setFacilityName] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      signIn('google', { callbackUrl: `/scan?facility=${facilityId}` });
    }
  }, [status, facilityId]);

  useEffect(() => {
    if (status !== 'authenticated' || !facilityId) return;

    async function load() {
      try {
        const [fRes, statusRes] = await Promise.all([
          fetch(`/api/facilities?id=${facilityId}`),
          fetch('/api/checkin'),
        ]);

        if (!fRes.ok) { setScanState('facilityNotFound'); return; }
        const fData = await fRes.json();
        if (!fData.facility) { setScanState('facilityNotFound'); return; }
        setFacilityName(fData.facility.name);

        const data = await statusRes.json();

        // Always store lastCheckout so the status strip can show it
        if (data.lastCheckout) setLastCheckout(data.lastCheckout);

        if (data.checkedIn && data.timecard) {
          setCurrentTimecard(data.timecard);
          setScanState('confirmCheckOut');
        } else if (data.openShiftFromPreviousDay) {
          setCurrentTimecard(data.openShiftFromPreviousDay);
          setScanState('forgotCheckOut');
        } else if (data.lastCheckout && isTodayET(data.lastCheckout.checkOutTime)) {
          setScanState('alreadyCheckedOut');
        } else {
          setScanState('checkIn');
        }
      } catch (err) {
        console.error(err);
        setScanState('checkIn');
      }
    }

    load();
  }, [status, facilityId]);

  if (status === 'loading' || status === 'unauthenticated' || scanState === 'loading') {
    return <Spinner />;
  }

  // ── Terminal / full-page states ───────────────────────────────────────────

  if (scanState === 'facilityNotFound') {
    return (
      <FullCard>
        <div className="w-14 h-14 bg-tan/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-warm-brown" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-display font-bold text-near-black mb-2">Facility not found</h2>
        <p className="text-sage text-sm font-body">
          This QR code isn&apos;t valid anymore. Ask your manager for a new one.
        </p>
      </FullCard>
    );
  }

  if (scanState === 'checkInDone') {
    return (
      <FullCard>
        <div className="w-14 h-14 bg-sage/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-display font-bold text-near-black mb-2">You&apos;re clocked in.</h2>
        <p className="text-sage text-sm font-body mb-6">
          {facilityName && <>At {facilityName}. </>}Have a great shift.
        </p>
        <button onClick={() => window.location.href = '/dashboard'}
          className="w-full bg-warm-brown text-off-white py-3 rounded-lg font-display font-bold hover:opacity-90 transition-opacity">
          View my hours
        </button>
      </FullCard>
    );
  }

  if (scanState === 'checkoutDone') {
    return (
      <FullCard>
        <div className="w-14 h-14 bg-tan/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-warm-brown" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-display font-bold text-near-black mb-2">All done.</h2>
        <p className="text-sage text-sm font-body mb-6">See you next time.</p>
        <button onClick={() => window.location.href = '/dashboard'}
          className="w-full bg-warm-brown text-off-white py-3 rounded-lg font-display font-bold hover:opacity-90 transition-opacity">
          View my hours
        </button>
      </FullCard>
    );
  }

  if (scanState === 'undoDone') {
    return (
      <FullCard>
        <div className="w-14 h-14 bg-sage/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-display font-bold text-near-black mb-2">Clocked back in.</h2>
        <p className="text-sage text-sm font-body mb-6">You&apos;re on the clock.</p>
        <button onClick={() => window.location.href = '/dashboard'}
          className="w-full bg-warm-brown text-off-white py-3 rounded-lg font-display font-bold hover:opacity-90 transition-opacity">
          View my hours
        </button>
      </FullCard>
    );
  }

  if (scanState === 'manualEntryDone') {
    return (
      <FullCard>
        <div className="w-14 h-14 bg-sage/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-display font-bold text-near-black mb-2">Clock-in saved.</h2>
        <p className="text-sage text-sm font-body mb-6">Your hours have been recorded.</p>
        <button onClick={() => window.location.href = '/dashboard'}
          className="w-full bg-warm-brown text-off-white py-3 rounded-lg font-display font-bold hover:opacity-90 transition-opacity">
          View my hours
        </button>
      </FullCard>
    );
  }

  if (scanState === 'shiftClosedDone') {
    return (
      <FullCard>
        <div className="w-14 h-14 bg-sage/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-display font-bold text-near-black mb-2">Shift closed.</h2>
        <p className="text-sage text-sm font-body mb-6">Your previous shift has been recorded.</p>
        <button onClick={() => setScanState('checkIn')}
          className="w-full bg-warm-brown text-off-white py-3 rounded-lg font-display font-bold hover:opacity-90 transition-opacity mb-3">
          Clock in now
        </button>
        <button onClick={() => window.location.href = '/dashboard'}
          className="w-full border border-tan text-sage py-3 rounded-lg font-display font-bold hover:text-near-black transition-colors text-sm">
          View my hours
        </button>
      </FullCard>
    );
  }

  // ── Checkout flow ──────────────────────────────────────────────────────────
  if (scanState === 'checkOut' && currentTimecard) {
    return (
      <CheckOutScreen
        timecard={currentTimecard}
        onComplete={() => setScanState('checkoutDone')}
        onUndo={() => setScanState('undoDone')}
      />
    );
  }

  // ── Interactive states — status strip always visible at top ───────────────

  if (scanState === 'confirmCheckOut' && currentTimecard) {
    return (
      <ScanLayout>
        <StatusStrip onClock={true} checkInTime={currentTimecard.checkInTime} />
        <AlreadyCheckedInConfirm
          onProceed={() => setScanState('checkOut')}
          onDismiss={() => window.location.href = '/dashboard'}
        />
      </ScanLayout>
    );
  }

  if (scanState === 'forgotCheckOut' && currentTimecard) {
    return (
      <ScanLayout>
        <StatusStrip onClock={true} checkInTime={currentTimecard.checkInTime} />
        <ForgotClockOut
          timecard={currentTimecard}
          onClosed={() => setScanState('shiftClosedDone')}
          onSkip={() => setScanState('checkIn')}
        />
      </ScanLayout>
    );
  }

  if (scanState === 'alreadyCheckedOut' && lastCheckout) {
    return (
      <ScanLayout>
        <StatusStrip onClock={false} lastCheckout={lastCheckout} />
        <AlreadyCheckedOut
          lastCheckoutId={lastCheckout.id}
          lastCheckoutTime={lastCheckout.checkOutTime}
          facilityId={facilityId}
          onManualEntryDone={() => setScanState('manualEntryDone')}
          onDismiss={() => window.location.href = '/dashboard'}
        />
      </ScanLayout>
    );
  }

  // ── Normal check-in ────────────────────────────────────────────────────────
  return (
    <ScanLayout>
      <StatusStrip onClock={false} lastCheckout={lastCheckout} />
      <CheckInScreen
        facilityId={facilityId}
        facilityName={facilityName}
        onCheckedIn={timecard => {
          setCurrentTimecard(timecard);
          setScanState('checkInDone');
        }}
      />
    </ScanLayout>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ScanContent />
    </Suspense>
  );
}
