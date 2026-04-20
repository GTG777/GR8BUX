import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { MacroData, MacroQuote } from '@/pages/api/market/macro';

const REFRESH_MS = 10 * 60 * 1000; // 10 minutes — matches server cache TTL
const STALE_MS   = 15 * 60 * 1000; // 15 minutes — warn if data older than this

/* ── Helpers ─────────────────────────────────────────────────────── */
function changeColor(pct: number): string {
  if (pct > 0.3) return 'text-green-600';
  if (pct < -0.3) return 'text-red-500';
  return 'text-gray-500';
}
function fmtPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}
function fmtPrice(q: MacroQuote, decimals = 2): string {
  return q.price.toFixed(decimals);
}

/* ── Single metric tile ──────────────────────────────────────────── */
function Tile({ q, unit = '', decimals = 2, tooltip }: {
  q: MacroQuote; unit?: string; decimals?: number; tooltip?: string;
}) {
  const [showTip, setShowTip] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return (
    <div
      className="relative flex flex-col gap-0.5 min-w-[90px]"
      onMouseEnter={(e) => { if (tooltip) { setPos({ x: e.clientX + 12, y: e.clientY - 8 }); setShowTip(true); } }}
      onMouseLeave={() => setShowTip(false)}
      onMouseMove={(e) => { if (tooltip) setPos({ x: e.clientX + 12, y: e.clientY - 8 }); }}
    >
      <span className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">{q.label}</span>
      <span className="text-base font-bold text-gray-800 dark:text-white leading-none">
        {fmtPrice(q, decimals)}{unit}
      </span>
      <span className={`text-xs font-medium ${changeColor(q.changePct)}`}>{fmtPct(q.changePct)}</span>
      {tooltip && showTip && (
        <div
          className="fixed z-[9999] w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none leading-relaxed"
          style={{ left: pos.x, top: pos.y }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}

/* ── VIX regime badge ────────────────────────────────────────────── */
function VixBadge({ regime }: { regime: MacroData['vixRegime'] }) {
  const map = {
    low:      { label: 'VIX Low < 15',      cls: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',  tip: 'Markets are calm. Premium sellers have an edge but premiums are thin. Complacency risk rising.' },
    normal:   { label: 'VIX Normal 15–20',   cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',   tip: 'Normal volatility conditions — balanced environment for both buying and selling premium.' },
    elevated: { label: 'VIX Elevated 20–30', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300', tip: 'Elevated fear — premiums are rich. Excellent time to sell credit spreads and collect inflated premium.' },
    extreme:  { label: 'VIX Extreme > 30',   cls: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',     tip: 'Panic mode. IV is very expensive — premium sellers win big if fear subsides. Wide bid/ask spreads require care.' },
  };
  const { label, cls, tip } = map[regime];
  const [showTip, setShowTip] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return (
    <div
      className="relative"
      onMouseEnter={(e) => { setPos({ x: e.clientX + 12, y: e.clientY - 8 }); setShowTip(true); }}
      onMouseLeave={() => setShowTip(false)}
      onMouseMove={(e) => setPos({ x: e.clientX + 12, y: e.clientY - 8 })}
    >
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold cursor-help ${cls}`}>{label}</span>
      {showTip && (
        <div
          className="fixed z-[9999] w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none leading-relaxed"
          style={{ left: pos.x, top: pos.y }}
        >
          {tip}
        </div>
      )}
    </div>
  );
}

/* ── Yield curve badge ───────────────────────────────────────────── */
function YieldCurveBadge({ regime, spreadBps }: { regime: MacroData['yieldCurveRegime']; spreadBps: number }) {
  const map = {
    normal:   { label: `Normal +${spreadBps}bps`,   cls: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',  tip: 'Healthy yield curve — long rates above short rates. Economy expanding, banks profitable. Risk-on conditions favoured.' },
    flat:     { label: `Flat ±${Math.abs(spreadBps)}bps`,    cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300', tip: 'Flat yield curve — growth uncertainty. Markets pricing in slowing but no recession. Mixed signals for equities.' },
    inverted: { label: `Inverted ${spreadBps}bps`,  cls: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',     tip: 'Inverted yield curve — historically signals recession within 12–18 months. Risk-off bias, defensive sectors preferred.' },
  };
  const { label, cls, tip } = map[regime];
  const [showTip, setShowTip] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return (
    <div
      className="relative"
      onMouseEnter={(e) => { setPos({ x: e.clientX + 12, y: e.clientY - 8 }); setShowTip(true); }}
      onMouseLeave={() => setShowTip(false)}
      onMouseMove={(e) => setPos({ x: e.clientX + 12, y: e.clientY - 8 })}
    >
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold cursor-help ${cls}`}>{label}</span>
      {showTip && (
        <div
          className="fixed z-[9999] w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none leading-relaxed"
          style={{ left: pos.x, top: pos.y }}
        >
          {tip}
        </div>
      )}
    </div>
  );
}

/* ── Risk regime badge ───────────────────────────────────────────── */
function RiskBadge({ regime }: { regime: MacroData['riskRegime'] }) {
  const map = {
    'risk-on':  { label: '📈 Risk-On',  cls: 'bg-green-600 text-white', tip: 'Risk appetite is healthy — equities, tech, and growth assets have tailwinds. Bull put spreads and cash-secured puts have strong edge.' },
    'risk-off': { label: '🛡️ Risk-Off', cls: 'bg-red-600 text-white',   tip: 'Fear is elevated — money is rotating to bonds, gold, and defensive assets. Bear call spreads and puts have structural support.' },
    'neutral':  { label: '→ Neutral',   cls: 'bg-gray-600 text-white',  tip: 'Mixed signals — no clear directional bias. Iron condors and range-bound strategies fit best.' },
  };
  const { label, cls, tip } = map[regime];
  const [showTip, setShowTip] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return (
    <div
      className="relative"
      onMouseEnter={(e) => { setPos({ x: e.clientX + 12, y: e.clientY - 8 }); setShowTip(true); }}
      onMouseLeave={() => setShowTip(false)}
      onMouseMove={(e) => setPos({ x: e.clientX + 12, y: e.clientY - 8 })}
    >
      <span className={`px-3 py-1.5 rounded-lg text-sm font-bold cursor-help ${cls}`}>{label}</span>
      {showTip && (
        <div
          className="fixed z-[9999] w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none leading-relaxed"
          style={{ left: pos.x, top: pos.y }}
        >
          {tip}
        </div>
      )}
    </div>
  );
}

/* ── Section header tooltip (ⓘ) ─────────────────────────────────── */
function SectionTooltip() {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return (
    <span
      className="relative inline-flex items-center cursor-help"
      onMouseEnter={(e) => { setPos({ x: e.clientX + 12, y: e.clientY - 8 }); setShow(true); }}
      onMouseLeave={() => setShow(false)}
      onMouseMove={(e) => setPos({ x: e.clientX + 12, y: e.clientY - 8 })}
    >
      <svg className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {show && (
        <div
          className="fixed z-[9999] w-72 bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 shadow-xl pointer-events-none leading-relaxed"
          style={{ left: pos.x, top: pos.y }}
        >
          <p className="font-semibold mb-1 text-white">What is the Macro Dashboard?</p>
          <p>Pulls live market data (VIX, SPY, Treasuries, Gold, Oil, Dollar, Bonds) and synthesises them into three regime signals — <strong>Risk Regime</strong>, <strong>VIX Level</strong>, and <strong>Yield Curve</strong> — that tell you at a glance whether market conditions favour bullish, bearish, or neutral options strategies. Data refreshes every 10 minutes.</p>
        </div>
      )}
    </span>
  );
}

/* ── Main MacroBar ───────────────────────────────────────────────── */
export default function MacroBar() {
  const [data, setData]       = useState<MacroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMacro = useCallback(async () => {
    try {
      const r = await fetch('/api/market/macro');
      const d = await r.json();
      setData(d);
      setLastUpdated(new Date());
      setError('');
    } catch {
      setError('Macro data unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMacro();
    intervalRef.current = setInterval(fetchMacro, REFRESH_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchMacro]);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-5 py-4 flex items-center gap-3 text-sm text-gray-400 dark:text-zinc-500">
        <span className="w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
        Loading macro data…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-5 py-3 text-xs text-gray-400 dark:text-zinc-500">
        {error || 'Macro data unavailable'}
      </div>
    );
  }

  const isStale = data && (Date.now() - data.fetchedAt > STALE_MS);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-5 py-4 space-y-4">

      {/* ── Row 1: Header + regime badges ── */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-sm font-bold text-gray-700 dark:text-zinc-300 shrink-0">
          Macro Dashboard
          <SectionTooltip />
        </span>
        <RiskBadge regime={data.riskRegime} />
        <VixBadge regime={data.vixRegime} />
        <YieldCurveBadge regime={data.yieldCurveRegime} spreadBps={data.yieldSpread} />
        <div className="ml-auto flex items-center gap-2">
          {!data.marketOpen && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400">
              prev close
            </span>
          )}
          {isStale && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              Stale data
            </span>
          )}
          <span className="text-[10px] text-gray-400 dark:text-zinc-600">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · `
              : ''}
            <button
              onClick={fetchMacro}
              className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-zinc-400 transition-colors"
            >
              refresh
            </button>
          </span>
        </div>
      </div>

      {/* ── Row 2: Tiles grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-4 gap-y-3 border-t border-gray-100 dark:border-zinc-800 pt-4">

        <Tile
          q={data.vix}
          decimals={2}
          tooltip="CBOE Volatility Index — measures expected 30-day volatility of S&P 500 options. Below 15: calm. 15–20: normal. 20–30: fearful. Above 30: panic."
        />

        <Tile
          q={data.spy}
          decimals={2}
          tooltip="S&P 500 ETF — the broadest measure of US large-cap equity performance. Direction sets the macro tone for most equity options strategies."
        />

        <div className="flex flex-col gap-0.5 min-w-[100px]">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Yield Curve</span>
          <span className="text-base font-bold text-gray-800 dark:text-white leading-none">
            {data.t2y.price.toFixed(2)}% / {data.t10y.price.toFixed(2)}%
          </span>
          <span className="text-xs text-gray-500 dark:text-zinc-400">2Y / 10Y · spread {data.yieldSpread > 0 ? '+' : ''}{data.yieldSpread}bps</span>
        </div>

        <Tile
          q={data.gold}
          decimals={2}
          tooltip="Gold ETF (GLD) — rises during risk-off, inflation fears, and USD weakness. Gold up + stocks down = flight-to-safety signal. Bearish for equities."
        />

        <Tile
          q={data.oil}
          decimals={2}
          tooltip="Crude Oil ETF (USO) — rising oil boosts Energy sector but pressures consumer spending and airline/transport stocks. Also an inflation leading indicator."
        />

        <Tile
          q={data.dollar}
          decimals={2}
          tooltip="US Dollar Bull ETF (UUP) — strong dollar is headwind for multinational earnings (AAPL, MSFT, GOOGL), commodities, and emerging markets. Dollar up = risk-off."
        />

        <Tile
          q={data.bonds}
          decimals={2}
          tooltip="20+ Year Treasury Bond ETF (TLT) — rises when investors flee to safety (risk-off). TLT up strongly = fear spike. TLT falling = risk appetite improving, rates rising."
        />

        <Tile
          q={data.t10y}
          unit="%"
          decimals={3}
          tooltip="10-Year Treasury Yield — the benchmark interest rate. Rising yields compress equity valuations (especially growth/tech). Above 4.5% historically pressures P/E multiples."
        />
      </div>

      {/* ── Row 3: Intermarket narrative ── */}
      <div className="border-t border-gray-100 dark:border-zinc-800 pt-3">
        <IntermarketNarrative data={data} />
      </div>
    </div>
  );
}

/* ── Intermarket narrative ───────────────────────────────────────── */
function IntermarketNarrative({ data }: { data: MacroData }) {
  const lines: string[] = [];

  // VIX context
  if (data.vixRegime === 'extreme')
    lines.push(`⚡ VIX at ${data.vix.price.toFixed(1)} — extreme fear. Premium sellers have a major edge if volatility normalises; manage position size carefully.`);
  else if (data.vixRegime === 'elevated')
    lines.push(`🔥 VIX at ${data.vix.price.toFixed(1)} — elevated fear. Options premium is inflated; credit spreads are well-supported.`);
  else if (data.vixRegime === 'low')
    lines.push(`💤 VIX at ${data.vix.price.toFixed(1)} — complacency. Premiums are thin; consider reducing spread selling size or widening strikes.`);

  // Yield curve
  if (data.yieldCurveRegime === 'inverted')
    lines.push(`⚠️ Yield curve inverted (${data.yieldSpread}bps) — historically signals recession risk within 12–18 months. Favour defensive sectors and defined-risk trades.`);
  else if (data.yieldCurveRegime === 'normal')
    lines.push(`✅ Yield curve normal (+${data.yieldSpread}bps) — healthy expansion signal. Financials and cyclicals tend to outperform.`);

  // Gold vs Dollar divergence
  if (data.gold.changePct > 0.5 && data.dollar.changePct > 0.5)
    lines.push(`🔔 Both Gold and Dollar rising simultaneously — unusual signal. Often precedes a sharp risk-off event (geopolitical or credit stress).`);
  else if (data.gold.changePct > 0.5 && data.dollar.changePct < -0.3)
    lines.push(`🥇 Gold up, Dollar down — classic risk-off rotation into hard assets. Bearish for tech/growth equities short-term.`);
  else if (data.gold.changePct < -0.3 && data.dollar.changePct > 0.3)
    lines.push(`💵 Dollar strengthening, Gold falling — risk-on tilt. Equities typically follow; bull put spreads favoured.`);

  // Bonds vs Equities
  if (data.bonds.changePct > 0.5 && data.spy.changePct < -0.3)
    lines.push(`🛡️ Bonds rallying while equities fall — flight-to-safety underway. Reduce directional bullish exposure.`);
  else if (data.bonds.changePct < -0.5 && data.spy.changePct > 0.3)
    lines.push(`📈 Equities up, Bonds down — risk-on rotation. Rising rates + rising stocks suggest strong economic confidence.`);

  // 10-year yield pressure on tech
  if (data.t10y.price > 4.5 && data.t10y.changePct > 0.5)
    lines.push(`📊 10Y yield at ${data.t10y.price.toFixed(2)}% and rising — growth and tech valuations under pressure. Bear call spreads on QQQ may outperform.`);

  if (!lines.length) {
    lines.push('→ No major intermarket divergences detected. Mixed signals — standard position sizing applies.');
  }

  return (
    <div className="space-y-1.5">
      {lines.map((l, i) => (
        <p key={i} className="text-xs text-gray-600 leading-relaxed">{l}</p>
      ))}
    </div>
  );
}
