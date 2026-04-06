'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { TaxonomyNode, JobFunction, Product } from '@/types';

type Tab = 'functions' | 'products';

export default function TaxonomyPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<Tab>('functions');
  const [taxonomy, setTaxonomy] = useState<TaxonomyNode[]>([]);
  const [allFunctions, setAllFunctions] = useState<JobFunction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Functions tab state
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [addingCat, setAddingCat] = useState(false);
  const [addingFnFor, setAddingFnFor] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingType, setRenamingType] = useState<'category' | 'function' | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Products tab state
  const [addingProduct, setAddingProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', description: '' });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductValues, setEditProductValues] = useState({ name: '', description: '' });
  const [assigningFnsFor, setAssigningFnsFor] = useState<string | null>(null);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);

    const [cats, fns, prods] = await Promise.all([
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/functions').then(r => r.json()),
      fetch('/api/products').then(r => r.json()),
    ]);

    const fnList: JobFunction[] = fns.functions || [];
    const tree: TaxonomyNode[] = (cats.categories || []).map((cat: TaxonomyNode) => ({
      ...cat,
      functions: fnList.filter(f => f.categoryId === cat.id),
    }));

    setAllFunctions(fnList);
    setTaxonomy(tree);
    setProducts(prods.products || []);

    if (silent) setRefreshing(false);
    else setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Functions tab ──────────────────────────────────────────────────────────

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

  // ── Products tab ───────────────────────────────────────────────────────────

  async function addProduct() {
    if (!newProduct.name.trim()) return;
    await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProduct),
    });
    setNewProduct({ name: '', description: '' }); setAddingProduct(false); load(true);
  }

  async function saveProductEdit(id: string) {
    if (!editProductValues.name.trim()) return;
    await fetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: editProductValues.name.trim(), description: editProductValues.description.trim() }),
    });
    setEditingProductId(null); load(true);
  }

  async function deactivateProduct(id: string) {
    if (!confirm('Deactivate this product? Historical data is preserved.')) return;
    await fetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active: false }),
    });
    load(true);
  }

  async function toggleFunctionInProduct(productId: string, fnId: string) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const already = product.functionIds.includes(fnId);
    const updated = already
      ? product.functionIds.filter(id => id !== fnId)
      : [...product.functionIds, fnId];
    await fetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: productId, functionIds: updated }),
    });
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, functionIds: updated } : p));
  }

  // functionId → product name tags
  const fnProductMap = new Map<string, string[]>();
  for (const product of products) {
    for (const fnId of product.functionIds) {
      fnProductMap.set(fnId, [...(fnProductMap.get(fnId) || []), product.name]);
    }
  }

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
        {activeTab === 'functions' && (
          <button
            onClick={() => { setAddingCat(true); setNewName(''); }}
            className="bg-warm-brown text-off-white px-4 py-2 rounded-lg text-sm font-display font-bold
                       hover:opacity-90 transition-opacity"
          >
            + Add Category
          </button>
        )}
        {activeTab === 'products' && (
          <button
            onClick={() => { setAddingProduct(true); setNewProduct({ name: '', description: '' }); }}
            className="bg-warm-brown text-off-white px-4 py-2 rounded-lg text-sm font-display font-bold
                       hover:opacity-90 transition-opacity"
          >
            + Add Product
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-tan">
        {(['functions', 'products'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-display font-bold capitalize border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? 'border-warm-brown text-warm-brown'
                : 'border-transparent text-sage hover:text-near-black'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── FUNCTIONS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'functions' && (
        <>
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
                          <div className="flex-1 flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-body text-near-black">{fn.name}</span>
                            {(fnProductMap.get(fn.id) || []).map(pName => (
                              <span key={pName} className="text-xs bg-off-white border border-tan text-warm-brown px-2 py-0.5 rounded font-body">
                                {pName}
                              </span>
                            ))}
                          </div>
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
        </>
      )}

      {/* ── PRODUCTS TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <>
          {addingProduct && (
            <div className="bg-white border border-tan rounded-lg shadow-card p-4 space-y-3">
              <p className="text-xs font-display font-bold text-sage uppercase tracking-widest">New Product</p>
              <input
                autoFocus
                value={newProduct.name}
                onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addProduct()}
                placeholder="Product name"
                className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                           focus:outline-none focus:ring-2 focus:ring-warm-brown"
              />
              <input
                value={newProduct.description}
                onChange={e => setNewProduct(p => ({ ...p, description: e.target.value }))}
                placeholder="Description (optional)"
                className="w-full bg-off-white border border-tan rounded-lg px-3 py-2 text-sm font-body
                           focus:outline-none focus:ring-2 focus:ring-warm-brown"
              />
              <div className="flex gap-2">
                <button
                  onClick={addProduct}
                  disabled={!newProduct.name.trim()}
                  className="bg-warm-brown text-off-white px-4 py-2 rounded-lg text-sm font-display font-bold
                             hover:opacity-90 disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  onClick={() => setAddingProduct(false)}
                  className="text-sage px-4 py-2 rounded-lg text-sm font-body hover:text-near-black"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
            {products.length === 0 && (
              <p className="p-8 text-center text-sage text-sm font-body">Nothing here yet.</p>
            )}

            {products.map(product => (
              <div key={product.id} className="border-b border-tan/40 last:border-b-0">
                <div className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {editingProductId === product.id ? (
                      <div className="space-y-2">
                        <input
                          autoFocus
                          value={editProductValues.name}
                          onChange={e => setEditProductValues(v => ({ ...v, name: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveProductEdit(product.id);
                            if (e.key === 'Escape') setEditingProductId(null);
                          }}
                          className="w-full border border-tan rounded px-2 py-1 text-sm font-display font-bold bg-off-white
                                     focus:outline-none focus:ring-1 focus:ring-warm-brown"
                        />
                        <input
                          value={editProductValues.description}
                          onChange={e => setEditProductValues(v => ({ ...v, description: e.target.value }))}
                          placeholder="Description (optional)"
                          className="w-full border border-tan rounded px-2 py-1 text-sm font-body bg-off-white
                                     focus:outline-none focus:ring-1 focus:ring-warm-brown"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveProductEdit(product.id)}
                            disabled={!editProductValues.name.trim()}
                            className="text-xs text-warm-brown hover:underline px-2 font-display font-bold disabled:opacity-40"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingProductId(null)}
                            className="text-xs text-sage hover:text-near-black px-2 font-body"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="font-display font-bold text-near-black">{product.name}</p>
                        {product.description && (
                          <p className="text-xs text-sage font-body mt-0.5">{product.description}</p>
                        )}
                        <p className="text-xs text-sage font-body mt-1">
                          {product.functionIds.length} function{product.functionIds.length !== 1 ? 's' : ''} assigned
                        </p>
                      </>
                    )}
                  </div>
                  {editingProductId !== product.id && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setEditingProductId(product.id); setEditProductValues({ name: product.name, description: product.description || '' }); }}
                        className="text-xs text-sage hover:text-near-black px-2 font-body transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setAssigningFnsFor(assigningFnsFor === product.id ? null : product.id)}
                        className={`text-xs px-2 font-body transition-colors ${
                          assigningFnsFor === product.id
                            ? 'text-warm-brown font-display font-bold'
                            : 'text-sage hover:text-near-black'
                        }`}
                      >
                        Functions
                      </button>
                      <button
                        onClick={() => deactivateProduct(product.id)}
                        className="text-xs text-sage hover:text-warm-brown px-2 font-body transition-colors"
                      >
                        Deactivate
                      </button>
                    </div>
                  )}
                </div>

                {/* Function assignment checklist */}
                {assigningFnsFor === product.id && (
                  <div className="border-t border-tan/30 bg-off-white px-4 py-4">
                    <p className="text-xs font-display font-bold text-sage uppercase tracking-widest mb-3">
                      Assign functions
                    </p>
                    <div className="space-y-4">
                      {taxonomy.map(cat => (
                        <div key={cat.id}>
                          <p className="text-xs font-display font-bold text-near-black mb-2">{cat.name}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {cat.functions.map(fn => {
                              const checked = product.functionIds.includes(fn.id);
                              return (
                                <label key={fn.id} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleFunctionInProduct(product.id, fn.id)}
                                    className="w-4 h-4 rounded border-tan accent-warm-brown"
                                  />
                                  <span className={`text-sm font-body ${checked ? 'text-warm-brown font-display font-bold' : 'text-near-black'}`}>
                                    {fn.name}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
