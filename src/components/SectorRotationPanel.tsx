import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { SectorData, SectorQuote, RotationRegime } from '@/pages/api/market/sectors';

const REFRESH_MS = 10 * 60 * 1000; // 10 minutes
const STALE_MS   = 15 * 60 * 1000; // show stale badge after 15 min

/* ── Fixed-position tooltip ────────────────────────────────────── */
function Tooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
      className="relative cursor-help"
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e)  => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={()  => setPos(null)}
    >
      {children}
      {pos && (
        <span
          className="fixed z-50 max-w-xs rounded-lg bg-gray-900 text-white text-xs px-3 py-2 shadow-xl pointer-events-none whitespace-pre-wrap leading-relaxed"
          style={{ left: pos.x + 14, top: pos.y - 8 }}
        >
          {content}
        </span>
      )}
    </span>
  );
}

/* ── Regime metadata ────────────────────────────────────────────── */
const REGIME_META: Record<RotationRegime, { label: string; color: string; tip: string }> = {
  'risk-on': {
    label: '🚀 Risk-On',
    color: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700/50',
    tip: 'Offensive sectors (Tech, Financials, Consumer Disc.) are outperforming.\nMarket is in growth/expansion mode — favour long momentum setups.',
  },
  'defensive': {
    label: '🛡️ Defensive',
    color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-700/50',
    tip: 'Defensive sectors (Utilities, Staples, Health Care) leading.\nInvestors seeking safety — potential market top or macro fear.',
  },
  'commodity': {
    label: '⛽ Commodity',
    color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-700/50',
    tip: 'Energy and Materials outperforming the broader market.\nInflation or supply concerns driving commodity names higher.',
  },
  'mixed': {
    label: '↔️ Mixed',
    color: 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 border-gray-200 dark:border-zinc-700',
    tip: 'No dominant sector theme today.\nWait for clearer leadership before making directional rotation bets.',
  },
};

/* ── Per-sector tooltip content ─────────────────────────────────── */
const SECTOR_INFO: Record<string, { what: string; bullish: string; bearish: string }> = {
  XLK:  { what: 'Large-cap US technology companies.', bullish: 'Risk-on environment, growth in demand, falling rates.', bearish: 'Rate hikes, tech earnings misses, regulatory headwinds.' },
  XLF:  { what: 'Banks, insurance, asset managers.', bullish: 'Steepening yield curve, credit expansion, rising rates.', bearish: 'Flat/inverted curve, credit stress, bank sector events.' },
  XLY:  { what: 'Discretionary consumer spending — retail, autos, restaurants.', bullish: 'Strong consumer, low unemployment, risk appetite high.', bearish: 'Consumer caution, recession fears, spending contraction.' },
  XLC:  { what: 'Media, telecom, internet platforms.', bullish: 'Ad spend up, big tech / streaming demand strong.', bearish: 'Discretionary ad spend pullback, streaming competition.' },
  XLI:  { what: 'Aerospace, defence, logistics, machinery.', bullish: 'Economic expansion, capex cycle, infrastructure spending.', bearish: 'Late-cycle slowdown, order books contracting.' },
  XLE:  { what: 'Oil, gas, and energy services companies.', bullish: 'Oil/gas supply tightness, geopolitical risk, inflation.', bearish: 'Demand destruction, recession, energy transition policy.' },
  XLB:  { what: 'Metals, mining, chemicals, construction materials.', bullish: 'Commodity supercycle, construction boom, weak USD.', bearish: 'Deflationary environment, strong USD, global slowdown.' },
  XLV:  { what: 'Pharmaceuticals, biotech, hospitals, health insurers.', bullish: 'Defensive rotation, late-cycle risk-off positioning.', bearish: 'Risk-on environment, policy / drug pricing overhangs.' },
  XLP:  { what: 'Food, beverage, household products — everyday essentials.', bullish: 'Investor fear, safety bid, recession hedge.', bearish: 'Risk appetite strong — staples ignored in bull markets.' },
  XLU:  { what: 'Electric, gas, water utilities.', bullish: 'Falling rate expectations, bond-proxy demand, fear trade.', bearish: 'Rising rates, risk-on sentiment, commodity input costs.' },
  XLRE: { what: 'REITs — commercial, residential, industrial real estate.', bullish: 'Falling rate expectations, income/yield demand.', bearish: 'Rising rates, credit tightening, commercial RE stress.' },
};

function SectorTooltipContent({ s }: { s: SectorQuote }) {
  const info = SECTOR_INFO[s.symbol];
  if (!info) return <span>{s.label} sector relative performance vs SPY.</span>;
  return (
    <span className="flex flex-col gap-1">
      <span className="font-semibold text-white">{s.emoji} {s.symbol} — {s.label}</span>
      <span className="text-zinc-300">{info.what}</span>
      <span className="mt-1 text-[10px] text-zinc-400 uppercase tracking-wide">When leading</span>
      <span className="text-green-300">{info.bullish}</span>
      <span className="mt-1 text-[10px] text-zinc-400 uppercase tracking-wide">When lagging</span>
      <span className="text-red-300">{info.bearish}</span>
    </span>
  );
}

/* ── Single sector card ─────────────────────────────────────────── */
function SectorCard({ s }: { s: SectorQuote }) {
  const absRel   = Math.abs(s.relStrength);
  const barPct   = Math.min(100, (absRel / 2) * 100);
  const barColor = s.relStrength >= 0 ? 'bg-green-400' : 'bg-red-400';
  const relArrow = s.relStrength > 0.05 ? '▲' : s.relStrength < -0.05 ? '▼' : '→';

  const statusColor =
    s.status === 'leading' ? 'border-green-300 dark:border-green-700/50 bg-green-50 dark:bg-green-900/20' :
    s.status === 'lagging' ? 'border-red-300 dark:border-red-700/50 bg-red-50 dark:bg-red-900/20' :
                             'border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800';

  const changePctColor = s.changePct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  const relColor       = s.relStrength > 0 ? 'text-green-600 dark:text-green-400' : s.relStrength < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400';

  return (
    <Tooltip content={<SectorTooltipContent s={s} />}>
      <div className={`rounded-lg border p-3 flex flex-col gap-1 cursor-help ${statusColor}`}>
        {/* Top row: symbol + rank + status badge */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-bold text-gray-800 dark:text-zinc-200">
            {s.emoji} {s.symbol}
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 dark:text-zinc-500">#{s.rank}</span>
            {s.status === 'leading' && (
              <span className="text-[10px] font-bold text-green-700 dark:text-green-300 bg-green-200 dark:bg-green-900/50 px-1.5 py-0.5 rounded">LEAD</span>
            )}
            {s.status === 'lagging' && (
              <span className="text-[10px] font-bold text-red-700 dark:text-red-300 bg-red-200 dark:bg-red-900/50 px-1.5 py-0.5 rounded">LAG</span>
            )}
          </div>
        </div>

        {/* Label */}
        <span className="text-[11px] text-gray-500 dark:text-zinc-400 leading-tight truncate">{s.label}</span>

        {/* Price */}
        {s.price > 0 && (
          <span className="text-[11px] font-mono text-gray-700 dark:text-zinc-300">${s.price.toFixed(2)}</span>
        )}

        {/* Change % + rel strength */}
        <div className="flex items-center justify-between mt-0.5">
          <span className={`text-sm font-semibold ${changePctColor}`}>
            {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
          </span>
          <span className={`text-xs font-medium ${relColor}`}>
            {relArrow} {s.relStrength >= 0 ? '+' : ''}{s.relStrength.toFixed(2)}%
          </span>
        </div>

        {/* Relative strength bar */}
        <div className="h-1 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden mt-0.5">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barPct}%` }} />
        </div>
      </div>
    </Tooltip>
  );
}

/* ── Section header tooltip ─────────────────────────────────────── */
function InfoIcon() {
  return (
    <svg className="inline w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 ml-1 -mt-0.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 01-1-1v-4a1 1 0 112 0v4a1 1 0 01-1 1z" clipRule="evenodd" />
    </svg>
  );
}

const SECTION_TOOLTIP = `Sector Rotation tracks which of the 11 S&P 500 GICS sectors are outperforming or underperforming SPY each day.

Relative Strength = sector daily % change minus SPY % change.
+ve → sector leading | -ve → sector lagging | bar width = magnitude.

Rotation Regimes:
• Risk-On   — Offensive sectors (Tech, Fin, Disc.) leading
• Defensive — Utilities, Staples, Health Care leading
• Commodity — Energy, Materials leading
• Mixed     — No clear dominant theme

Use sector rotation to confirm trade direction and avoid swimming against the macro tide. Data refreshes every 10 minutes.`;

/* ── Main panel ─────────────────────────────────────────────────── */
export default function SectorRotationPanel() {
  const [data, setData]     = useState<SectorData | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const fetchedAt = useRef<number>(0);

  const load = useCallback(() => {
    fetch('/api/market/sectors')
      .then((r) => r.json())
      .then((d: SectorData) => {
        setData(d);
        setError(null);
        fetchedAt.current = d.fetchedAt;
        setIsStale(Date.now() - d.fetchedAt > STALE_MS);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      load();
      setIsStale(Date.now() - fetchedAt.current > STALE_MS);
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-600">
        Sector data unavailable: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-48 mb-3" />
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-zinc-800 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const regime    = REGIME_META[data.rotationRegime];
  const ts        = new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isWeekend = data.spy.changePct === 0 && data.sectors.every((s) => s.changePct === 0);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-5 py-4 space-y-4">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Title with ⓘ tooltip */}
        <Tooltip content={<span className="whitespace-pre-wrap leading-relaxed">{SECTION_TOOLTIP}</span>}>
          <h2 className="text-sm font-bold text-gray-700 dark:text-zinc-300 cursor-help">
            🔄 Sector Rotation
            <InfoIcon />
          </h2>
        </Tooltip>

        {/* Regime badge */}
        <Tooltip content={<span className="whitespace-pre-wrap">{regime.tip}</span>}>
          <span className={`text-xs font-semibold border px-2 py-1 rounded-full cursor-help ${regime.color}`}>
            {regime.label}
          </span>
        </Tooltip>

        {/* Leader/laggard chips */}
        {data.leaders.length > 0 && (
          <span className="text-[11px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
            Leading: {data.leaders.slice(0, 2).join(', ')}
          </span>
        )}
        {data.laggards.length > 0 && (
          <span className="text-[11px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">
            Lagging: {data.laggards.slice(0, 2).join(', ')}
          </span>
        )}

        {/* Right side: stale + SPY + timestamp */}
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-500">
          {isStale && (
            <span className="text-amber-600 dark:text-amber-400 font-medium border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 rounded text-[10px]">
              Stale data
            </span>
          )}
          {isWeekend && (
            <span className="text-blue-500 dark:text-blue-400 border border-blue-300 dark:border-blue-700 px-1.5 py-0.5 rounded text-[10px]">
              prev close
            </span>
          )}
          <span>
            SPY {data.spy.changePct >= 0 ? '+' : ''}{data.spy.changePct.toFixed(2)}%
          </span>
          <span>·</span>
          <button
            onClick={load}
            className="hover:text-gray-700 dark:hover:text-zinc-200 transition-colors"
          >
            Updated {ts} · refresh
          </button>
        </div>
      </div>

      {/* ── 11 sector cards, sorted best → worst rel strength ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {data.sectors.map((s) => (
          <SectorCard key={s.symbol} s={s} />
        ))}
      </div>

      {/* ── Narrative summary ── */}
      <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed border-t border-gray-100 dark:border-zinc-800 pt-3">
        {data.narrative}
      </p>
    </div>
  );
}
