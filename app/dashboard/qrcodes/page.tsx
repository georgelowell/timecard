'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Facility } from '@/types';

export default function QRCodesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingFacility, setAddingFacility] = useState(false);
  const [newFacility, setNewFacility] = useState({ name: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ name: '', location: '' });
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    fetch('/api/facilities').then(r => r.json()).then(d => {
      setFacilities(d.facilities || []);
      setLoading(false);
    });
  }, []);

  function startEdit(facility: Facility) {
    setEditingId(facility.id);
    setEditValues({ name: facility.name, location: facility.location || '' });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({ name: '', location: '' });
  }

  async function saveEdit(id: string) {
    if (!editValues.name.trim()) return;
    setEditSaving(true);
    await fetch('/api/facilities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: editValues.name.trim(), location: editValues.location.trim() }),
    });
    setFacilities(prev => prev.map(f =>
      f.id === id ? { ...f, name: editValues.name.trim(), location: editValues.location.trim() } : f
    ));
    setEditingId(null);
    setEditSaving(false);
  }

  function downloadQR(facilityId: string) {
    window.open(`/api/qrcode?facilityId=${facilityId}`, '_blank');
  }

  async function deactivateFacility(id: string) {
    if (!confirm('Deactivate this facility? It will be hidden but historical timecards are preserved.')) return;
    await fetch('/api/facilities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active: false }),
    });
    setFacilities(prev => prev.filter(f => f.id !== id));
  }

  async function deleteFacility(id: string, name: string) {
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch('/api/facilities', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Delete failed.');
      return;
    }
    setFacilities(prev => prev.filter(f => f.id !== id));
  }

  async function addFacility() {
    if (!newFacility.name.trim()) return;
    setSaving(true);
    const res = await fetch('/api/facilities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFacility),
    });
    const data = await res.json();
    setFacilities(prev => [...prev, { id: data.id, ...newFacility, active: true }]);
    setNewFacility({ name: '', location: '' });
    setAddingFacility(false);
    setSaving(false);
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const inputClass = "w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-warm-brown";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-black text-near-black">Locations</h1>
        <button
          onClick={() => setAddingFacility(true)}
          className="bg-warm-brown text-off-white px-4 py-2 rounded-lg text-sm font-display font-bold
                     hover:opacity-90 transition-opacity"
        >
          + Add Facility
        </button>
      </div>

      {/* Add facility form */}
      {addingFacility && (
        <div className="bg-white border border-tan rounded-lg shadow-card p-4 space-y-3">
          <p className="text-xs font-display font-bold text-sage uppercase tracking-widest">New Facility</p>
          <input
            value={newFacility.name}
            onChange={e => setNewFacility(f => ({ ...f, name: e.target.value }))}
            placeholder="Facility name"
            className={inputClass}
          />
          <input
            value={newFacility.location}
            onChange={e => setNewFacility(f => ({ ...f, location: e.target.value }))}
            placeholder="Address or location"
            className={inputClass}
          />
          <div className="flex gap-2">
            <button
              onClick={addFacility}
              disabled={saving || !newFacility.name.trim()}
              className="bg-warm-brown text-off-white px-4 py-2 rounded-lg text-sm font-display font-bold
                         hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {saving ? 'Saving...' : 'Save facility'}
            </button>
            <button
              onClick={() => setAddingFacility(false)}
              className="text-sage px-4 py-2 rounded-lg text-sm font-body hover:text-near-black transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {facilities.map(facility => (
          <div key={facility.id} className="bg-white rounded-lg border border-tan shadow-card p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0 mr-3">
                {editingId === facility.id ? (
                  <div className="space-y-2">
                    <input
                      autoFocus
                      value={editValues.name}
                      onChange={e => setEditValues(v => ({ ...v, name: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(facility.id); if (e.key === 'Escape') cancelEdit(); }}
                      placeholder="Facility name"
                      className="w-full bg-off-white border border-tan rounded-lg px-3 py-1.5 text-sm font-display font-bold
                                 focus:outline-none focus:ring-2 focus:ring-warm-brown"
                    />
                    <input
                      value={editValues.location}
                      onChange={e => setEditValues(v => ({ ...v, location: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(facility.id); if (e.key === 'Escape') cancelEdit(); }}
                      placeholder="Address or location"
                      className="w-full bg-off-white border border-tan rounded-lg px-3 py-1.5 text-sm font-body
                                 focus:outline-none focus:ring-2 focus:ring-warm-brown"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(facility.id)}
                        disabled={editSaving || !editValues.name.trim()}
                        className="text-xs bg-warm-brown text-off-white px-3 py-1.5 rounded-lg font-display font-bold
                                   hover:opacity-90 disabled:opacity-40 transition-opacity"
                      >
                        {editSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-xs text-sage px-3 py-1.5 rounded-lg font-body hover:text-near-black transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="font-display font-bold text-near-black text-lg">{facility.name}</h2>
                    {facility.location && (
                      <p className="text-sm text-sage font-body mt-0.5">{facility.location}</p>
                    )}
                    <p className="text-xs text-sage font-mono mt-1">ID: {facility.id}</p>
                  </>
                )}
              </div>

              {editingId !== facility.id && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs px-2 py-0.5 bg-sage text-off-white rounded font-display font-bold">Active</span>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(facility)}
                        className="text-xs text-sage hover:text-near-black px-2 py-0.5 rounded font-body transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deactivateFacility(facility.id)}
                        className="text-xs text-sage hover:text-warm-brown px-2 py-0.5 rounded font-body transition-colors"
                      >
                        Deactivate
                      </button>
                      <button
                        onClick={() => deleteFacility(facility.id, facility.name)}
                        disabled={facilities.length <= 1}
                        title={facilities.length <= 1 ? 'Cannot delete the last facility' : undefined}
                        className="text-xs text-sage hover:text-near-black px-2 py-0.5 rounded font-body transition-colors
                                   disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Scan URL */}
            <div className="bg-off-white rounded-lg px-3 py-2 mb-4 text-xs text-sage font-mono break-all border border-tan/60">
              {typeof window !== 'undefined' ? window.location.origin : ''}/scan?facility={facility.id}
            </div>

            <button
              onClick={() => downloadQR(facility.id)}
              className="w-full flex items-center justify-center gap-2 bg-near-black text-off-white py-3 rounded-lg
                         font-display font-bold hover:opacity-90 active:scale-95 transition-all text-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              Download QR Code
            </button>
          </div>
        ))}

        {facilities.length === 0 && (
          <div className="col-span-2 text-center py-12 text-sage font-body text-sm">
            Nothing here yet. Add a facility to generate QR codes.
          </div>
        )}
      </div>
    </div>
  );
}
