'use client';

import { useState, useEffect, useCallback } from 'react';
import { LeaveRequest, LeaveType, LeaveStatus } from '@/types';

interface Employee { id: string; name: string; email: string; }

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(y, m - 1, d, 12),
  );
}

function formatSubmitted(isoStr: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(isoStr));
}

const STATUS_BADGE: Record<LeaveStatus, string> = {
  pending: 'bg-tan text-near-black',
  approved: 'bg-sage text-off-white',
  denied: 'bg-near-black text-off-white',
};

function LeaveCard({
  req,
  onApprove,
  onDeny,
  approving,
}: {
  req: LeaveRequest;
  onApprove: (id: string) => void;
  onDeny: (req: LeaveRequest) => void;
  approving: string | null;
}) {
  const isPending = req.status === 'pending';
  return (
    <div className={`bg-white rounded-lg border shadow-card overflow-hidden ${isPending ? 'border-warm-brown/50' : 'border-tan'}`}>
      <div className={`px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${isPending ? 'bg-warm-brown/5' : ''}`}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-display font-bold text-near-black">{req.employeeName}</p>
            <span className="text-xs font-mono text-sage">{req.employeeEmail}</span>
          </div>
          <p className="text-xs text-sage font-body mt-0.5">
            Submitted {formatSubmitted(req.submittedAt)}
            {req.isRetroactive && (
              <span className="ml-1.5 text-xs px-1.5 py-0.5 bg-tan/40 text-warm-brown rounded font-display font-bold">
                Retroactive
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded font-display font-bold ${STATUS_BADGE[req.status]}`}>
            {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
          </span>
          {isPending && (
            <>
              <button
                onClick={() => onApprove(req.id)}
                disabled={approving === req.id}
                className="text-xs px-3 py-1.5 bg-sage text-off-white rounded font-display font-bold
                           hover:opacity-80 disabled:opacity-40 transition-opacity"
              >
                {approving === req.id ? '...' : 'Approve'}
              </button>
              <button
                onClick={() => onDeny(req)}
                className="text-xs px-3 py-1.5 bg-near-black text-off-white rounded font-display font-bold
                           hover:opacity-80 transition-opacity"
              >
                Deny
              </button>
            </>
          )}
        </div>
      </div>
      <div className="px-4 py-3 border-t border-tan/30 flex flex-wrap gap-4 text-sm">
        <div>
          <span className="text-xs font-display font-bold text-sage uppercase tracking-wide">Type</span>
          <p className="font-display font-bold text-near-black mt-0.5">
            {req.type === 'pto' ? 'PTO' : 'Sick Time'}
          </p>
        </div>
        <div>
          <span className="text-xs font-display font-bold text-sage uppercase tracking-wide">Hours</span>
          <p className="font-mono font-bold text-warm-brown mt-0.5">{req.totalHours}h</p>
        </div>
        <div>
          <span className="text-xs font-display font-bold text-sage uppercase tracking-wide">Dates</span>
          <p className="font-body text-near-black mt-0.5">
            {req.dates.map(d => `${formatDateLabel(d.date)} (${d.hours}h)`).join(', ')}
          </p>
        </div>
        {req.status !== 'pending' && req.reviewedBy && (
          <div>
            <span className="text-xs font-display font-bold text-sage uppercase tracking-wide">Reviewed by</span>
            <p className="font-body text-near-black mt-0.5">{req.reviewedBy}</p>
          </div>
        )}
        {req.status === 'denied' && req.denialReason && (
          <div className="w-full">
            <span className="text-xs font-display font-bold text-sage uppercase tracking-wide">Reason</span>
            <p className="font-body text-near-black mt-0.5 text-xs bg-off-white rounded px-2 py-1">
              {req.denialReason}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState<string | null>(null);

  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterType, setFilterType] = useState<'' | LeaveType>('');
  const [filterStatus, setFilterStatus] = useState<'' | LeaveStatus>('');

  const [denyModal, setDenyModal] = useState<LeaveRequest | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [denying, setDenying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, empRes] = await Promise.all([
        fetch('/api/leave/requests'),
        fetch('/api/employees'),
      ]);
      const [reqData, empData] = await Promise.all([reqRes.json(), empRes.json()]);
      setRequests(reqData.requests || []);
      setEmployees(empData.employees || []);
    } catch {
      setError('Failed to load leave requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Check for ?approved=1 redirect from email link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('approved')) {
      load();
      window.history.replaceState({}, '', '/dashboard/leave');
    }
  }, [load]);

  async function approve(requestId: string) {
    setApproving(requestId);
    try {
      const res = await fetch('/api/leave/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action: 'approved' }),
      });
      if (res.ok) {
        setRequests(prev =>
          prev.map(r => r.id === requestId ? { ...r, status: 'approved' as LeaveStatus } : r),
        );
      } else {
        const data = await res.json();
        alert(data.error || 'Approval failed.');
      }
    } catch {
      alert('Approval failed.');
    } finally {
      setApproving(null);
    }
  }

  async function deny() {
    if (!denyModal) return;
    setDenying(true);
    try {
      const res = await fetch('/api/leave/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: denyModal.id, action: 'denied', denialReason: denyReason }),
      });
      if (res.ok) {
        setRequests(prev =>
          prev.map(r =>
            r.id === denyModal.id
              ? { ...r, status: 'denied' as LeaveStatus, denialReason: denyReason }
              : r,
          ),
        );
        setDenyModal(null);
        setDenyReason('');
      } else {
        const data = await res.json();
        alert(data.error || 'Denial failed.');
      }
    } catch {
      alert('Denial failed.');
    } finally {
      setDenying(false);
    }
  }

  const filtered = requests.filter(r => {
    if (filterEmployee && r.employeeId !== filterEmployee) return false;
    if (filterType && r.type !== filterType) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    return true;
  });

  const pending = filtered.filter(r => r.status === 'pending');
  const nonPending = filtered.filter(r => r.status !== 'pending');

  const inputClass =
    'bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-warm-brown';

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-display font-black text-near-black">Leave Requests</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-tan shadow-card p-4">
        <p className="text-xs font-display font-bold text-sage uppercase tracking-widest mb-3">Filter</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-sage font-body mb-1">Employee</label>
            <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className={`${inputClass} w-full`}>
              <option value="">All employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-sage font-body mb-1">Type</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value as '' | LeaveType)} className={`${inputClass} w-full`}>
              <option value="">All types</option>
              <option value="pto">PTO</option>
              <option value="sick">Sick Time</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-sage font-body mb-1">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as '' | LeaveStatus)} className={`${inputClass} w-full`}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
            </select>
          </div>
        </div>
      </div>

      {error && <p className="text-sm font-body text-red-600">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Pending requests */}
          {pending.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-display font-bold text-warm-brown uppercase tracking-widest">
                Pending approval ({pending.length})
              </p>
              {pending.map(req => (
                <LeaveCard
                  key={req.id}
                  req={req}
                  onApprove={approve}
                  onDeny={r => { setDenyModal(r); setDenyReason(''); }}
                  approving={approving}
                />
              ))}
            </div>
          )}

          {/* Other requests */}
          {nonPending.length > 0 && (
            <div className="space-y-3">
              {pending.length > 0 && (
                <p className="text-xs font-display font-bold text-sage uppercase tracking-widest">
                  All other requests
                </p>
              )}
              {nonPending.map(req => (
                <LeaveCard
                  key={req.id}
                  req={req}
                  onApprove={approve}
                  onDeny={r => { setDenyModal(r); setDenyReason(''); }}
                  approving={approving}
                />
              ))}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="bg-white rounded-lg border border-tan shadow-card px-4 py-12 text-center">
              <p className="text-sage font-body text-sm">No leave requests found.</p>
            </div>
          )}
        </>
      )}

      {/* Deny modal */}
      {denyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-near-black/50" onClick={() => setDenyModal(null)} />
          <div className="relative bg-white rounded-xl border border-tan shadow-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-display font-black text-near-black">Deny Leave Request</h3>
            <p className="text-sm font-body text-sage">
              Denying {denyModal.employeeName}&apos;s {denyModal.type === 'pto' ? 'PTO' : 'Sick Time'} request for {denyModal.totalHours}h.
            </p>
            <div>
              <label className="block text-xs text-sage font-body mb-1">Reason (optional)</label>
              <textarea
                value={denyReason}
                onChange={e => setDenyReason(e.target.value)}
                rows={3}
                placeholder="Enter a reason for the employee..."
                className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                           focus:outline-none focus:ring-2 focus:ring-warm-brown resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDenyModal(null)}
                className="text-sage px-4 py-2 text-sm font-body hover:text-near-black transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deny}
                disabled={denying}
                className="bg-near-black text-off-white px-4 py-2 rounded-lg text-sm font-display font-bold
                           hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {denying ? 'Denying...' : 'Deny'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
