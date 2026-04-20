'use client';

import { useState, useEffect } from 'react';
import { User, UserRole, Facility, LeaveBalance } from '@/types';

const ROLES: UserRole[] = ['employee', 'manager', 'admin'];

interface Invite {
  id: string;
  email: string;
  role: UserRole;
  facilityId?: string;
  createdAt: string;
}

interface LeaveBalanceWithEmployee extends LeaveBalance {
  employeeName?: string;
  employeeEmail?: string;
}

interface AdjustModal {
  employeeId: string;
  employeeName: string;
  type: 'pto' | 'sick';
  adjustment: number;
  reason: string;
  saving: boolean;
  error: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [balances, setBalances] = useState<LeaveBalanceWithEmployee[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [adjustModal, setAdjustModal] = useState<AdjustModal | null>(null);

  const [addingUser, setAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', role: 'employee' as UserRole, facilityId: '' });
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/facilities').then(r => r.json()),
    ]).then(([uData, fData]) => {
      setUsers(uData.users || []);
      setInvites(uData.invites || []);
      setFacilities(fData.facilities || []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetch('/api/leave/balance?all=true')
      .then(r => r.json())
      .then(data => {
        setBalances(data.balances || []);
        setBalancesLoading(false);
      })
      .catch(() => setBalancesLoading(false));
  }, []);

  async function saveAdjustment() {
    if (!adjustModal) return;
    setAdjustModal(prev => prev ? { ...prev, saving: true, error: '' } : null);
    try {
      const res = await fetch('/api/leave/balance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: adjustModal.employeeId,
          type: adjustModal.type,
          adjustment: adjustModal.adjustment,
          reason: adjustModal.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAdjustModal(prev => prev ? { ...prev, saving: false, error: data.error || 'Failed.' } : null);
        return;
      }
      // Refresh balances
      const bRes = await fetch('/api/leave/balance?all=true');
      const bData = await bRes.json();
      setBalances(bData.balances || []);
      setAdjustModal(null);
    } catch {
      setAdjustModal(prev => prev ? { ...prev, saving: false, error: 'Request failed.' } : null);
    }
  }

  async function updateUser(id: string, updates: Partial<User>) {
    setSaving(id);
    await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    setSaving(null);
  }

  async function addUser() {
    if (!newUser.email.trim()) return;
    setAddSaving(true);
    setAddError('');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newUser.email.trim(),
        role: newUser.role,
        facilityId: newUser.facilityId || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAddError(data.error || 'Failed to add user.');
      setAddSaving(false);
      return;
    }
    setInvites(prev => [{
      id: newUser.email.trim().toLowerCase(),
      email: newUser.email.trim().toLowerCase(),
      role: newUser.role,
      facilityId: newUser.facilityId || undefined,
      createdAt: new Date().toISOString(),
    }, ...prev]);
    setNewUser({ email: '', role: 'employee', facilityId: '' });
    setAddingUser(false);
    setAddSaving(false);
  }

  async function cancelInvite(email: string) {
    if (!confirm(`Cancel invite for ${email}?`)) return;
    await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setInvites(prev => prev.filter(i => i.email !== email));
  }

  const facilityName = (id?: string) => facilities.find(f => f.id === id)?.name || '—';

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const inputClass = "w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-warm-brown";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-black text-near-black">Users</h1>
        <button
          onClick={() => { setAddingUser(true); setAddError(''); }}
          className="bg-warm-brown text-off-white px-4 py-2 rounded-lg text-sm font-display font-bold
                     hover:opacity-90 transition-opacity"
        >
          + Add User
        </button>
      </div>

      {/* Invite form */}
      {addingUser && (
        <div className="bg-white border border-tan rounded-lg shadow-card p-4 space-y-3">
          <p className="text-xs font-display font-bold text-sage uppercase tracking-widest">Invite new user</p>
          <p className="text-sm text-sage font-body">
            Their role and facility will be applied when they first sign in with Google.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={newUser.email}
              onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addUser()}
              placeholder="Email address"
              type="email"
              className={inputClass}
            />
            <select
              value={newUser.role}
              onChange={e => setNewUser(u => ({ ...u, role: e.target.value as UserRole }))}
              className={inputClass}
            >
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select
              value={newUser.facilityId}
              onChange={e => setNewUser(u => ({ ...u, facilityId: e.target.value }))}
              className={inputClass}
            >
              <option value="">No facility</option>
              {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          {addError && (
            <p className="text-sm font-body text-near-black bg-tan/20 border border-tan rounded-lg px-3 py-2">
              {addError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={addUser}
              disabled={addSaving || !newUser.email.trim()}
              className="bg-warm-brown text-off-white px-4 py-2 rounded-lg text-sm font-display font-bold
                         hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {addSaving ? 'Saving...' : 'Send invite'}
            </button>
            <button
              onClick={() => setAddingUser(false)}
              className="text-sage px-4 py-2 rounded-lg text-sm font-body hover:text-near-black transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
          <div className="px-4 py-3 bg-tan/10 border-b border-tan/40">
            <h2 className="font-display font-bold text-near-black text-sm">Pending invites</h2>
            <p className="text-xs text-sage font-body mt-0.5">
              Role assigned on first sign-in.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-near-black">
              <tr>
                {['Email', 'Role', 'Facility', 'Created', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-display font-bold text-tan text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invites.map((invite, idx) => (
                <tr key={invite.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-off-white'}>
                  <td className="px-4 py-2.5 font-mono text-near-black text-xs">{invite.email}</td>
                  <td className="px-4 py-2.5">
                    <span className="capitalize text-near-black bg-tan/30 text-xs px-2 py-0.5 rounded font-display font-bold">
                      {invite.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-sage font-body text-xs">{facilityName(invite.facilityId)}</td>
                  <td className="px-4 py-2.5 text-sage font-mono text-xs">
                    {new Date(invite.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => cancelInvite(invite.email)}
                      className="text-xs text-sage hover:text-near-black font-body transition-colors"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Leave balances section */}
      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-tan/40">
          <h2 className="font-display font-bold text-near-black text-sm">Leave Balances</h2>
          <p className="text-xs text-sage font-body mt-0.5">Current year PTO and Sick Time balances.</p>
        </div>
        {balancesLoading ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
          </div>
        ) : balances.length === 0 ? (
          <p className="px-4 py-6 text-center text-sage text-sm font-body">No balances found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-near-black">
                <tr>
                  {['Employee', 'PTO Used / Total', 'Sick Used / Total', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-display font-bold text-tan text-xs uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {balances.map((b, i) => (
                  <tr key={b.id} className={i % 2 === 0 ? 'bg-white' : 'bg-off-white'}>
                    <td className="px-4 py-2.5">
                      <p className="font-display font-bold text-near-black text-sm">{b.employeeName ?? '—'}</p>
                      <p className="text-xs text-sage font-mono">{b.employeeEmail ?? ''}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-near-black font-bold">{b.ptoUsed}h</span>
                      <span className="text-sage font-mono"> / {b.ptoTotal}h</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-near-black font-bold">{b.sickUsed}h</span>
                      <span className="text-sage font-mono"> / {b.sickTotal}h</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() =>
                          setAdjustModal({
                            employeeId: b.employeeId,
                            employeeName: b.employeeName ?? 'Employee',
                            type: 'pto',
                            adjustment: 0,
                            reason: '',
                            saving: false,
                            error: '',
                          })
                        }
                        className="text-xs px-3 py-1 border border-tan text-sage rounded font-display font-bold
                                   hover:border-near-black hover:text-near-black transition-colors"
                      >
                        Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Registered users */}
      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-near-black">
              <tr>
                {['User', 'Role', 'Facility', 'Joined', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-display font-bold text-tan text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sage text-sm font-body">
                    Nothing here yet.
                  </td>
                </tr>
              )}
              {users.map((user, idx) => (
                <tr key={user.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-off-white'} ${!user.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-display font-bold text-near-black">{user.name}</p>
                    <p className="text-xs text-sage font-mono mt-0.5">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={e => updateUser(user.id, { role: e.target.value as UserRole })}
                      disabled={saving === user.id}
                      className="bg-off-white border border-tan rounded-lg px-2 py-1 text-sm font-body
                                 focus:outline-none focus:ring-1 focus:ring-warm-brown disabled:opacity-40"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.facilityId || ''}
                      onChange={e => updateUser(user.id, { facilityId: e.target.value || undefined })}
                      disabled={saving === user.id}
                      className="bg-off-white border border-tan rounded-lg px-2 py-1 text-sm font-body
                                 focus:outline-none focus:ring-1 focus:ring-warm-brown disabled:opacity-40"
                    >
                      <option value="">None</option>
                      {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sage font-mono text-xs">
                    {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => updateUser(user.id, { active: !user.active })}
                      disabled={saving === user.id}
                      className={`text-xs px-3 py-1 rounded font-display font-bold transition-colors disabled:opacity-40 ${
                        user.active
                          ? 'bg-sage text-off-white hover:opacity-80'
                          : 'bg-off-white text-warm-brown border border-tan hover:bg-tan/20'
                      }`}
                    >
                      {saving === user.id ? '...' : user.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust balance modal */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-near-black/50" onClick={() => setAdjustModal(null)} />
          <div className="relative bg-white rounded-xl border border-tan shadow-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-display font-black text-near-black">Adjust Leave Balance</h3>
            <p className="text-sm font-body text-sage">{adjustModal.employeeName}</p>
            <div>
              <label className="block text-xs text-sage font-body mb-1">Type</label>
              <select
                value={adjustModal.type}
                onChange={e => setAdjustModal(prev => prev ? { ...prev, type: e.target.value as 'pto' | 'sick' } : null)}
                className={inputClass}
              >
                <option value="pto">PTO</option>
                <option value="sick">Sick Time</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-sage font-body mb-1">
                Adjustment (hours, can be negative)
              </label>
              <input
                type="number"
                step={1}
                value={adjustModal.adjustment}
                onChange={e => setAdjustModal(prev => prev ? { ...prev, adjustment: Number(e.target.value) } : null)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-sage font-body mb-1">Reason (required)</label>
              <input
                type="text"
                value={adjustModal.reason}
                onChange={e => setAdjustModal(prev => prev ? { ...prev, reason: e.target.value } : null)}
                placeholder="e.g. Annual rollover correction"
                className={inputClass}
              />
            </div>
            {adjustModal.error && (
              <p className="text-sm font-body text-near-black bg-tan/20 border border-tan rounded-lg px-3 py-2">
                {adjustModal.error}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setAdjustModal(null)}
                className="text-sage px-4 py-2 text-sm font-body hover:text-near-black transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveAdjustment}
                disabled={adjustModal.saving || !adjustModal.reason.trim() || adjustModal.adjustment === 0}
                className="bg-warm-brown text-off-white px-4 py-2 rounded-lg text-sm font-display font-bold
                           hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {adjustModal.saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
