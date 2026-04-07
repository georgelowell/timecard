'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TaxonomyNode, JobFunction } from '@/types';

// ── Grip handle icon ─────────────────────────────────────────────────────────

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <circle cx="4" cy="2.5" r="1.2" />
      <circle cx="4" cy="7"   r="1.2" />
      <circle cx="4" cy="11.5" r="1.2" />
      <circle cx="10" cy="2.5" r="1.2" />
      <circle cx="10" cy="7"   r="1.2" />
      <circle cx="10" cy="11.5" r="1.2" />
    </svg>
  );
}

// ── Sortable category row ─────────────────────────────────────────────────────

interface CategoryRowProps {
  cat: TaxonomyNode;
  isAdmin: boolean;
  expanded: boolean;
  onToggle: () => void;
  renamingId: string | null;
  renamingType: 'category' | 'function' | null;
  renameValue: string;
  onRenameValue: (v: string) => void;
  onStartRename: (id: string, type: 'category' | 'function', current: string) => void;
  onCommitRename: (type: 'category' | 'function', id: string, name: string) => void;
  onCancelRename: () => void;
  onDeactivate: (type: 'category' | 'function', id: string) => void;
  onHardDelete: (id: string) => void;
  addingFnFor: string | null;
  newName: string;
  onNewName: (v: string) => void;
  onStartAddFn: (catId: string) => void;
  onCancelAddFn: () => void;
  onAddFn: (catId: string) => void;
}

function SortableCategoryRow(props: CategoryRowProps) {
  const { cat } = props;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };

  const isRenamingThisCat =
    props.renamingId === cat.id && props.renamingType === 'category';

  return (
    <div ref={setNodeRef} style={style} className="border-b border-tan/40 last:border-b-0">
      {/* Category header row */}
      <div className="flex items-center gap-1 px-2 py-3 hover:bg-off-white transition-colors">

        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="p-1.5 text-tan/50 hover:text-sage transition-colors cursor-grab
                     active:cursor-grabbing flex-shrink-0 touch-none rounded"
          tabIndex={-1}
          aria-label="Drag to reorder"
        >
          <GripIcon />
        </button>

        {/* Expand toggle + name */}
        <button
          onClick={props.onToggle}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <svg
            className={`w-4 h-4 text-sage transition-transform flex-shrink-0 ${props.expanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          {isRenamingThisCat ? (
            <input
              autoFocus
              value={props.renameValue}
              onChange={e => props.onRenameValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  props.onCommitRename('category', cat.id, props.renameValue);
                if (e.key === 'Escape') props.onCancelRename();
              }}
              className="border border-tan rounded px-2 py-1 text-sm flex-1 bg-off-white font-body
                         focus:outline-none focus:ring-1 focus:ring-warm-brown"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="font-display font-bold text-near-black truncate">{cat.name}</span>
          )}
        </button>

        {/* Actions */}
        <div className="flex gap-1 flex-shrink-0">
          {isRenamingThisCat ? (
            <>
              <button
                onClick={() => props.onCommitRename('category', cat.id, props.renameValue)}
                className="text-xs text-warm-brown hover:underline px-2 font-display font-bold"
              >
                Save
              </button>
              <button
                onClick={props.onCancelRename}
                className="text-xs text-sage hover:text-near-black px-2 font-body"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => props.onStartRename(cat.id, 'category', cat.name)}
                className="text-xs text-sage hover:text-near-black px-2 font-body transition-colors"
              >
                Rename
              </button>
              <button
                onClick={() => props.onDeactivate('category', cat.id)}
                className="text-xs text-sage hover:text-warm-brown px-2 font-body transition-colors"
              >
                Deactivate
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded: functions list + add */}
      {props.expanded && (
        <div className="bg-off-white border-t border-tan/20">
          {cat.functions.map(fn => {
            const isRenamingFn =
              props.renamingId === fn.id && props.renamingType === 'function';
            return (
              <div
                key={fn.id}
                className="flex items-center gap-2 px-8 py-2 hover:bg-tan/10 transition-colors"
              >
                {isRenamingFn ? (
                  <input
                    autoFocus
                    value={props.renameValue}
                    onChange={e => props.onRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  props.onCommitRename('function', fn.id, props.renameValue);
                      if (e.key === 'Escape') props.onCancelRename();
                    }}
                    className="border border-tan rounded px-2 py-1 text-sm flex-1 bg-white font-body
                               focus:outline-none focus:ring-1 focus:ring-warm-brown"
                  />
                ) : (
                  <span className="flex-1 text-sm font-body text-near-black">{fn.name}</span>
                )}
                <div className="flex gap-1 flex-shrink-0">
                  {isRenamingFn ? (
                    <>
                      <button
                        onClick={() => props.onCommitRename('function', fn.id, props.renameValue)}
                        className="text-xs text-warm-brown hover:underline px-2 font-display font-bold"
                      >
                        Save
                      </button>
                      <button
                        onClick={props.onCancelRename}
                        className="text-xs text-sage hover:text-near-black px-2 font-body"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => props.onStartRename(fn.id, 'function', fn.name)}
                        className="text-xs text-sage hover:text-near-black px-2 font-body transition-colors"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => props.onDeactivate('function', fn.id)}
                        className="text-xs text-sage hover:text-warm-brown px-2 font-body transition-colors"
                      >
                        Deactivate
                      </button>
                      {props.isAdmin && (
                        <button
                          onClick={() => props.onHardDelete(fn.id)}
                          className="text-xs text-sage hover:text-near-black px-2 font-body transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add function inline */}
          {props.addingFnFor === cat.id ? (
            <div className="flex gap-2 px-8 py-2">
              <input
                autoFocus
                value={props.newName}
                onChange={e => props.onNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && props.onAddFn(cat.id)}
                placeholder="Function name"
                className="flex-1 border border-tan rounded px-2 py-1 text-sm bg-white font-body
                           focus:outline-none focus:ring-1 focus:ring-warm-brown"
              />
              <button
                onClick={() => props.onAddFn(cat.id)}
                className="text-xs bg-warm-brown text-off-white px-3 py-1 rounded font-display font-bold hover:opacity-90"
              >
                Add
              </button>
              <button
                onClick={props.onCancelAddFn}
                className="text-xs text-sage hover:text-near-black px-2 font-body"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => props.onStartAddFn(cat.id)}
              className="px-8 py-2 text-xs text-sage hover:text-warm-brown w-full text-left transition-colors font-body"
            >
              + Add function
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TaxonomyPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [taxonomy, setTaxonomy]     = useState<TaxonomyNode[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [expandedCats, setExpandedCats]     = useState<Set<string>>(new Set());
  const [addingCat, setAddingCat]           = useState(false);
  const [addingFnFor, setAddingFnFor]       = useState<string | null>(null);
  const [newName, setNewName]               = useState('');
  const [renamingId, setRenamingId]         = useState<string | null>(null);
  const [renamingType, setRenamingType]     = useState<'category' | 'function' | null>(null);
  const [renameValue, setRenameValue]       = useState('');

  // dnd-kit: require pointer to move 5px before drag starts so button clicks still work
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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

  // ── Drag end: reorder optimistically, persist in background ─────────────────
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = taxonomy.findIndex(c => c.id === active.id);
    const newIndex = taxonomy.findIndex(c => c.id === over.id);
    const reordered = arrayMove(taxonomy, oldIndex, newIndex);
    setTaxonomy(reordered);

    fetch('/api/categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: reordered.map((cat, i) => ({ id: cat.id, order: i })),
      }),
    }).catch(err => {
      console.error('Failed to save category order:', err);
      load(true); // revert on error
    });
  }

  // ── Category / function mutations ────────────────────────────────────────────

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

  async function commitRename(type: 'category' | 'function', id: string, name: string) {
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
      {/* Header */}
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

      {/* Add category inline */}
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

      {/* Drag hint */}
      {taxonomy.length > 1 && (
        <p className="text-xs text-sage font-body flex items-center gap-1.5">
          <GripIcon />
          Drag categories to set the production order from raw materials to finished goods.
        </p>
      )}

      {/* Category list */}
      <div className="bg-white rounded-lg border border-tan shadow-card overflow-hidden">
        {taxonomy.length === 0 && (
          <p className="p-8 text-center text-sage text-sm font-body">Nothing here yet.</p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={taxonomy.map(c => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {taxonomy.map(cat => (
              <SortableCategoryRow
                key={cat.id}
                cat={cat}
                isAdmin={isAdmin}
                expanded={expandedCats.has(cat.id)}
                onToggle={() => toggleCat(cat.id)}
                renamingId={renamingId}
                renamingType={renamingType}
                renameValue={renameValue}
                onRenameValue={setRenameValue}
                onStartRename={(id, type, current) => {
                  setRenamingId(id); setRenamingType(type); setRenameValue(current);
                }}
                onCommitRename={commitRename}
                onCancelRename={() => { setRenamingId(null); setRenamingType(null); }}
                onDeactivate={deactivate}
                onHardDelete={hardDeleteFunction}
                addingFnFor={addingFnFor}
                newName={newName}
                onNewName={setNewName}
                onStartAddFn={id => { setAddingFnFor(id); setNewName(''); }}
                onCancelAddFn={() => { setAddingFnFor(null); setNewName(''); }}
                onAddFn={addFunction}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
