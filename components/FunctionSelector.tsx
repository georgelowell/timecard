'use client';

import { useState } from 'react';
import { TaxonomyNode, RecentFunction } from '@/types';

interface SelectedFunction {
  functionId: string;
  functionName: string;
  percentage: number;
}

interface Props {
  taxonomy: TaxonomyNode[];
  recentFunctions: RecentFunction[];
  lastShift: SelectedFunction[] | null;
  selectedIds: string[];
  onSelect: (fn: { id: string; name: string }) => void;
  onSameAsLastTime: (fns: SelectedFunction[]) => void;
}

function FunctionRow({ id, name, selectedIds, onSelect }: {
  id: string; name: string; selectedIds: string[];
  onSelect: (fn: { id: string; name: string }) => void;
}) {
  const isSelected = selectedIds.includes(id);
  return (
    <button
      onClick={() => !isSelected && onSelect({ id, name })}
      disabled={isSelected}
      className={`w-full flex items-center justify-between px-6 py-2.5 text-left transition-colors font-body text-sm ${
        isSelected
          ? 'text-warm-brown bg-tan/10'
          : 'text-near-black hover:bg-tan/10 hover:text-warm-brown'
      }`}
    >
      <span>{name}</span>
      {isSelected && (
        <svg className="w-4 h-4 text-warm-brown flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

// Returns "Yesterday", a weekday short name, or null for older dates
function shiftLabel(isoDate: string): string | null {
  const today = new Date();
  const shift = new Date(isoDate);
  const diffDays = Math.floor(
    (today.setHours(0,0,0,0) - shift.setHours(0,0,0,0)) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return shift.toLocaleDateString('en-US', { weekday: 'short' });
  return null;
}

export default function FunctionSelector({
  taxonomy, recentFunctions, lastShift,
  selectedIds, onSelect, onSameAsLastTime,
}: Props) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const lastShiftIds = new Set((lastShift ?? []).map(f => f.functionId));

  return (
    <div className="pb-6">

      {/* ── Recent functions ──────────────────────────────────── */}
      <div className="px-4 pt-4">
        <p className="text-xs font-display font-bold text-sage uppercase tracking-widest mb-3">Recent</p>

        {/* Same as last time */}
        {lastShift && lastShift.length > 0 && (
          <button
            onClick={() => onSameAsLastTime(lastShift)}
            className="w-full mb-3 flex items-center justify-center gap-2 bg-near-black text-off-white
                       py-3 rounded-lg font-display font-bold text-sm hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Same as last time
          </button>
        )}

        {/* Recent function cards */}
        {recentFunctions.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {recentFunctions.map(fn => {
              const isSelected = selectedIds.includes(fn.functionId);
              const label = shiftLabel(fn.lastShiftDate);
              const isLastShift = lastShiftIds.has(fn.functionId);
              return (
                <button
                  key={fn.functionId}
                  onClick={() => !isSelected && onSelect({ id: fn.functionId, name: fn.functionName })}
                  disabled={isSelected}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    isSelected
                      ? 'bg-tan/20 border-tan'
                      : 'bg-white border-tan hover:border-warm-brown'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1.5">
                    <p className="font-display font-bold text-near-black text-sm leading-tight">{fn.functionName}</p>
                    {isSelected && (
                      <svg className="w-4 h-4 text-warm-brown flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {fn.categoryName && (
                    <p className="text-xs text-sage font-body mb-2 leading-tight">{fn.categoryName}</p>
                  )}
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <span className="text-xs font-mono font-bold text-warm-brown">
                      {fn.lastUsedPercentage}% last shift
                    </span>
                    {isLastShift && label && (
                      <span className="text-xs text-sage font-body">{label}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-sage font-body">No recent work to show.</p>
        )}
      </div>

      {/* ── Browse by Category ────────────────────────────────── */}
      <div className="px-4 pt-5 pb-1">
        <p className="text-xs font-display font-bold text-sage uppercase tracking-widest">Browse by Category</p>
      </div>

      <div className="mt-1">
        {taxonomy.map(category => (
          <div key={category.id} className="border-b border-tan/40 last:border-b-0">
            <button
              onClick={() => toggle(category.id)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-off-white transition-colors text-left"
            >
              <span className="font-display font-bold text-near-black text-sm">{category.name}</span>
              <svg
                className={`w-4 h-4 text-sage transition-transform ${expandedCategories.has(category.id) ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expandedCategories.has(category.id) && (
              <div className="bg-off-white border-t border-tan/20">
                {category.functions.length === 0
                  ? <p className="px-6 py-2.5 text-sm text-sage font-body italic">Nothing here yet.</p>
                  : category.functions.map(fn => (
                      <FunctionRow key={fn.id} id={fn.id} name={fn.name} selectedIds={selectedIds} onSelect={onSelect} />
                    ))
                }
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
