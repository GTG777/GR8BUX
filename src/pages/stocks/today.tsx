import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Layout } from '@/components/Layout';
import type { MacroData } from '@/pages/api/market/macro';

/* ── Types ─────────────────────────────────────────────────────── */
type SetupType = 'Breakout' | 'Pullback' | 'Earnings Play' | 'VWAP Reclaim' | 'Gap + Hold';
type CatalystType = 'Earnings Today' | 'Earnings AMC' | 'Analyst Upgrade' | 'Volume Spike' | 'Technical';
type Regime = 'risk-on' | 'risk-off' | 'neutral';

interface Setup {
  rank: number;
  symbol: string;
  company: string;
  price: number;
  changePct: number;
  catalyst: CatalystType;
  catalystDetail: string;
  setupType: SetupType;
  entry: number;
  stop: number;
  target: number;
  rr: string;
  score: number;
  reason: string;
}

interface MacroEvent {
  time: string;
  name: string;
  impact: 'high' | 'medium' | 'low';
  description: string;
  passed: boolean;
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals);
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400 font-bold';
  if (score >= 65) return 'text-yellow-600 dark:text-yellow-400 font-semibold';
  return 'text-gray-500 dark:text-zinc-400';
}

function changeColor(v: number) {
  return v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
}

function catalystBadgeClass(c: CatalystType) {
  switch (c) {
    case 'Earnings Today': return 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-500/40 animate-pulse';
    case 'Earnings AMC':   return 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-500/40';
    case 'Analyst Upgrade': return 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-500/40';
    case 'Volume Spike':   return 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-500/40';
    default:               return 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 border border-gray-300 dark:border-zinc-600';
  }
}

function setupBadgeClass(s: SetupType) {
  switch (s) {
    case 'Breakout':     return 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300';
    case 'Pullback':     return 'bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300';
    case 'Earnings Play': return 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300';
    case 'VWAP Reclaim': return 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300';
    case 'Gap + Hold':   return 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300';
  }
}

function impactBadge(impact: MacroEvent['impact']) {
  if (impact === 'high')   return 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-500/40';
  if (impact === 'medium') return 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-500/40';
  return 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700';
}

/* ── Market Pulse bar ─────────────────────────────────────────── */
function MacroPulse({ macro }: { macro: MacroData | null }) {
  if (!macro) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 animate-pulse">
        <div className="flex gap-6 flex-wrap">
          {[1,2,3,4].map(i => (
            <div key={i} className="flex flex-col gap-1">
              <div className="h-3 w-16 bg-gray-200 dark:bg-zinc-700 rounded" />
              <div className="h-5 w-20 bg-gray-100 dark:bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const regimeVariant: Record<Regime, { label: string; cls: string }> = {
    'risk-on':  { label: 'Risk-On ✅',  cls: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40' },
    'risk-off': { label: 'Risk-Off ⚠️', cls: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-500/40' },
    'neutral':  { label: 'Neutral',     cls: 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 border border-gray-300 dark:border-zinc-600' },
  };
  const regime = (macro.riskRegime as Regime) ?? 'neutral';
  const rv = regimeVariant[regime] ?? regimeVariant.neutral;

  const vixLabel =
    macro.vixRegime === 'low'      ? 'Low Volatility' :
    macro.vixRegime === 'elevated' ? 'Elevated'       :
    macro.vixRegime === 'extreme'  ? 'Extreme Fear'   : 'Normal';

  const tiles: { label: string; value: string; sub?: string; color?: string }[] = [
    {
      label: 'S&P 500 (SPY)',
      value: macro.spy ? `$${fmt(macro.spy.price)}` : '—',
      sub:   macro.spy ? `${macro.spy.changePct >= 0 ? '+' : ''}${fmt(macro.spy.changePct)}%` : undefined,
      color: macro.spy ? changeColor(macro.spy.changePct) : undefined,
    },
    {
      label: `VIX · ${vixLabel}`,
      value: macro.vix ? fmt(macro.vix.price) : '—',
      sub:   macro.vix ? `${macro.vix.changePct >= 0 ? '+' : ''}${fmt(macro.vix.changePct)}%` : undefined,
      color: macro.vix && macro.vix.price > 25 ? 'text-red-500' : 'text-gray-700 dark:text-zinc-200',
    },
    {
      label: '10yr Yield',
      value: macro.t10y ? `${fmt(macro.t10y.price)}%` : '—',
      sub:   macro.t10y ? `${macro.t10y.changePct >= 0 ? '+' : ''}${fmt(macro.t10y.changePct)}%` : undefined,
      color: macro.t10y ? changeColor(macro.t10y.changePct) : undefined,
    },
    {
      label: 'Gold',
      value: macro.gold ? `$${fmt(macro.gold.price)}` : '—',
      sub:   macro.gold ? `${macro.gold.changePct >= 0 ? '+' : ''}${fmt(macro.gold.changePct)}%` : undefined,
      color: macro.gold ? changeColor(macro.gold.changePct) : undefined,
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Market Pulse</span>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${rv.cls}`}>{rv.label}</span>
        <div className="flex-1" />
        <div className="flex gap-6 flex-wrap">
          {tiles.map(t => (
            <div key={t.label} className="flex flex-col gap-0.5 min-w-[90px]">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">{t.label}</span>
              <span className="text-base font-bold text-gray-800 dark:text-white leading-none">{t.value}</span>
              {t.sub && <span className={`text-xs font-medium ${t.color ?? ''}`}>{t.sub}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Macro Events strip ────────────────────────────────────────── */
function MacroEvents({ events }: { events: MacroEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider shrink-0">Today&apos;s Events</span>
        <div className="flex gap-2 flex-wrap">
          {events.map((e, i) => (
            <div key={i} title={e.description} className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium cursor-help ${e.passed ? 'opacity-40 line-through' : ''} ${impactBadge(e.impact)}`}>
              {e.impact === 'high' && <span>⚠️</span>}
              <span>{e.time}</span>
              <span>{e.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Score bar ─────────────────────────────────────────────────── */
function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 65 ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-zinc-600';
  return (
    <div className="flex items-center gap-2 w-24">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-zinc-700 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs tabular-nums w-8 ${scoreColor(score)}`}>{score}</span>
    </div>
  );
}

/* ── Expanded row detail ────────────────────────────────────────── */
function SetupDetail({ setup }: { setup: Setup }) {
  return (
    <div className="px-4 py-3 bg-gray-50 dark:bg-zinc-800/60 border-t border-gray-100 dark:border-zinc-700 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-1">Why flagged</p>
          <p className="text-gray-700 dark:text-zinc-200 leading-snug">{setup.reason}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-1">Trade levels</p>
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-gray-600 dark:text-zinc-300">Entry: <strong className="text-gray-800 dark:text-white">${fmt(setup.entry)}</strong></span>
            <span className="text-red-600 dark:text-red-400">Stop: <strong>${fmt(setup.stop)}</strong></span>
            <span className="text-emerald-600 dark:text-emerald-400">Target: <strong>${fmt(setup.target)}</strong></span>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-1">Catalyst detail</p>
          <p className="text-gray-700 dark:text-zinc-200 leading-snug">{setup.catalystDetail}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/trades/new?symbol=${setup.symbol}&entry=${setup.entry}&stop=${setup.stop}&target=${setup.target}&catalyst=${encodeURIComponent(setup.catalyst)}`}
          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
        >
          → Plan This Trade
        </Link>
        <Link
          href={`/stocks?symbol=${setup.symbol}`}
          className="px-4 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-600 text-gray-600 dark:text-zinc-300 hover:border-indigo-400 dark:hover:border-indigo-500 text-xs font-medium transition-colors"
        >
          View Chart
        </Link>
      </div>
    </div>
  );
}

/* ── Scanner table ─────────────────────────────────────────────── */
function ScannerTable({ setups, loading }: { setups: Setup[]; loading: boolean }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggle = (rank: number) => setExpanded(prev => prev === rank ? null : rank);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-zinc-800">
          <div className="h-4 w-48 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse" />
        </div>
        {[1,2,3,4].map(i => (
          <div key={i} className="p-4 border-b border-gray-100 dark:border-zinc-800 animate-pulse">
            <div className="flex gap-4">
              <div className="h-5 w-12 bg-gray-200 dark:bg-zinc-700 rounded" />
              <div className="h-5 w-32 bg-gray-100 dark:bg-zinc-800 rounded" />
              <div className="h-5 w-24 bg-gray-100 dark:bg-zinc-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (setups.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
        <p className="text-gray-400 dark:text-zinc-500 text-sm">AI found no high-quality setups right now.</p>
        <p className="text-gray-400 dark:text-zinc-500 text-xs mt-1">Market conditions may not favor trading today. Check back after the next scan.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700">
            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 w-8">#</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">Symbol</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">Setup</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">Catalyst</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">Entry</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">Stop</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">Target</th>
            <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">R:R</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 w-32">AI Score</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {setups.map((s) => (
            <React.Fragment key={s.symbol}>
              <tr
                className="border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
                onClick={() => toggle(s.rank)}
              >
                <td className="px-4 py-3.5 text-xs font-bold text-gray-400 dark:text-zinc-500">{s.rank}</td>

                {/* Symbol + price change */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 dark:text-white text-sm">{s.symbol}</span>
                    <span className={`text-xs font-semibold tabular-nums ${changeColor(s.changePct)}`}>
                      {s.changePct >= 0 ? '+' : ''}{fmt(s.changePct)}%
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-zinc-400">{s.company}</span>
                </td>

                {/* Setup type */}
                <td className="px-4 py-3.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${setupBadgeClass(s.setupType)}`}>{s.setupType}</span>
                </td>

                {/* Catalyst */}
                <td className="px-4 py-3.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${catalystBadgeClass(s.catalyst)}`}>{s.catalyst}</span>
                </td>

                {/* Levels */}
                <td className="px-4 py-3.5 text-right text-xs font-mono text-gray-700 dark:text-zinc-200">${fmt(s.entry)}</td>
                <td className="px-4 py-3.5 text-right text-xs font-mono text-red-500 dark:text-red-400">${fmt(s.stop)}</td>
                <td className="px-4 py-3.5 text-right text-xs font-mono text-emerald-600 dark:text-emerald-400">${fmt(s.target)}</td>

                {/* R:R */}
                <td className="px-4 py-3.5 text-center text-xs font-semibold text-gray-700 dark:text-zinc-200">{s.rr}</td>

                {/* Score */}
                <td className="px-4 py-3.5"><ScoreBar score={s.score} /></td>

                {/* Chevron */}
                <td className="px-3 py-3.5 text-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggle(s.rank); }}
                    className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-400 dark:text-zinc-400 transition-colors"
                    aria-label={expanded === s.rank ? 'Collapse' : 'Expand'}
                  >
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${expanded === s.rank ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </td>
              </tr>

              {/* Expanded detail row */}
              {expanded === s.rank && (
                <tr className="bg-gray-50 dark:bg-zinc-800/60">
                  <td colSpan={10} className="p-0 border-b border-gray-200 dark:border-zinc-700">
                    <SetupDetail setup={s} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Regime banner ──────────────────────────────────────────────── */
function RegimeBanner({ regime, count }: { regime: Regime; count: number }) {
  if (regime === 'risk-on') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
        <span>✅</span>
        <span>Risk-On — {count} high-confidence setup{count !== 1 ? 's' : ''} found across S&P 500</span>
      </div>
    );
  }
  if (regime === 'risk-off') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-xs font-medium">
        <span>⚠️</span>
        <span>Risk-Off — Only {count} high-confidence setup{count !== 1 ? 's' : ''} passed the filter today. Market conditions are defensive.</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 text-xs font-medium">
      <span>⚙️</span>
      <span>Neutral conditions — {count} setup{count !== 1 ? 's' : ''} found. Trade selectively.</span>
    </div>
  );
}

/* ── Countdown to market open/close ────────────────────────────── */
function useMarketCountdown() {
  const [label, setLabel] = useState('');
  useEffect(() => {
    function compute() {
      const now = new Date();
      const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const h = et.getHours(), m = et.getMinutes();
      const mins = h * 60 + m;
      if (mins < 9 * 60 + 30) {
        const diff = (9 * 60 + 30) - mins;
        setLabel(`Market opens in ${Math.floor(diff / 60)}h ${diff % 60}m`);
      } else if (mins < 16 * 60) {
        const diff = 16 * 60 - mins;
        setLabel(`Market closes in ${Math.floor(diff / 60)}h ${diff % 60}m`);
      } else {
        setLabel('Market closed');
      }
    }
    compute();
    const t = setInterval(compute, 60_000);
    return () => clearInterval(t);
  }, []);
  return label;
}

/* ── Mock setup data (replace with API when intraday-scan-setups.ts is live) ── */
const MOCK_SETUPS: Setup[] = [
  {
    rank: 1,
    symbol: 'NVDA',
    company: 'NVIDIA Corp',
    price: 878.40,
    changePct: 1.8,
    catalyst: 'Earnings AMC',
    catalystDetail: 'Reports after close today. Expected move ±7.2%. IVR at 68 — elevated premium.',
    setupType: 'Breakout',
    entry: 878,
    stop: 861,
    target: 912,
    rr: '1 : 2.1',
    score: 87,
    reason: 'Strong bull trend (score +3), price breaking above 20-day high on 2.4x average volume. Earnings catalyst amplifies move potential. TechnicalSetups confidence: 84%.',
  },
  {
    rank: 2,
    symbol: 'UBER',
    company: 'Uber Technologies',
    price: 74.20,
    changePct: 2.3,
    catalyst: 'Analyst Upgrade',
    catalystDetail: 'Goldman Sachs upgraded to Buy with $90 price target. Volume ratio 3.1x.',
    setupType: 'Pullback',
    entry: 74.20,
    stop: 71.80,
    target: 80.50,
    rr: '1 : 2.6',
    score: 82,
    reason: 'Pulled back to rising 20 EMA after analyst upgrade. RSI at 52 — room to run. OBV slope positive — accumulation ongoing.',
  },
  {
    rank: 3,
    symbol: 'AMD',
    company: 'Advanced Micro Devices',
    price: 122.10,
    changePct: 1.2,
    catalyst: 'Volume Spike',
    catalystDetail: 'Volume 3.1x average with no news — institutional accumulation signal.',
    setupType: 'VWAP Reclaim',
    entry: 122,
    stop: 118,
    target: 132,
    rr: '1 : 2.5',
    score: 78,
    reason: 'Reclaimed VWAP after morning dip. Bull flag forming on 15-min chart. Trend score +2 (Bullish). RSI 58 — not extended.',
  },
  {
    rank: 4,
    symbol: 'AAPL',
    company: 'Apple Inc',
    price: 190.30,
    changePct: 0.7,
    catalyst: 'Technical',
    catalystDetail: 'Clean breakout above 52-week consolidation zone on above-average volume.',
    setupType: 'Breakout',
    entry: 190,
    stop: 187,
    target: 196,
    rr: '1 : 2.0',
    score: 71,
    reason: 'Breaking above resistance that held for 6 weeks. Volume 1.8x average confirms participation. Trend score +3 (Strong Bull).',
  },
];

const MOCK_EVENTS: MacroEvent[] = [
  { time: '8:30am', name: 'Initial Jobless Claims', impact: 'medium', description: 'Weekly count of new unemployment filings. Moves markets if significantly above/below expectations.', passed: true },
  { time: '2:00pm', name: 'FOMC Minutes', impact: 'high', description: 'Federal Reserve releases notes from its last interest rate meeting. Can cause sharp market moves — especially in bonds and tech.', passed: false },
];

/* ── Main Page ─────────────────────────────────────────────────── */
export default function MorningBriefPage() {
  const [macro, setMacro] = useState<MacroData | null>(null);
  const [macroLoading, setMacroLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [nextScan, setNextScan] = useState('');
  const countdown = useMarketCountdown();

  // In production this will be replaced by /api/market/setups (intraday scanner output)
  const setups = MOCK_SETUPS;
  const scannerLoading = false;

  const fetchMacro = useCallback(async () => {
    try {
      const res = await fetch('/api/market/macro');
      if (res.ok) {
        setMacro(await res.json());
        setLastUpdated(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
        const next = new Date(Date.now() + 10 * 60 * 1000);
        setNextScan(next.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      }
    } finally {
      setMacroLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMacro();
    const t = setInterval(fetchMacro, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchMacro]);

  const regime: Regime = (macro?.riskRegime as Regime) ?? 'neutral';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <Layout title="Morning Brief">
      <div className="space-y-4 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              ☀️ Morning Brief
            </h1>
            <p className="text-sm text-gray-400 dark:text-zinc-500 mt-0.5">{today} · {countdown}</p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-gray-400 dark:text-zinc-500">
                Updated {lastUpdated} · Next scan {nextScan}
              </span>
            )}
            <button
              onClick={fetchMacro}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-xs font-medium text-gray-600 dark:text-zinc-300 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Market Pulse */}
        {macroLoading ? <MacroPulse macro={null} /> : <MacroPulse macro={macro} />}

        {/* Macro Events */}
        <MacroEvents events={MOCK_EVENTS} />

        {/* Scanner section header */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Today&apos;s Best Setups</h2>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
              AI scanned S&P 500 stocks · ranked by confluence score · click any row to expand
            </p>
          </div>
          <RegimeBanner regime={regime} count={setups.length} />
        </div>

        {/* Scanner table */}
        <ScannerTable setups={setups} loading={scannerLoading} />

        {/* Footer note */}
        <p className="text-[11px] text-gray-400 dark:text-zinc-600 text-center pb-4">
          Setups are AI-generated suggestions based on technical analysis and catalyst data. They are not financial advice.
          Always define your entry, stop, and risk before trading.
        </p>

      </div>
    </Layout>
  );
}
