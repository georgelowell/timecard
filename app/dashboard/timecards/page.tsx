'use client';

import { useState, useEffect, useCallback } from 'react';
import { Timecard, Facility, TaxonomyNode, JobFunction, Allocation } from '@/types';
import AllocationSliders from '@/components/AllocationSliders';

// ── Date/time helpers ────────────────────────────────────────────────────────

function toETDatetimeLocal(isoString: string): string {
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const hr = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hr}:${get('minute')}`;
}

function formatDateET(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(isoString));
}

function formatTimeET(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(isoString));
}

const statusLabel = (status: string) => {
  if (status === 'checked-out')       return 'Clocked out';
  if (status === 'checked-in')        return 'Clocked in';
  if (status === 'pending-approval')  return 'Pending';
  return status;
};

// ── Types ────────────────────────────────────────────────────────────────────

type WorkingAlloc = { functionId: string; functionName: string; percentage: number };

interface EditModal {
  tc: Timecard;
  checkInTimeET: string;
  checkOutTimeET: string;
  editNote: string;
  allocations: WorkingAlloc[];
}

// ── Allocation helpers (same logic as CheckOutScreen) ────────────────────────

function evenSplit(items: WorkingAlloc[]): WorkingAlloc[] {
  const even = Math.floor(100 / items.length);
  const rem  = 100 - even * items.length;
  return items.map((a, i) => ({ ...a, percentage: i === 0 ? even + rem : even }));
}

function addAlloc(allocs: WorkingAlloc[], fn: { id: string; name: string }): WorkingAlloc[] {
  if (allocs.find(a => a.functionId === fn.id)) return allocs;
  return evenSplit([...allocs, { functionId: fn.id, functionName: fn.name, percentage: 0 }]);
}

function removeAlloc(allocs: WorkingAlloc[], functionId: string): WorkingAlloc[] {
  const next = allocs.filter(a => a.functionId !== functionId);
  if (next.length === 0) return [];
  const removedPct = allocs.find(a => a.functionId === functionId)?.percentage ?? 0;
  const total = next.reduce((s, a) => s + a.percentage, 0);
  if (total === 0) return evenSplit(next);
  return next.map(a => ({
    ...a,
    percentage: Math.round((a.percentage + (removedPct * a.percentage) / total) * 10) / 10,
  }));
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TimecardsPage() {
  const [timecards, setTimecards]   = useState<Timecard[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [taxonomy, setTaxonomy]     = useState<TaxonomyNode[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filters, setFilters]       = useState({ startDate: '', endDate: '', facilityId: '', employeeId: '' });
  const [modal, setModal]           = useState<EditModal | null>(null);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState('');
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [sortDir, setSortDir]       = useState<'desc' | 'asc'>('desc');
  // Tracks the add-function select value so we can reset it after selection
  const [addFnId, setAddFnId]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    const res = await fetch(`/api/timecards?${params}`);
    const data = await res.json();
    setTimecards(data.timecards || []);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    // Load facilities, taxonomy, and timecards in parallel
    Promise.all([
      fetch('/api/facilities').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/functions').then(r => r.json()),
    ]).then(([facData, catData, fnData]) => {
      setFacilities(facData.facilities || []);
      const fnList: JobFunction[] = fnData.functions || [];
      const tree: TaxonomyNode[] = (catData.categories || []).map((cat: TaxonomyNode) => ({
        ...cat,
        functions: fnList.filter((f: JobFunction) => f.categoryId === cat.id && f.active !== false),
      })).filter((cat: TaxonomyNode) => cat.functions.length > 0);
      setTaxonomy(tree);
    });
    load();
  }, [load]);

  function openModal(tc: Timecard) {
    setModal({
      tc,
      checkInTimeET:  toETDatetimeLocal(tc.checkInTime),
      checkOutTimeET: tc.checkOutTime ? toETDatetimeLocal(tc.checkOutTime) : '',
      editNote:       '',
      allocations:    (tc.allocations as Allocation[] | undefined ?? []).map(a => ({
        functionId:   a.functionId,
        functionName: a.functionName,
        percentage:   a.percentage,
      })),
    });
    setSaveError('');
    setAddFnId('');
  }

  // Called from the add-function <select>
  function handleAddFunction(fnId: string) {
    if (!fnId) return;
    const fn = taxonomy.flatMap(c => c.functions).find(f => f.id === fnId);
    if (!fn) return;
    setModal(m => m ? { ...m, allocations: addAlloc(m.allocations, { id: fn.id, name: fn.name }) } : m);
    setAddFnId('');
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    await fetch(`/api/timecards?id=${deleteId}`, { method: 'DELETE' });
    setDeleting(false);
    setDeleteId(null);
    load();
  }

  async function saveEdit() {
    if (!modal) return;
    if (!modal.editNote.trim()) { setSaveError('Edit note is required.'); return; }

    // Validate allocations if any are set
    if (modal.allocations.length > 0) {
      const totalPct = modal.allocations.reduce((s, a) => s + a.percentage, 0);
      if (Math.abs(totalPct - 100) >= 0.5) {
        setSaveError(`Allocations must sum to 100% (currently ${Math.round(totalPct)}%).`);
        return;
      }
    }

    setSaving(true);
    setSaveError('');

    const body: Record<string, unknown> = {
      id:           modal.tc.id,
      checkInTimeET: modal.checkInTimeET,
      editNote:     modal.editNote,
    };
    if (modal.checkOutTimeET) body.checkOutTimeET = modal.checkOutTimeET;
    if (modal.allocations.length > 0)  body.allocations = modal.allocations;

    const res = await fetch('/api/timecards', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setSaveError(d.error || 'Save failed.');
      return;
    }
    setModal(null);
    load();
  }

  const exportCsv = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    window.open(`/api/export?${params}`, '_blank');
  };

  const sortedTimecards = sortDir === 'desc' ? timecards : [...timecards].reverse();

  // Derived allocation state for the open modal
  const modalAllocTotal = modal?.allocations.reduce((s, a) => s + a.percentage, 0) ?? 0;
  const modalAllocBalanced = Math.abs(modalAllocTotal - 100) < 0.5;
  // Functions already in the modal's allocation list
  const modalAllocIds = new Set(modal?.allocations.map(a => a.functionId) ?? []);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-black text-near-black">Timecards</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-1.5 border border-tan text-sage px-3 py-2 rounded-lg
                       text-sm font-display font-bold hover:text-near-black transition-colors"
            title={sortDir === 'desc' ? 'Showing newest first' : 'Showing oldest first'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={sortDir === 'desc'
                  ? 'M3 4h13M3 8h9M3 12h5m10 4l-4 4m0 0l-4-4m4 4V4'
                  : 'M3 4h13M3 8h9M3 12h5m10-8l-4-4m0 0L15 4m-4-4v16'}
              />
            </svg>
            {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
          </button>
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
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-tan shadow-card p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        {(['startDate', 'endDate'] as const).map(field => (
          <div key={field}>
            <label className="block text-xs font-display font-bold text-sage uppercase tracking-widest mb-1.5">
              {field === 'startDate' ? 'Start Date' : 'End Date'}
            </label>
            <input type="date" value={filters[field]}
              onChange={e => setFilters(f => ({ ...f, [field]: e.target.value }))}
              className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                         focus:outline-none focus:ring-2 focus:ring-warm-brown" />
          </div>
        ))}
        <div>
          <label className="block text-xs font-display font-bold text-sage uppercase tracking-widest mb-1.5">Facility</label>
          <select value={filters.facilityId}
            onChange={e => setFilters(f => ({ ...f, facilityId: e.target.value }))}
            className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                       focus:outline-none focus:ring-2 focus:ring-warm-brown">
            <option value="">All facilities</option>
            {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-display font-bold text-sage uppercase tracking-widest mb-1.5">Employee ID</label>
          <input type="text" placeholder="Filter by employee" value={filters.employeeId}
            onChange={e => setFilters(f => ({ ...f, employeeId: e.target.value }))}
            className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                       focus:outline-none focus:ring-2 focus:ring-warm-brown" />
        </div>
        <div className="flex items-end">
          <button onClick={load}
            className="w-full bg-near-black text-off-white py-2 rounded-lg text-sm font-display font-bold
                       hover:opacity-90 transition-opacity">
            Filter
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-near-black">
                <tr>
                  {['Employee','Date','Facility','In','Out','Hours','Status / Flags','Location','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-display font-bold text-tan text-xs uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timecards.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sage text-sm font-body">Nothing here yet.</td>
                  </tr>
                )}
                {sortedTimecards.map((tc, idx) => {
                  const noAllocations = tc.status === 'checked-out' && (!tc.allocations || tc.allocations.length === 0);
                  return (
                    <tr key={tc.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-off-white'}>
                      <td className="px-4 py-3">
                        <p className="font-display font-bold text-near-black">{tc.employeeName}</p>
                        <p className="text-xs text-sage font-mono mt-0.5">{tc.employeeEmail}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-near-black text-sm">{formatDateET(tc.checkInTime)}</td>
                      <td className="px-4 py-3 font-body text-near-black">{tc.facilityName}</td>
                      <td className="px-4 py-3 font-mono text-near-black text-sm">{formatTimeET(tc.checkInTime)}</td>
                      <td className="px-4 py-3 font-mono text-near-black text-sm">
                        {tc.checkOutTime ? formatTimeET(tc.checkOutTime) : <span className="text-sage">—</span>}
                      </td>
                      <td className="px-4 py-3 font-display font-bold text-warm-brown font-mono text-sm">
                        {tc.totalHours ? `${tc.totalHours.toFixed(2)}h` : <span className="text-sage font-body font-normal">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-display font-bold ${
                            tc.status === 'checked-out' ? 'bg-off-white text-warm-brown border border-tan'
                            : tc.status === 'checked-in' ? 'bg-sage text-off-white'
                            : 'bg-tan text-near-black'}`}>
                            {statusLabel(tc.status)}
                          </span>
                          {noAllocations && (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-display font-bold bg-red-100 text-red-700 border border-red-200">
                              Time not logged
                            </span>
                          )}
                          {tc.manualEntry && (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-display font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Manual entry
                            </span>
                          )}
                          {tc.remotePendingAtCheckout && (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-display font-bold bg-orange-50 text-orange-700 border border-orange-200">
                              Remote pending
                            </span>
                          )}
                          {tc.editedBy && (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-display font-bold bg-off-white text-sage border border-tan">
                              Edited
                            </span>
                          )}
                          {tc.allocationsEdited && (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-display font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              Alloc edited
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {tc.checkInLocation ? (
                          <a href={`https://maps.google.com/?q=${tc.checkInLocation.lat},${tc.checkInLocation.lng}`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-warm-brown hover:underline font-body">
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                            </svg>
                            View map
                          </a>
                        ) : (
                          <span className="text-xs text-sage font-body">No location</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button onClick={() => openModal(tc)}
                            className="text-xs text-sage font-body hover:text-warm-brown transition-colors">
                            Edit
                          </button>
                          <button onClick={() => setDeleteId(tc.id)}
                            className="text-xs text-sage font-body hover:text-red-600 transition-colors">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Edit Modal ──────────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-near-black/60">
          <div className="bg-white rounded-xl border border-tan shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="px-6 py-4 border-b border-tan/40 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="font-display font-black text-near-black text-lg">Edit timecard</h2>
                <p className="text-xs text-sage font-body mt-0.5">{modal.tc.employeeName}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-sage hover:text-near-black transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

              {/* Clock In */}
              <div>
                <label className="block text-xs font-display font-bold text-sage uppercase tracking-widest mb-1.5">
                  Clock in (Eastern Time)
                </label>
                <input type="datetime-local" value={modal.checkInTimeET}
                  onChange={e => setModal(m => m ? { ...m, checkInTimeET: e.target.value } : m)}
                  className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-warm-brown" />
              </div>

              {/* Clock Out */}
              <div>
                <label className="block text-xs font-display font-bold text-sage uppercase tracking-widest mb-1.5">
                  Clock out (Eastern Time)
                </label>
                <input type="datetime-local" value={modal.checkOutTimeET}
                  onChange={e => setModal(m => m ? { ...m, checkOutTimeET: e.target.value } : m)}
                  className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-mono
                             focus:outline-none focus:ring-2 focus:ring-warm-brown" />
                <p className="text-xs text-sage font-body mt-1">Leave blank to keep as clocked in.</p>
              </div>

              {/* ── Time Allocation ───────────────────────────────────────── */}
              <div>
                <p className="text-xs font-display font-bold text-sage uppercase tracking-widest mb-2">
                  Time Allocation
                </p>

                {modal.allocations.length > 0 ? (
                  <div className="bg-off-white rounded-lg border border-tan">
                    <AllocationSliders
                      allocations={modal.allocations}
                      onChange={allocs => setModal(m => m ? { ...m, allocations: allocs } : m)}
                      onRemove={fnId =>
                        setModal(m => m ? { ...m, allocations: removeAlloc(m.allocations, fnId) } : m)
                      }
                    />
                  </div>
                ) : (
                  <p className="text-xs text-sage font-body mb-3">
                    No functions allocated yet. Add functions below to build the allocation.
                  </p>
                )}

                {/* Total validation */}
                {modal.allocations.length > 0 && !modalAllocBalanced && (
                  <p className="text-xs text-amber-700 font-body mt-1.5 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    Allocations must sum to 100% (currently {Math.round(modalAllocTotal)}%).
                  </p>
                )}

                {/* Add function dropdown */}
                <div className="mt-3">
                  <label className="block text-xs font-display font-bold text-sage uppercase tracking-widest mb-1.5">
                    Add a function
                  </label>
                  <select
                    value={addFnId}
                    onChange={e => { handleAddFunction(e.target.value); setAddFnId(''); }}
                    className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                               focus:outline-none focus:ring-2 focus:ring-warm-brown"
                  >
                    <option value="">Select a function…</option>
                    {taxonomy.map(cat => {
                      const available = cat.functions.filter(f => !modalAllocIds.has(f.id));
                      if (available.length === 0) return null;
                      return (
                        <optgroup key={cat.id} label={cat.name}>
                          {available.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Edit note */}
              <div>
                <label className="block text-xs font-display font-bold text-sage uppercase tracking-widest mb-1.5">
                  Reason for edit <span className="text-red-500">*</span>
                </label>
                <input type="text" placeholder="e.g. Employee reported wrong time"
                  value={modal.editNote}
                  onChange={e => setModal(m => m ? { ...m, editNote: e.target.value } : m)}
                  className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                             focus:outline-none focus:ring-2 focus:ring-warm-brown" />
              </div>

              {/* Previous edit info */}
              {modal.tc.editedBy && (
                <p className="text-xs text-sage font-body bg-off-white border border-tan rounded-lg px-3 py-2">
                  Last edited by{' '}
                  <span className="font-display font-bold text-near-black">{modal.tc.editedBy}</span>
                  {modal.tc.editNote && <> — &ldquo;{modal.tc.editNote}&rdquo;</>}
                </p>
              )}

              {saveError && (
                <p className="text-xs text-red-600 font-body">{saveError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-tan/40 flex gap-3 justify-end flex-shrink-0">
              <button onClick={() => setModal(null)}
                className="px-4 py-2 text-sm font-display font-bold border border-tan text-sage rounded-lg
                           hover:text-near-black transition-colors">
                Cancel
              </button>
              <button onClick={saveEdit}
                disabled={saving || !modal.editNote.trim() || (modal.allocations.length > 0 && !modalAllocBalanced)}
                className="px-4 py-2 text-sm font-display font-bold bg-warm-brown text-off-white rounded-lg
                           hover:opacity-90 disabled:opacity-40 transition-opacity">
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ────────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-near-black/60">
          <div className="bg-white rounded-xl border border-tan shadow-xl w-full max-w-sm p-6">
            <h2 className="font-display font-black text-near-black text-lg mb-2">Delete timecard?</h2>
            <p className="text-sm text-sage font-body mb-6">
              This record will be permanently removed from the database. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm font-display font-bold border border-tan text-sage rounded-lg
                           hover:text-near-black transition-colors">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleting}
                className="px-4 py-2 text-sm font-display font-bold bg-red-600 text-white rounded-lg
                           hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
