'use client';

import { useState } from 'react';
import { LeaveBalance, LeaveDate, LeaveType } from '@/types';

interface Props {
  balance: LeaveBalance;
  onClose: () => void;
  onSuccess: () => void;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(y, m - 1, d, 12));
}

function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function sevenDaysAgoStr(): string {
  const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
}

export default function LeaveRequestModal({ balance, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<LeaveType | null>(null);
  const [dates, setDates] = useState<LeaveDate[]>([]);
  const [newDate, setNewDate] = useState('');
  const [newHours, setNewHours] = useState(8);
  const [dateError, setDateError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  const ptoRemaining = (balance.ptoTotal ?? 40) - (balance.ptoUsed ?? 0);
  const sickRemaining = (balance.sickTotal ?? 40) - (balance.sickUsed ?? 0);
  const remaining = type === 'pto' ? ptoRemaining : sickRemaining;
  const totalRequested = dates.reduce((s, d) => s + d.hours, 0);
  const overBalance = totalRequested > remaining;

  function addDate() {
    setDateError('');
    if (!newDate) { setDateError('Please select a date.'); return; }
    const minDate = sevenDaysAgoStr();
    if (newDate < minDate) { setDateError('Date cannot be more than 7 days in the past.'); return; }
    if (dates.find(d => d.date === newDate)) { setDateError('Date already added.'); return; }
    setDates(prev => [...prev, { date: newDate, hours: newHours }].sort((a, b) => a.date.localeCompare(b.date)));
    setNewDate('');
    setNewHours(8);
  }

  function removeDate(date: string) {
    setDates(prev => prev.filter(d => d.date !== date));
  }

  function updateHours(date: string, hours: number) {
    setDates(prev => prev.map(d => d.date === date ? { ...d, hours } : d));
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/leave/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, dates }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error || 'Submission failed.'); setSubmitting(false); return; }
      setDone(true);
    } catch {
      setSubmitError('Submission failed. Please try again.');
      setSubmitting(false);
    }
  }

  const inputClass =
    'bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-warm-brown';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-near-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl border border-tan shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-tan/40">
          <h2 className="font-display font-black text-near-black text-lg">Request Leave</h2>
          <button onClick={onClose} className="text-sage hover:text-near-black transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5">
          {done ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-sage/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-sage" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-display font-bold text-near-black text-lg mb-2">Request submitted</p>
              <p className="text-sage font-body text-sm">
                Your request has been submitted and is pending manager approval.
              </p>
              <button
                onClick={() => { onSuccess(); onClose(); }}
                className="mt-6 bg-warm-brown text-off-white px-6 py-2 rounded-lg font-display font-bold text-sm hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Step 1 — Type selection */}
              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-xs font-display font-bold text-sage uppercase tracking-widest">
                    Step 1 of 3 — Select type
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {(['pto', 'sick'] as LeaveType[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setType(t)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          type === t
                            ? 'border-warm-brown bg-warm-brown/5'
                            : 'border-tan hover:border-warm-brown/50'
                        }`}
                      >
                        <p className="font-display font-black text-near-black mb-1">
                          {t === 'pto' ? 'PTO' : 'Sick Time'}
                        </p>
                        <p className="text-xs text-sage font-body leading-relaxed">
                          {t === 'pto'
                            ? 'Paid time off — up to 40 hours per year'
                            : 'Sick leave — up to 40 hours per year'}
                        </p>
                        <p className="text-xs font-display font-bold text-warm-brown mt-2">
                          {t === 'pto' ? ptoRemaining : sickRemaining}h remaining
                        </p>
                      </button>
                    ))}
                  </div>
                  <div className="pt-2 flex justify-end">
                    <button
                      disabled={!type}
                      onClick={() => setStep(2)}
                      className="bg-warm-brown text-off-white px-5 py-2 rounded-lg font-display font-bold text-sm
                                 hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2 — Date selection */}
              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-xs font-display font-bold text-sage uppercase tracking-widest">
                    Step 2 of 3 — Select dates
                  </p>

                  {/* Add date row */}
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs text-sage font-body mb-1">Date</label>
                      <input
                        type="date"
                        value={newDate}
                        min={sevenDaysAgoStr()}
                        onChange={e => setNewDate(e.target.value)}
                        className={`${inputClass} w-full`}
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-xs text-sage font-body mb-1">Hours</label>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        step={0.5}
                        value={newHours}
                        onChange={e => setNewHours(Math.min(8, Math.max(1, Number(e.target.value))))}
                        className={`${inputClass} w-full`}
                      />
                    </div>
                    <button
                      onClick={addDate}
                      className="bg-near-black text-off-white px-4 py-2 rounded-lg font-display font-bold text-sm
                                 hover:opacity-90 transition-opacity whitespace-nowrap"
                    >
                      Add
                    </button>
                  </div>
                  {dateError && <p className="text-xs text-red-600 font-body">{dateError}</p>}

                  {/* Added dates */}
                  {dates.length > 0 ? (
                    <div className="space-y-2">
                      {dates.map(d => (
                        <div
                          key={d.date}
                          className="flex items-center gap-3 bg-off-white rounded-lg px-3 py-2"
                        >
                          <span className="flex-1 text-sm font-body text-near-black">
                            {formatDateLabel(d.date)}
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={8}
                            step={0.5}
                            value={d.hours}
                            onChange={e =>
                              updateHours(d.date, Math.min(8, Math.max(1, Number(e.target.value))))
                            }
                            className="w-16 bg-white border border-tan rounded px-2 py-1 text-sm font-mono text-center focus:outline-none focus:ring-1 focus:ring-warm-brown"
                          />
                          <span className="text-xs text-sage font-body">hrs</span>
                          <button
                            onClick={() => removeDate(d.date)}
                            className="text-sage hover:text-near-black transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}

                      <div className="pt-2 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-body text-near-black">
                            <span className="font-display font-bold">Total:</span>{' '}
                            <span className="font-mono">{totalRequested}h</span>
                          </p>
                          <p className="text-xs text-sage font-body mt-0.5">
                            {remaining - totalRequested}h of {type === 'pto' ? 'PTO' : 'sick time'} remaining after this request
                          </p>
                          {overBalance && (
                            <p className="text-xs text-red-600 font-body font-bold mt-1">
                              Exceeds your balance of {remaining}h — reduce hours to submit.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-sage font-body text-center py-4">
                      Add at least one date to continue.
                    </p>
                  )}

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      onClick={() => setStep(1)}
                      className="text-sage text-sm font-body hover:text-near-black transition-colors"
                    >
                      ← Back
                    </button>
                    <button
                      disabled={dates.length === 0 || overBalance}
                      onClick={() => setStep(3)}
                      className="bg-warm-brown text-off-white px-5 py-2 rounded-lg font-display font-bold text-sm
                                 hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                      Review
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3 — Review & submit */}
              {step === 3 && (
                <div className="space-y-4">
                  <p className="text-xs font-display font-bold text-sage uppercase tracking-widest">
                    Step 3 of 3 — Review and submit
                  </p>

                  <div className="bg-off-white rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-display font-bold text-sage uppercase tracking-widest">
                        Type
                      </span>
                      <span className="font-display font-bold text-near-black text-sm">
                        {type === 'pto' ? 'PTO' : 'Sick Time'}
                      </span>
                    </div>
                    <div className="border-t border-tan/40 pt-3">
                      <p className="text-xs font-display font-bold text-sage uppercase tracking-widest mb-2">
                        Dates
                      </p>
                      {dates.map(d => (
                        <div key={d.date} className="flex justify-between text-sm py-0.5">
                          <span className="font-body text-near-black">{formatDateLabel(d.date)}</span>
                          <span className="font-mono text-near-black">{d.hours}h</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-tan/40 pt-3 flex justify-between">
                      <span className="font-display font-bold text-near-black text-sm">Total</span>
                      <span className="font-mono font-bold text-warm-brown">{totalRequested}h</span>
                    </div>
                  </div>

                  {submitError && (
                    <p className="text-sm font-body text-near-black bg-tan/20 border border-tan rounded-lg px-3 py-2">
                      {submitError}
                    </p>
                  )}

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      onClick={() => setStep(2)}
                      className="text-sage text-sm font-body hover:text-near-black transition-colors"
                    >
                      ← Back
                    </button>
                    <button
                      disabled={submitting}
                      onClick={submit}
                      className="bg-warm-brown text-off-white px-6 py-2 rounded-lg font-display font-bold text-sm
                                 hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                      {submitting ? 'Submitting...' : 'Submit request'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
