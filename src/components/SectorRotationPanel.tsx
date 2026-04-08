import React, { useEffect, useState, useRef } from 'react';
import type { SectorData, SectorQuote, RotationRegime } from '@/pages/api/market/sectors';

/* ── Fixed-position tooltip ────────────────────────────────────── */
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
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
          className="fixed z-50 max-w-xs rounded-lg bg-gray-900 text-white text-xs px-3 py-2 shadow-xl pointer-events-none whitespace-pre-wrap"
          style={{ left: pos.x + 12, top: pos.y - 8 }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

/* ── Regime badge ───────────────────────────────────────────────── */
const REGIME_META: Record<RotationRegime, { label: string; color: string; tip: string }> = {
  'risk-on':   {
    label: '🚀 Risk-On',
    color: 'bg-green-100 text-green-800 border-green-200',
    tip:   'Offensive sectors (Tech, Financials, Consumer Disc.) are outperforming.\nMarket is in growth/expansion mode — favour long momentum setups.',
  },
  'defensive': {
    label: '🛡️ Defensive Rotation',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    tip:   'Defensive sectors (Utilities, Staples, Health Care) leading.\nInvestors seeking safety — potential market top or macro fear.',
  },
  'commodity': {
    label: '⛽ Commodity Rotation',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    tip:   'Energy and Materials outperforming the broader market.\nInflation or supply concerns driving commodity names higher.',
  },
  'mixed': {
    label: '↔️ Mixed',
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    tip:   'No dominant sector theme today.\nWait for clearer leadership before making directional rotation bets.',
  },
};

/* ── Sector tooltip content ─────────────────────────────────────── */
const SECTOR_TIPS: Record<string, string> = {
  XLK:  'Technology leading → risk-on, algo/growth names favoured\nTechnology lagging → risk-off or rate-sensitive selloff',
  XLF:  'Financials leading → steepening yield curve, credit expansion\nFinancials lagging → rate concerns or credit stress',
  XLY:  'Consumer Disc. leading → strong consumer, risk appetite high\nConsumer Disc. lagging → consumer caution, growth slowdown',
  XLC:  'Communication leading → big tech/ad spend strong, risk-on\nCommunication lagging → discretionary spend pullback',
  XLI:  'Industrials leading → economic expansion, capex cycle\nIndustrials lagging → late-cycle slowdown signal',
  XLE:  'Energy leading → oil/gas supply tightness or inflation\nEnergy lagging → demand destruction, commodities cooling',
  XLB:  'Materials leading → commodity supercycle, construction demand\nMaterials lagging → deflationary environment',
  XLV:  'Health Care leading → defensive rotation, late-cycle positioning\nHealth Care lagging → risk-on environment, no fear',
  XLP:  'Consumer Staples leading → investor fear, safety bid\nConsumer Staples lagging → risk appetite strong, staples ignored',
  XLU:  'Utilities leading → bond proxy bid, yields falling, fear trade\nUtilities lagging → rising rates or risk-on sentiment',
  XLRE: 'Real Estate leading → falling rate expectations, REIT demand\nReal Estate lagging → rising rates or credit tightening',
};

/* ── Single sector card ─────────────────────────────────────────── */
function SectorCard({ s }: { s: SectorQuote }) {
  const absRel = Math.abs(s.relStrength);

  const statusColor =
    s.status === 'leading'  ? 'border-green-300 bg-green-50' :
    s.status === 'lagging'  ? 'border-red-300 bg-red-50' :
                              'border-gray-200 bg-white';

  const changePctColor =
    s.changePct >= 0 ? 'text-green-600' : 'text-red-600';

  const relColor =
    s.relStrength > 0 ? 'text-green-600' : s.relStrength < 0 ? 'text-red-600' : 'text-gray-400';

  const relArrow = s.relStrength > 0.05 ? '▲' : s.relStrength < -0.05 ? '▼' : '→';

  // Relative strength bar — max at ±2% → 100%
  const barPct = Math.min(100, (absRel / 2) * 100);
  const barColor = s.relStrength >= 0 ? 'bg-green-400' : 'bg-red-400';

  const tip = SECTOR_TIPS[s.symbol] ?? `${s.label} sector relative performance vs SPY.`;

  return (
    <Tooltip text={tip}>
      <div className={`rounded-lg border p-3 flex flex-col gap-1 ${statusColor}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-gray-700">
            {s.emoji} {s.symbol}
          </span>
          {s.status === 'leading' && (
            <span className="text-[10px] font-bold text-green-700 bg-green-200 px-1.5 py-0.5 rounded">LEAD</span>
          )}
          {s.status === 'lagging' && (
            <span className="text-[10px] font-bold text-red-700 bg-red-200 px-1.5 py-0.5 rounded">LAG</span>
          )}
        </div>
        <span className="text-[11px] text-gray-500 leading-tight">{s.label}</span>
        <div className="flex items-center justify-between mt-1">
          <span className={`text-sm font-semibold ${changePctColor}`}>
            {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
          </span>
          <span className={`text-xs font-medium ${relColor}`}>
            {relArrow} {s.relStrength >= 0 ? '+' : ''}{s.relStrength.toFixed(2)}% vs SPY
          </span>
        </div>
        {/* Relative strength mini bar */}
        <div className="h-1 bg-gray-200 rounded-full overflow-hidden mt-1">
          <div
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>
    </Tooltip>
  );
}

/* ── Main panel component ───────────────────────────────────────── */
export default function SectorRotationPanel() {
  const [data, setData] = useState<SectorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    fetch('/api/market/sectors')
      .then((r) => r.json())
      .then((d: SectorData) => setData(d))
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-600">
        Sector data unavailable: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-48 mb-3" />
        <div className="grid grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const regime = REGIME_META[data.rotationRegime];
  const ts = new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4 space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-bold text-gray-700">🔄 Sector Rotation</h2>
        <Tooltip text={regime.tip}>
          <span className={`text-xs font-semibold border px-2 py-1 rounded-full cursor-help ${regime.color}`}>
            {regime.label}
          </span>
        </Tooltip>
        <span className="text-xs text-gray-400 ml-auto">
          SPY {data.spy.changePct >= 0 ? '+' : ''}{data.spy.changePct.toFixed(2)}% · as of {ts}
        </span>
      </div>

      {/* 11 sector cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {data.sectors.map((s) => (
          <SectorCard key={s.symbol} s={s} />
        ))}
      </div>

      {/* Narrative */}
      <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-3">
        {data.narrative}
      </p>
    </div>
  );
}
