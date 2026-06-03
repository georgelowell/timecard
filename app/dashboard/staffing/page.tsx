'use client';

import { useState, useEffect, useCallback } from 'react';
import { StaffingWorker, Facility, TaxonomyNode, RecentFunction } from '@/types';

// ── Types ───────────────────────────────────────────────────────────────────────

interface ActiveShift {
  id: string;
  staffingWorkerId: string;
  staffingWorkerName: string;
  facilityId: string;
  facilityName: string;
  checkInTime: string;
  loggedByName: string;
}

interface SelectedFunction {
  functionId: string;
  functionName: string;
  percentage: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function etNow(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date()).replace(', ', 'T');
}

function etTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function elapsedHoursSince(iso: string): number {
  return Math.round(((Date.now() - new Date(iso).getTime()) / 3600000) * 100) / 100;
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function StaffingPage() {
  // Data
  const [workers, setWorkers] = useState<StaffingWorker[]>([]);
  const [activeShifts, setActiveShifts] = useState<ActiveShift[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [taxonomy, setTaxonomy] = useState<TaxonomyNode[]>([]);
  const [loading, setLoading] = useState(true);

  // Clock-in state
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<string>>(new Set());
  const [clockInTime, setClockInTime] = useState(etNow());
  const [clockInFacility, setClockInFacility] = useState('');
  const [clockingIn, setClockingIn] = useState(false);

  // Clock-out modal state
  const [clockOutShift, setClockOutShift] = useState<ActiveShift | null>(null);
  const [clockOutTime, setClockOutTime] = useState('');
  const [allocations, setAllocations] = useState<SelectedFunction[]>([]);
  const [recentFunctions, setRecentFunctions] = useState<RecentFunction[]>([]);
  const [lastShift, setLastShift] = useState<SelectedFunction[] | null>(null);
  const [clockingOut, setClockingOut] = useState(false);

  // Worker management state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingWorker, setEditingWorker] = useState<StaffingWorker | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  // Messages
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── Load data ─────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [wRes, aRes, fRes, tRes] = await Promise.all([
        fetch('/api/staffing/workers'),
        fetch('/api/staffing/active'),
        fetch('/api/facilities'),
        fetch('/api/categories'),
      ]);
      const [wData, aData, fData, tData] = await Promise.all([
        wRes.json(),
        aRes.json(),
        fRes.json(),
        tRes.json(),
      ]);
      setWorkers(wData.workers || []);
      setActiveShifts(aData.timecards || []);
      setFacilities((fData.facilities || []).filter((f: Facility) => f.active));

      if (tData.taxonomy) {
        // fetch functions for each category
        const fnRes = await fetch('/api/functions');
        const fnData = await fnRes.json();
        const functions = fnData.functions || [];
        const taxonomyNodes: TaxonomyNode[] = (tData.taxonomy || []).map((cat: { id: string; name: string; order: number; active: boolean }) => ({
          ...cat,
          functions: functions.filter((f: { categoryId: string }) => f.categoryId === cat.id),
        }));
        setTaxonomy(taxonomyNodes);
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh elapsed times every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveShifts(prev => [...prev]); // force re-render for elapsed times
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Worker selection ──────────────────────────────────────────────────────────

  function toggleWorker(id: string) {
    setSelectedWorkerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 4) {
        next.add(id);
      }
      return next;
    });
    setError('');
  }

  // ── Clock In ──────────────────────────────────────────────────────────────────

  async function handleClockIn() {
    if (selectedWorkerIds.size === 0) {
      setError('Select at least one worker');
      return;
    }
    if (!clockInFacility) {
      setError('Select a facility');
      return;
    }
    if (!clockInTime) {
      setError('Set a clock-in time');
      return;
    }

    setClockingIn(true);
    setError('');
    try {
      const res = await fetch('/api/staffing/clockin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerIds: [...selectedWorkerIds],
          facilityId: clockInFacility,
          clockInTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Clock in failed');

      setSuccess('Workers clocked in successfully');
      setSelectedWorkerIds(new Set());
      setClockInTime(etNow());
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clock in failed');
    } finally {
      setClockingIn(false);
    }
  }

  // ── Clock Out Modal ───────────────────────────────────────────────────────────

  async function openClockOut(shift: ActiveShift) {
    setClockOutShift(shift);
    setClockOutTime(etNow());
    setAllocations([]);
    setError('');

    // Load recent functions for this staffing worker
    try {
      const res = await fetch(`/api/recent-functions?staffingWorkerId=${shift.staffingWorkerId}`);
      const data = await res.json();
      setRecentFunctions(data.recent || []);
      setLastShift(data.lastShift || null);
    } catch {
      setRecentFunctions([]);
      setLastShift(null);
    }
  }

  function closeClockOut() {
    setClockOutShift(null);
    setClockOutTime('');
    setAllocations([]);
  }

  function handleSelectFunction(fn: { id: string; name: string }) {
    setAllocations(prev => {
      if (prev.some(a => a.functionId === fn.id)) return prev;
      return [...prev, { functionId: fn.id, functionName: fn.name, percentage: 0 }];
    });
  }

  function handleRemoveAllocation(functionId: string) {
    setAllocations(prev => prev.filter(a => a.functionId !== functionId));
  }

  function handleAllocationChange(newAllocs: { functionId: string; functionName: string; percentage: number }[]) {
    setAllocations(newAllocs);
  }

  function handleSameAsLastTime(fns: { functionId: string; functionName: string; percentage: number }[]) {
    setAllocations(fns);
  }

  async function submitClockOut() {
    if (!clockOutShift || !clockOutTime) return;

    const total = allocations.reduce((s, a) => s + a.percentage, 0);
    if (Math.abs(total - 100) > 0.5) {
      setError('Allocations must sum to 100%');
      return;
    }
    if (allocations.length === 0) {
      setError('Add at least one function');
      return;
    }

    setClockingOut(true);
    setError('');
    try {
      const res = await fetch('/api/staffing/clockout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timecardId: clockOutShift.id,
          clockOutTime,
          allocations: allocations.map(a => ({
            functionId: a.functionId,
            functionName: a.functionName,
            percentage: a.percentage,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Clock out failed');

      setSuccess(`${clockOutShift.staffingWorkerName} clocked out (${data.totalHours}h)`);
      closeClockOut();
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clock out failed');
    } finally {
      setClockingOut(false);
    }
  }

  // ── Worker Management ─────────────────────────────────────────────────────────

  async function handleAddWorker() {
    if (!newWorkerName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/staffing/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWorkerName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      setShowAddModal(false);
      setNewWorkerName('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add worker');
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleActive(worker: StaffingWorker) {
    try {
      const res = await fetch(`/api/staffing/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !worker.active }),
      });
      if (!res.ok) throw new Error('Failed');
      await loadData();
    } catch {
      setError('Failed to update worker');
    }
  }

  function openEdit(worker: StaffingWorker) {
    setEditingWorker(worker);
    setEditName(worker.name);
  }

  async function handleSaveEdit() {
    if (!editingWorker || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/staffing/workers/${editingWorker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      setEditingWorker(null);
      await loadData();
    } catch {
      setError('Failed to update worker');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(worker: StaffingWorker) {
    if (!confirm(`Remove "${worker.name}"? They will be deactivated.`)) return;
    try {
      const res = await fetch(`/api/staffing/workers/${worker.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      await loadData();
    } catch {
      setError('Failed to delete worker');
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  const activeWorkers = workers.filter(w => w.active);
  const selectedWorkers = workers.filter(w => selectedWorkerIds.has(w.id));

  const MIN_PCT = 5;

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── JSX ───────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <h1 className="text-2xl font-display font-black text-near-black">Staffing</h1>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm font-body">{error}</div>
      )}
      {success && (
        <div className="bg-sage/20 border border-sage text-sage px-4 py-3 rounded-lg text-sm font-body">{success}</div>
      )}

      {/* ── Section 1: Clock In Panel ─────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-tan/40">
          <h2 className="font-display font-bold text-near-black">Clock In Staffing Workers</h2>
        </div>
        <div className="p-4 space-y-4">
          {/* Worker selection cards */}
          <div>
            <p className="text-xs font-display font-bold text-sage uppercase tracking-widest mb-3">
              Select Workers ({selectedWorkerIds.size}/4)
            </p>
            {activeWorkers.length === 0 ? (
              <p className="text-sm text-sage font-body">No active staffing workers. Add one below.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {activeWorkers.map(worker => {
                  const isSelected = selectedWorkerIds.has(worker.id);
                  const isClockedIn = activeShifts.some(s => s.staffingWorkerId === worker.id);
                  return (
                    <button
                      key={worker.id}
                      onClick={() => !isClockedIn && toggleWorker(worker.id)}
                      disabled={isClockedIn}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        isClockedIn
                          ? 'bg-off-white border-tan/40 opacity-60 cursor-not-allowed'
                          : isSelected
                            ? 'bg-tan/10 border-warm-brown'
                            : 'bg-white border-tan hover:border-warm-brown'
                      }`}
                    >
                      <p className="font-display font-bold text-near-black text-sm">{worker.name}</p>
                      {isClockedIn ? (
                        <p className="text-xs text-warm-brown font-body mt-1">On shift</p>
                      ) : isSelected ? (
                        <p className="text-xs text-warm-brown font-body mt-1">Selected</p>
                      ) : (
                        <p className="text-xs text-sage font-body mt-1">Available</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected summary */}
          {selectedWorkers.length > 0 && (
            <div className="bg-tan/5 rounded-lg p-3 border border-tan/40">
              <p className="text-xs font-display font-bold text-near-black mb-2">Clocking in:</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedWorkers.map(w => (
                  <span key={w.id} className="text-xs bg-warm-brown text-off-white px-2 py-0.5 rounded-full font-display font-bold">
                    {w.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Time and facility */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-sage font-body mb-1">Clock In Time (ET)</label>
              <input
                type="datetime-local"
                value={clockInTime}
                onChange={e => setClockInTime(e.target.value)}
                className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-mono
                           focus:outline-none focus:ring-2 focus:ring-warm-brown"
              />
            </div>
            <div>
              <label className="block text-xs text-sage font-body mb-1">Facility</label>
              <select
                value={clockInFacility}
                onChange={e => setClockInFacility(e.target.value)}
                className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                           focus:outline-none focus:ring-2 focus:ring-warm-brown"
              >
                <option value="">Select facility...</option>
                {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>

          {/* Clock in button */}
          <button
            onClick={handleClockIn}
            disabled={clockingIn || selectedWorkerIds.size === 0}
            className="w-full bg-warm-brown text-off-white py-3 rounded-lg text-sm font-display font-bold
                       hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {clockingIn ? 'Clocking in...' : `Clock In Selected (${selectedWorkerIds.size})`}
          </button>
        </div>
      </div>

      {/* ── Section 2: Clock Out Panel ────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-tan/40">
          <h2 className="font-display font-bold text-near-black">Currently On Shift</h2>
        </div>
        {activeShifts.length === 0 ? (
          <p className="px-4 py-6 text-sage text-center text-sm font-body">No staffing workers on shift.</p>
        ) : (
          <div className="divide-y divide-tan/30">
            {activeShifts.map(shift => {
              const elapsed = elapsedHoursSince(shift.checkInTime);
              return (
                <button
                  key={shift.id}
                  onClick={() => openClockOut(shift)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-off-white transition-colors"
                >
                  <div>
                    <p className="font-display font-bold text-near-black text-sm">{shift.staffingWorkerName}</p>
                    <p className="text-xs text-sage font-body mt-0.5">
                      {shift.facilityName} · since {etTimeLabel(shift.checkInTime)} · by {shift.loggedByName}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-warm-brown text-sm">{elapsed.toFixed(1)}h</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Clock Out Modal ───────────────────────────────────────────────────── */}
      {clockOutShift && (
        <div className="fixed inset-0 bg-near-black/60 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-tan shadow-xl w-full max-w-md mb-10">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-tan/40">
              <div>
                <h3 className="font-display font-bold text-near-black">
                  Clock Out: {clockOutShift.staffingWorkerName}
                </h3>
                <p className="text-xs text-sage font-body mt-0.5">
                  Since {etTimeLabel(clockOutShift.checkInTime)} · {elapsedHoursSince(clockOutShift.checkInTime).toFixed(1)}h elapsed
                </p>
              </div>
              <button
                onClick={closeClockOut}
                className="w-8 h-8 rounded-full border border-tan flex items-center justify-center text-sage hover:text-near-black hover:border-near-black transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Clock out time */}
              <div>
                <label className="block text-xs text-sage font-body mb-1">Clock Out Time (ET)</label>
                <input
                  type="datetime-local"
                  value={clockOutTime}
                  onChange={e => setClockOutTime(e.target.value)}
                  className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-warm-brown"
                />
              </div>

              {/* Recent functions */}
              {recentFunctions.length > 0 && (
                <div>
                  <p className="text-xs font-display font-bold text-sage uppercase tracking-widest mb-2">Recent</p>
                  {lastShift && lastShift.length > 0 && (
                    <button
                      onClick={() => handleSameAsLastTime(lastShift)}
                      className="w-full mb-2 flex items-center justify-center gap-2 bg-near-black text-off-white
                                 py-2.5 rounded-lg font-display font-bold text-sm hover:opacity-90 transition-opacity"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Same as last time
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    {recentFunctions.slice(0, 6).map(fn => {
                      const isSelected = allocations.some(a => a.functionId === fn.functionId);
                      return (
                        <button
                          key={fn.functionId}
                          onClick={() => !isSelected && handleSelectFunction({ id: fn.functionId, name: fn.functionName })}
                          disabled={isSelected}
                          className={`p-2 rounded-lg border text-left text-xs transition-colors ${
                            isSelected
                              ? 'bg-tan/20 border-tan'
                              : 'bg-white border-tan hover:border-warm-brown'
                          }`}
                        >
                          <p className="font-display font-bold text-near-black">{fn.functionName}</p>
                          <p className="text-sage font-body mt-0.5">{fn.categoryName} · {fn.lastUsedPercentage}%</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Browse categories */}
              <div>
                <p className="text-xs font-display font-bold text-sage uppercase tracking-widest mb-2">Browse by Category</p>
                <div className="border border-tan rounded-lg divide-y divide-tan/30 max-h-48 overflow-y-auto">
                  {taxonomy.map(cat => (
                    <details key={cat.id} className="group">
                      <summary className="px-3 py-2 font-display font-bold text-near-black text-sm cursor-pointer hover:bg-off-white transition-colors list-none flex items-center justify-between">
                        {cat.name}
                        <svg className="w-3.5 h-3.5 text-sage group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </summary>
                      {cat.functions.map(fn => {
                        const isSelected = allocations.some(a => a.functionId === fn.id);
                        return (
                          <button
                            key={fn.id}
                            onClick={() => !isSelected && handleSelectFunction({ id: fn.id, name: fn.name })}
                            disabled={isSelected}
                            className={`w-full flex items-center justify-between px-5 py-2 text-left text-sm font-body ${
                              isSelected
                                ? 'text-warm-brown bg-tan/10'
                                : 'text-near-black hover:bg-tan/10'
                            }`}
                          >
                            {fn.name}
                            {isSelected && (
                              <svg className="w-4 h-4 text-warm-brown" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </details>
                  ))}
                </div>
              </div>

              {/* Allocation sliders */}
              {allocations.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-display font-bold text-near-black uppercase tracking-widest">Allocation</p>
                    <span className={`text-sm font-display font-bold ${
                      Math.abs(allocations.reduce((s, a) => s + a.percentage, 0) - 100) < 0.5
                        ? 'text-warm-brown'
                        : 'text-tan'
                    }`}>
                      {allocations.reduce((s, a) => s + a.percentage, 0)}% / 100%
                    </span>
                  </div>
                  <div className="space-y-2">
                    {allocations.map(alloc => {
                      const pct = Math.round(alloc.percentage);
                      return (
                        <div key={alloc.functionId} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-near-black font-body flex-1 truncate">{alloc.functionName}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-display font-bold text-near-black w-10 text-right tabular-nums">{pct}%</span>
                              <button
                                onClick={() => handleRemoveAllocation(alloc.functionId)}
                                className="w-5 h-5 rounded-full border border-tan bg-off-white hover:bg-near-black hover:border-near-black
                                           hover:text-off-white flex items-center justify-center text-sage transition-colors"
                              >
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <input
                            type="range"
                            min={MIN_PCT}
                            max={100}
                            step={1}
                            value={pct}
                            onChange={e => {
                              const newVal = parseInt(e.target.value);
                              if (allocations.length === 1) {
                                handleAllocationChange([{ ...alloc, percentage: 100 }]);
                                return;
                              }
                              const clamped = Math.min(Math.max(newVal, MIN_PCT), 100 - (allocations.length - 1) * MIN_PCT);
                              const others = allocations.filter(a => a.functionId !== alloc.functionId);
                              const remainingTotal = others.reduce((s, a) => s + a.percentage, 0);
                              const remaining = 100 - clamped;

                              let updated: typeof allocations;
                              if (remainingTotal === 0) {
                                const evenShare = Math.floor(remaining / others.length);
                                const rem = remaining - evenShare * others.length;
                                updated = allocations.map(a => {
                                  if (a.functionId === alloc.functionId) return { ...a, percentage: clamped };
                                  const idx = others.findIndex(o => o.functionId === a.functionId);
                                  return { ...a, percentage: evenShare + (idx === 0 ? rem : 0) };
                                });
                              } else {
                                updated = allocations.map(a => {
                                  if (a.functionId === alloc.functionId) return { ...a, percentage: clamped };
                                  const share = (a.percentage / remainingTotal) * remaining;
                                  return { ...a, percentage: Math.max(MIN_PCT, Math.round(share)) };
                                });
                              }

                              const newTotal = updated.reduce((s, a) => s + a.percentage, 0);
                              const diff = 100 - newTotal;
                              if (diff !== 0) {
                                const adjustable = updated.find(a => a.functionId !== alloc.functionId);
                                if (adjustable) {
                                  updated = updated.map(a =>
                                    a.functionId === adjustable.functionId
                                      ? { ...a, percentage: Math.max(MIN_PCT, a.percentage + diff) }
                                      : a
                                  );
                                }
                              }
                              handleAllocationChange(updated);
                            }}
                            className="allocation-slider"
                            style={{
                              background: `linear-gradient(to right, var(--color-warm-brown) ${pct}%, var(--color-tan) ${pct}%)`,
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-600 font-body">{error}</p>
              )}

              {/* Submit */}
              <button
                onClick={submitClockOut}
                disabled={clockingOut || allocations.length === 0}
                className="w-full bg-sage text-off-white py-3 rounded-lg text-sm font-display font-bold
                           hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {clockingOut ? 'Clocking out...' : 'Submit Clock Out'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 3: Worker Management ──────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-tan/40">
          <h2 className="font-display font-bold text-near-black">Staffing Workers</h2>
          <button
            onClick={() => { setShowAddModal(true); setNewWorkerName(''); setError(''); }}
            className="bg-warm-brown text-off-white px-3 py-1.5 rounded-lg text-xs font-display font-bold
                       hover:opacity-90 transition-opacity"
          >
            + Add Worker
          </button>
        </div>

        {workers.length === 0 ? (
          <p className="px-4 py-6 text-sage text-center text-sm font-body">
            No staffing workers yet. Add one to get started.
          </p>
        ) : (
          <div className="divide-y divide-tan/20">
            {workers.map(worker => (
              <div key={worker.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div>
                    {editingWorker?.id === worker.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="bg-off-white border border-tan rounded-lg px-2 py-1 text-sm font-body
                                     focus:outline-none focus:ring-2 focus:ring-warm-brown w-40"
                          autoFocus
                          onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                        />
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving}
                          className="text-xs bg-warm-brown text-off-white px-2 py-1 rounded font-display font-bold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingWorker(null)}
                          className="text-xs text-sage hover:text-near-black font-body"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p className="font-display font-bold text-near-black text-sm truncate">{worker.name}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-display font-bold flex-shrink-0 ${
                    worker.active
                      ? 'bg-sage text-off-white'
                      : 'bg-off-white text-sage border border-tan'
                  }`}>
                    {worker.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Toggle active */}
                  <button
                    onClick={() => handleToggleActive(worker)}
                    className={`text-xs px-2 py-1 rounded font-display font-bold border transition-colors ${
                      worker.active
                        ? 'border-sage text-sage hover:bg-sage hover:text-off-white'
                        : 'border-warm-brown text-warm-brown hover:bg-warm-brown hover:text-off-white'
                    }`}
                  >
                    {worker.active ? 'Deactivate' : 'Activate'}
                  </button>
                  {/* Edit name */}
                  {!editingWorker || editingWorker.id !== worker.id ? (
                    <button
                      onClick={() => openEdit(worker)}
                      className="text-xs px-2 py-1 rounded font-body text-sage hover:text-near-black hover:bg-off-white transition-colors"
                    >
                      Edit
                    </button>
                  ) : null}
                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(worker)}
                    className="text-xs px-2 py-1 rounded font-body text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add Worker Modal ──────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-near-black/60 z-50 flex items-start justify-center pt-24 px-4">
          <div className="bg-white rounded-xl border border-tan shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-tan/40">
              <h3 className="font-display font-bold text-near-black">Add Staffing Worker</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full border border-tan flex items-center justify-center text-sage hover:text-near-black transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-sage font-body mb-1">Worker Name / Nickname</label>
                <input
                  type="text"
                  value={newWorkerName}
                  onChange={e => setNewWorkerName(e.target.value)}
                  placeholder="e.g. Mike T."
                  className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                             focus:outline-none focus:ring-2 focus:ring-warm-brown"
                  onKeyDown={e => e.key === 'Enter' && handleAddWorker()}
                  autoFocus
                />
                <p className="text-xs text-sage font-body mt-1">No login or email needed — just a name.</p>
              </div>
              <button
                onClick={handleAddWorker}
                disabled={adding || !newWorkerName.trim()}
                className="w-full bg-warm-brown text-off-white py-2.5 rounded-lg text-sm font-display font-bold
                           hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {adding ? 'Adding...' : 'Add Worker'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
