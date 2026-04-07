'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { TaxonomyNode, JobFunction } from '@/types';

export default function TaxonomyPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [taxonomy, setTaxonomy] = useState<TaxonomyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [addingCat, setAddingCat] = useState(false);
  const [addingFnFor, setAddingFnFor] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingType, setRenamingType] = useState<'category' | 'function' | null>(null);
  const [renameValue, setRenameValue] = useState('');

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);

    const [cats, fns] = await Promise.all([
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/functions').then(r => r.json()),
    ]);

    const fnList: JobFunction[] = fns.functions || [];
    const tree: TaxonomyNode[] = (cats.categories || []).map((cat: TaxonomyNode) => ({
      ...cat,
      functions: fnList.filter(f => f.categoryId === cat.id),
    }));

    setTaxonomy(tree);

    if (silent) setRefreshing(false);
    else setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addCategory() {
    if (!newName.trim()) return;
    await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName(''); setAddingCat(false); load(true);
  }

  async function addFunction(categoryId: string) {
    if (!newName.trim()) return;
    await fetch('/api/functions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), categoryId }),
    });
    setNewName(''); setAddingFnFor(null); load(true);
  }

  async function rename(type: 'category' | 'function', id: string, name: string) {
    const endpoint = type === 'category' ? '/api/categories' : '/api/functions';
    await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    });
    setRenamingId(null); setRenamingType(null); load(true);
  }

  async function deactivate(type: 'category' | 'function', id: string) {
    if (!confirm('Deactivate this item? It will be hidden from employees but historical data is preserved.')) return;
    const endpoint = type === 'category' ? '/api/categories' : '/api/functions';
    await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active: false }),
    });
    load(true);
  }

  async function hardDeleteFunction(id: string) {
    if (!confirm('Permanently delete this function? This cannot be undone.')) return;
    await fetch('/api/functions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load(true);
  }

  const toggleCat = (id: string) => setExpandedCats(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-display font-black text-near-black">Taxonomy Editor</h1>
          {refreshing && (
            <div className="w-4 h-4 border-2 border-warm-brown border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <button
          onClick={() => { setAddingCat(true); setNewName(''); }}
          className="bg-warm-brown text-off-white px-4 py-2 rounded-lg text-sm font-display font-bold
                     hover:opacity-90 transition-opacity"
        >
          + Add Category
        </button>
      </div>

      {addingCat && (
        <div className="bg-white border border-tan rounded-lg p-4 flex gap-3 shadow-card">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            placeholder="Category name"
            className="flex-1 bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                       focus:outline-none focus:ring-2 focus:ring-warm-brown"
          />
          <button
            onClick={addCategory}
            className="bg-warm-brown text-off-white px-4 py-2 rounded-lg text-sm font-display font-bold hover:opacity-90"
          >
            Add
          </button>
          <button
            onClick={() => setAddingCat(false)}
            className="text-sage px-3 py-2 rounded-lg font-body text-sm hover:text-near-black"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        {taxonomy.length === 0 && (
          <p className="p-8 text-center text-sage text-sm font-body">Nothing here yet.</p>
        )}
        {taxonomy.map(cat => (
          <div key={cat.id} className="border-b border-tan/40 last:border-b-0">
            {/* Category row */}
            <div className="flex items-center gap-2 px-4 py-3 hover:bg-off-white transition-colors">
              <button onClick={() => toggleCat(cat.id)} className="flex-1 flex items-center gap-2 text-left">
                <svg
                  className={`w-4 h-4 text-sage transition-transform flex-shrink-0 ${expandedCats.has(cat.id) ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {renamingId === cat.id && renamingType === 'category' ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') rename('category', cat.id, renameValue);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="border border-tan rounded px-2 py-1 text-sm flex-1 bg-off-white font-body
                               focus:outline-none focus:ring-1 focus:ring-warm-brown"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="font-display font-bold text-near-black">{cat.name}</span>
                )}
              </button>
              <div className="flex gap-1 flex-shrink-0">
                {renamingId === cat.id && renamingType === 'category' ? (
                  <>
                    <button onClick={() => rename('category', cat.id, renameValue)} className="text-xs text-warm-brown hover:underline px-2 font-display font-bold">Save</button>
                    <button onClick={() => setRenamingId(null)} className="text-xs text-sage hover:text-near-black px-2 font-body">Cancel</button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setRenamingId(cat.id); setRenamingType('category'); setRenameValue(cat.name); }}
                      className="text-xs text-sage hover:text-near-black px-2 font-body transition-colors"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => deactivate('category', cat.id)}
                      className="text-xs text-sage hover:text-warm-brown px-2 font-body transition-colors"
                    >
                      Deactivate
                    </button>
                  </>
                )}
              </div>
            </div>

            {expandedCats.has(cat.id) && (
              <div className="bg-off-white border-t border-tan/20">
                {cat.functions.map(fn => (
                  <div key={fn.id} className="flex items-center gap-2 px-8 py-2 hover:bg-tan/10 transition-colors">
                    {renamingId === fn.id && renamingType === 'function' ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') rename('function', fn.id, renameValue);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className="border border-tan rounded px-2 py-1 text-sm flex-1 bg-white font-body
                                   focus:outline-none focus:ring-1 focus:ring-warm-brown"
                      />
                    ) : (
                      <span className="flex-1 text-sm font-body text-near-black">{fn.name}</span>
                    )}
                    <div className="flex gap-1 flex-shrink-0">
                      {renamingId === fn.id && renamingType === 'function' ? (
                        <>
                          <button onClick={() => rename('function', fn.id, renameValue)} className="text-xs text-warm-brown hover:underline px-2 font-display font-bold">Save</button>
                          <button onClick={() => setRenamingId(null)} className="text-xs text-sage hover:text-near-black px-2 font-body">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setRenamingId(fn.id); setRenamingType('function'); setRenameValue(fn.name); }}
                            className="text-xs text-sage hover:text-near-black px-2 font-body transition-colors"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => deactivate('function', fn.id)}
                            className="text-xs text-sage hover:text-warm-brown px-2 font-body transition-colors"
                          >
                            Deactivate
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => hardDeleteFunction(fn.id)}
                              className="text-xs text-sage hover:text-near-black px-2 font-body transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {/* Add function inline */}
                {addingFnFor === cat.id ? (
                  <div className="flex gap-2 px-8 py-2">
                    <input
                      autoFocus
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addFunction(cat.id)}
                      placeholder="Function name"
                      className="flex-1 border border-tan rounded px-2 py-1 text-sm bg-white font-body
                                 focus:outline-none focus:ring-1 focus:ring-warm-brown"
                    />
                    <button
                      onClick={() => addFunction(cat.id)}
                      className="text-xs bg-warm-brown text-off-white px-3 py-1 rounded font-display font-bold hover:opacity-90"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setAddingFnFor(null); setNewName(''); }}
                      className="text-xs text-sage hover:text-near-black px-2 font-body"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingFnFor(cat.id); setNewName(''); }}
                    className="px-8 py-2 text-xs text-sage hover:text-warm-brown w-full text-left transition-colors font-body"
                  >
                    + Add function
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
