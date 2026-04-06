'use client';

import { useState, useEffect, useCallback } from 'react';
import { Timecard, TaxonomyNode, JobFunction, GeoLocation, RecentFunction } from '@/types';
import AllocationSliders from './AllocationSliders';
import FunctionSelector from './FunctionSelector';

interface Props {
  timecard: Timecard;
  onComplete: () => void;
  onUndo: () => void;
}

interface SelectedFunction {
  functionId: string;
  functionName: string;
  percentage: number;
}

interface ProductWithFunctions {
  id: string;
  name: string;
  functions: { id: string; name: string }[];
}

export default function CheckOutScreen({ timecard, onComplete, onUndo }: Props) {
  // Checkout state
  const [checkoutDone, setCheckoutDone] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [totalHours, setTotalHours] = useState(0);

  // Undo state
  const [undoing, setUndoing] = useState(false);

  // Geolocation
  const [checkOutLocation, setCheckOutLocation] = useState<GeoLocation | null>(null);

  // Allocation state
  const [selected, setSelected] = useState<SelectedFunction[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Survey data
  const [taxonomy, setTaxonomy] = useState<TaxonomyNode[]>([]);
  const [products, setProducts] = useState<ProductWithFunctions[]>([]);
  const [recentFunctions, setRecentFunctions] = useState<RecentFunction[]>([]);
  const [lastShift, setLastShift] = useState<SelectedFunction[] | null>(null);

  const checkInTime = new Date(timecard.checkInTime);

  // On mount: start geolocation, call checkout, load survey data in parallel
  useEffect(() => {
    // Geolocation (non-blocking)
    if (navigator?.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCheckOutLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: new Date().toISOString(),
        }),
        () => {},
        { timeout: 10000, maximumAge: 60000 }
      );
    }

    // Clock out immediately
    async function doCheckout() {
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timecardId: timecard.id }),
        });
        const data = await res.json();
        if (!res.ok) {
          setCheckoutError(data.error || 'Check-out failed.');
          return;
        }
        setTotalHours(data.totalHours);
        setCheckoutDone(true);
      } catch {
        setCheckoutError('Something went wrong. Try again.');
      }
    }

    // Load survey data
    async function loadSurveyData() {
      const [cats, fns, prods, recent] = await Promise.all([
        fetch('/api/categories').then(r => r.json()),
        fetch('/api/functions').then(r => r.json()),
        fetch('/api/products').then(r => r.json()),
        fetch('/api/recent-functions').then(r => r.json()),
      ]);

      const fnList: JobFunction[] = fns.functions || [];
      const tree: TaxonomyNode[] = (cats.categories || []).map((cat: TaxonomyNode) => ({
        ...cat,
        functions: fnList.filter((f: JobFunction) => f.categoryId === cat.id),
      }));
      const productsWithFunctions: ProductWithFunctions[] = (prods.products || []).map(
        (p: { id: string; name: string; functionIds: string[] }) => ({
          id: p.id,
          name: p.name,
          functions: (p.functionIds || [])
            .map((fid: string) => fnList.find(f => f.id === fid))
            .filter(Boolean) as { id: string; name: string }[],
        })
      );

      setTaxonomy(tree);
      setProducts(productsWithFunctions);
      setRecentFunctions(recent.recent || []);
      setLastShift(recent.lastShift || null);
    }

    doCheckout();
    loadSurveyData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFunction = useCallback((fn: { id: string; name: string }) => {
    setSelected(prev => {
      if (prev.find(s => s.functionId === fn.id)) return prev;
      const updated = [...prev, { functionId: fn.id, functionName: fn.name, percentage: 0 }];
      const even = Math.floor(100 / updated.length);
      const rem = 100 - even * updated.length;
      return updated.map((s, i) => ({ ...s, percentage: i === 0 ? even + rem : even }));
    });
  }, []);

  const removeFunction = useCallback((functionId: string) => {
    setSelected(prev => {
      const next = prev.filter(s => s.functionId !== functionId);
      if (next.length === 0) return [];
      const removedPct = prev.find(s => s.functionId === functionId)?.percentage || 0;
      const total = next.reduce((sum, s) => sum + s.percentage, 0);
      if (total === 0) {
        const even = Math.floor(100 / next.length);
        const rem = 100 - even * next.length;
        return next.map((s, i) => ({ ...s, percentage: i === 0 ? even + rem : even }));
      }
      return next.map(s => ({
        ...s,
        percentage: Math.round((s.percentage + (removedPct * s.percentage) / total) * 10) / 10,
      }));
    });
  }, []);

  const updatePercentages = useCallback((updated: SelectedFunction[]) => setSelected(updated), []);

  const handleSameAsLastTime = useCallback((fns: SelectedFunction[]) => {
    setSelected(fns);
  }, []);

  const totalPct = selected.reduce((sum, s) => sum + s.percentage, 0);
  const isBalanced = Math.abs(totalPct - 100) < 0.5;

  async function handleUndo() {
    setUndoing(true);
    try {
      await fetch('/api/undo-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timecardId: timecard.id }),
      });
      onUndo();
    } catch {
      setUndoing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/checkout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timecardId: timecard.id,
          allocations: selected.map(s => ({
            functionId: s.functionId,
            functionName: s.functionName,
            percentage: s.percentage,
          })),
          checkOutLocation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onComplete();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setSaving(false);
    }
  }

  // Brief loading state while checkout is being processed
  if (!checkoutDone && !checkoutError) {
    return (
      <div className="min-h-screen bg-off-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Checkout API error (rare)
  if (checkoutError) {
    return (
      <div className="min-h-screen bg-off-white flex items-center justify-center p-8">
        <div className="bg-white rounded-lg border border-tan shadow-card p-6 w-full max-w-sm text-center">
          <p className="font-display font-bold text-near-black mb-2">Couldn't clock out</p>
          <p className="text-sage text-sm font-body mb-4">{checkoutError}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-warm-brown text-off-white px-6 py-3 rounded-lg font-display font-bold hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-off-white flex flex-col">

      {/* Sticky: banner + slider panel */}
      <div className="sticky top-0 z-20">

        {/* You're clocked out banner */}
        <div className="bg-near-black px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-off-white font-body">You&apos;re clocked out.</span>
            <span className="text-off-white/30 font-body">—</span>
            <button
              onClick={handleUndo}
              disabled={undoing}
              className="text-tan font-display font-bold hover:text-off-white transition-colors disabled:opacity-40"
            >
              {undoing ? 'Undoing...' : 'Undo'}
            </button>
          </div>
          <span className="text-off-white/50 text-xs font-mono">
            {totalHours.toFixed(1)}h
          </span>
        </div>

        {/* Allocation slider panel */}
        {selected.length > 0 && (
          <div className="bg-white border-b border-tan shadow-card">
            <AllocationSliders
              allocations={selected}
              onChange={updatePercentages}
              onRemove={removeFunction}
            />
            {isBalanced && (
              <div className="px-4 pb-4 space-y-2">
                {saveError && (
                  <p className="text-xs text-near-black bg-tan/20 border border-tan rounded px-3 py-2 font-body">
                    {saveError}
                  </p>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-warm-brown text-off-white py-3 rounded-lg font-display font-bold
                             hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-off-white/50 border-t-off-white rounded-full animate-spin" />
                      Saving...
                    </span>
                  ) : 'Save'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Survey */}
      <div className="flex-1 overflow-auto bg-white">
        <FunctionSelector
          taxonomy={taxonomy}
          products={products}
          recentFunctions={recentFunctions}
          lastShift={lastShift}
          selectedIds={selected.map(s => s.functionId)}
          onSelect={addFunction}
          onSameAsLastTime={handleSameAsLastTime}
        />
      </div>
    </div>
  );
}
