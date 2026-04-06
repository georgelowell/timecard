'use client';

import { useCallback } from 'react';

interface Allocation {
  functionId: string;
  functionName: string;
  percentage: number;
}

interface Props {
  allocations: Allocation[];
  onChange: (allocations: Allocation[]) => void;
  onRemove: (functionId: string) => void;
}

const MIN_PCT = 5;

export default function AllocationSliders({ allocations, onChange, onRemove }: Props) {
  const total = allocations.reduce((sum, a) => sum + a.percentage, 0);

  const handleSliderChange = useCallback((changedId: string, newValue: number) => {
    if (allocations.length === 1) {
      onChange(allocations.map(a => ({ ...a, percentage: 100 })));
      return;
    }

    const clamped = Math.min(Math.max(newValue, MIN_PCT), 100 - (allocations.length - 1) * MIN_PCT);
    const others = allocations.filter(a => a.functionId !== changedId);
    const remainingTotal = others.reduce((sum, a) => sum + a.percentage, 0);
    const remaining = 100 - clamped;

    let updated: Allocation[];

    if (remainingTotal === 0) {
      const evenShare = Math.floor(remaining / others.length);
      const rem = remaining - evenShare * others.length;
      updated = allocations.map(a => {
        if (a.functionId === changedId) return { ...a, percentage: clamped };
        const idx = others.findIndex(o => o.functionId === a.functionId);
        return { ...a, percentage: evenShare + (idx === 0 ? rem : 0) };
      });
    } else {
      updated = allocations.map(a => {
        if (a.functionId === changedId) return { ...a, percentage: clamped };
        const share = (a.percentage / remainingTotal) * remaining;
        return { ...a, percentage: Math.max(MIN_PCT, Math.round(share)) };
      });
    }

    const newTotal = updated.reduce((sum, a) => sum + a.percentage, 0);
    const diff = 100 - newTotal;
    if (diff !== 0) {
      const adjustable = updated.find(a => a.functionId !== changedId);
      if (adjustable) {
        updated = updated.map(a =>
          a.functionId === adjustable.functionId
            ? { ...a, percentage: Math.max(MIN_PCT, a.percentage + diff) }
            : a
        );
      }
    }

    onChange(updated);
  }, [allocations, onChange]);

  const isBalanced = Math.abs(total - 100) < 0.5;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-display font-bold text-near-black uppercase tracking-widest">
          Time allocation
        </span>
        <span className={`text-sm font-display font-bold ${isBalanced ? 'text-warm-brown' : 'text-tan'}`}>
          {Math.round(total)}% / 100%
        </span>
      </div>

      {allocations.map(alloc => {
        const pct = Math.round(alloc.percentage);
        const trackStyle = {
          background: `linear-gradient(to right, var(--color-warm-brown) ${pct}%, var(--color-tan) ${pct}%)`,
        };

        return (
          <div key={alloc.functionId} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-near-black font-body flex-1 truncate pr-2">
                {alloc.functionName}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-display font-bold text-near-black w-10 text-right tabular-nums">
                  {pct}%
                </span>
                <button
                  onClick={() => onRemove(alloc.functionId)}
                  className="w-5 h-5 rounded-full border border-tan bg-off-white hover:bg-near-black hover:border-near-black
                             hover:text-off-white flex items-center justify-center text-sage transition-colors flex-shrink-0"
                  aria-label="Remove"
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
              onChange={e => handleSliderChange(alloc.functionId, parseInt(e.target.value))}
              className="allocation-slider"
              style={trackStyle}
            />
          </div>
        );
      })}
    </div>
  );
}
