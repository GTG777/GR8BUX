import React, { useEffect, useState } from 'react';
import type { SectorData, SectorQuote } from '@/pages/api/market/sectors';

function tileColor(pct: number): string {
  if (pct >= 2)    return 'bg-green-700 text-white';
  if (pct >= 1)    return 'bg-green-600 text-white';
  if (pct >= 0.3)  return 'bg-green-500 text-white';
  if (pct >= 0)    return 'bg-green-200 text-green-900 dark:bg-green-900/40 dark:text-green-200';
  if (pct >= -0.3) return 'bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-200';
  if (pct >= -1)   return 'bg-red-500 text-white';
  if (pct >= -2)   return 'bg-red-600 text-white';
  return 'bg-red-700 text-white';
}

function SectorTile({ s }: { s: SectorQuote }) {
  const cls = tileColor(s.changePct);
  return (
    <div className={`rounded-xl p-3 flex flex-col gap-1 ${cls} transition-colors`}>
      <div className="flex items-center justify-between">
        <span className="text-lg leading-none">{s.emoji}</span>
        <span className="text-xs font-bold tabular-nums">
          {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
        </span>
      </div>
      <p className="text-xs font-semibold leading-tight mt-1">{s.label}</p>
      <p className="text-[10px] font-medium opacity-80">{s.symbol}</p>
    </div>
  );
}

export default function SectorGrid() {
  const [data, setData] = useState<SectorData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/market/sectors')
      .then((r) => r.json())
      .then((d: SectorData) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-6 text-center text-sm text-gray-400">
        Sector data unavailable
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-4">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="rounded-xl h-[84px] bg-gray-100 dark:bg-zinc-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const regimeColor =
    data.rotationRegime === 'risk-on'   ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
    data.rotationRegime === 'defensive' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' :
    data.rotationRegime === 'commodity' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300' :
                                          'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300';
  const regimeLabel =
    data.rotationRegime === 'risk-on'   ? '↑ Risk-On'   :
    data.rotationRegime === 'defensive' ? '↓ Defensive' :
    data.rotationRegime === 'commodity' ? '⛽ Commodity' : '→ Mixed';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold text-gray-800 dark:text-white">Sector Heatmap</h2>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${regimeColor}`}>
            {regimeLabel}
          </span>
          <span className="text-xs text-gray-400 dark:text-zinc-500">SPY {data.spy.changePct >= 0 ? '+' : ''}{data.spy.changePct.toFixed(2)}%</span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {data.sectors.map((s) => (
          <SectorTile key={s.symbol} s={s} />
        ))}
      </div>

      {/* Narrative */}
      {data.narrative && (
        <p className="text-xs text-gray-500 dark:text-zinc-400 border-t border-gray-100 dark:border-zinc-800 pt-2">
          {data.narrative}
        </p>
      )}
    </div>
  );
}
