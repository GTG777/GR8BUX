import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Layout } from '@/components/Layout';
import type { MacroData } from '@/pages/api/market/macro';
import type { PreBreakoutRow } from '@/pages/api/market/prebreakout';

/* ── Types ─────────────────────────────────────────────────────── */
type SetupType = 'Breakout' | 'Pullback' | 'Earnings Play' | 'VWAP Reclaim' | 'Gap + Hold';
type CatalystType = 'Earnings Today' | 'Earnings AMC' | 'Analyst Upgrade' | 'Volume Spike' | 'Technical';
type Regime = 'risk-on' | 'risk-off' | 'neutral';
type ActiveTab = 'moving' | 'coiling';

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
    case 'Breakout':      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    case 'Pullback':      return 'bg-sky-500/20 text-sky-300 border border-sky-500/30';
    case 'Earnings Play': return 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
    case 'VWAP Reclaim':  return 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
    case 'Gap + Hold':    return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
  }
}

function impactBadge(impact: MacroEvent['impact']) {
  if (impact === 'high')   return 'bg-red-500/20 text-red-300 border border-red-500/40';
  if (impact === 'medium') return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40';
  return 'bg-zinc-800 text-zinc-400 border border-zinc-700';
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
          target="_blank"
          rel="noopener noreferrer"
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
        <p className="text-gray-400 dark:text-zinc-500 text-sm">No setups available yet.</p>
        <p className="text-gray-400 dark:text-zinc-500 text-xs mt-1">
          The AI scanner runs every 15 minutes during market hours. Check back shortly — or the first scan may still be in progress.
        </p>
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

      </table>
    </div>
  );
}

/* ── Signal pill (pre-breakout) ─────────────────────────────────── */
const SIGNAL_STYLES: Record<string, string> = {
  'NR7':             'bg-violet-500/20 text-violet-300 border border-violet-500/30',
  'NR5':             'bg-violet-500/15 text-violet-400 border border-violet-500/25',
  'ATR Squeeze':     'bg-sky-500/20 text-sky-300 border border-sky-500/30',
  'Compressing':     'bg-sky-500/15 text-sky-400 border border-sky-500/25',
  'Vol Accumulation':'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  'Elevated Vol':    'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  'Near 20d High':   'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  'Approaching High':'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  'Gap & Hold':      'bg-rose-500/20 text-rose-300 border border-rose-500/30',
};

function SignalPills({ signals }: { signals: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {signals.map(s => (
        <span key={s} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${SIGNAL_STYLES[s] ?? 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
          {s}
        </span>
      ))}
    </div>
  );
}

/* ── Pre-breakout expanded detail ───────────────────────────────── */
function PreBreakoutDetail({ setup }: { setup: PreBreakoutRow }) {
  const fmt = (n: number, d = 2) => n.toFixed(d);
  return (
    <div className="px-4 py-3 bg-zinc-800/60 border-t border-zinc-700 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Why it&apos;s coiling</p>
          <p className="text-zinc-200 leading-snug">{setup.reason}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Trade levels</p>
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-zinc-300">Entry: <strong className="text-white">${fmt(setup.entry)}</strong></span>
            <span className="text-red-400">Stop: <strong>${fmt(setup.stop)}</strong></span>
            <span className="text-emerald-400">Target: <strong>${fmt(setup.target)}</strong> <span className="text-zinc-500">(3:1 R)</span></span>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Compression metrics</p>
          <div className="flex flex-col gap-0.5 text-xs text-zinc-300">
            <span>ATR ratio: <strong className={setup.atrRatio < 0.65 ? 'text-violet-300' : 'text-zinc-200'}>{setup.atrRatio.toFixed(2)}</strong> {setup.atrRatio < 0.65 ? '🔥 squeezed' : ''}</span>
            <span>Dist from 20d high: <strong className={setup.distFromHigh <= 1.5 ? 'text-emerald-300' : 'text-zinc-200'}>{setup.distFromHigh.toFixed(1)}%</strong></span>
            <span>RSI-14: <strong>{setup.rsi}</strong></span>
            <span>Vol: <strong>{(setup.volume / Math.max(setup.avgVolume20d, 1)).toFixed(1)}x avg</strong></span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/trades/new?symbol=${setup.symbol}&entry=${setup.entry}&stop=${setup.stop}&target=${setup.target}`}
          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
        >
          → Plan This Trade
        </Link>
        <Link
          href={`/stocks?symbol=${setup.symbol}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-1.5 rounded-lg border border-zinc-600 text-zinc-300 hover:border-indigo-500 text-xs font-medium transition-colors"
        >
          View Chart
        </Link>
      </div>
    </div>
  );
}

/* ── Pre-breakout scanner table ─────────────────────────────────── */
function PreBreakoutTable({ setups, loading }: { setups: PreBreakoutRow[]; loading: boolean }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const toggle = (rank: number) => setExpanded(prev => prev === rank ? null : rank);
  const fmt = (n: number, d = 2) => n.toFixed(d);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        {[1,2,3,4].map(i => (
          <div key={i} className="p-4 border-b border-zinc-800 animate-pulse">
            <div className="flex gap-4">
              <div className="h-5 w-12 bg-zinc-700 rounded" />
              <div className="h-5 w-32 bg-zinc-800 rounded" />
              <div className="h-5 w-48 bg-zinc-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (setups.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="text-zinc-500 text-sm">No pre-breakout setups found yet.</p>
        <p className="text-zinc-600 text-xs mt-1">The scanner runs every 15 minutes during market hours.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-zinc-800/60 border-b border-zinc-700">
            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-8">#</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Symbol</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Signals</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Pattern</th>
            <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">RSI</th>
            <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">ATR Ratio</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-zinc-500">Entry</th>
            <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-zinc-500">Target</th>
            <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-32">Score</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {setups.map((s) => (
            <React.Fragment key={s.symbol}>
              <tr
                className="border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors cursor-pointer"
                onClick={() => toggle(s.rank)}
              >
                <td className="px-4 py-3.5 text-xs font-bold text-zinc-500">{s.rank}</td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{s.symbol}</span>
                    <span className={`text-xs font-semibold tabular-nums ${s.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {s.changePct >= 0 ? '+' : ''}{fmt(s.changePct)}%
                    </span>
                  </div>
                  <span className="text-xs text-zinc-400">{s.company}</span>
                </td>
                <td className="px-4 py-3.5"><SignalPills signals={s.signals} /></td>
                <td className="px-4 py-3.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-700 text-zinc-200 border border-zinc-600">{s.setupType}</span>
                </td>
                <td className="px-4 py-3.5 text-center text-xs font-mono text-zinc-200">{s.rsi}</td>
                <td className="px-4 py-3.5 text-center text-xs font-mono">
                  <span className={s.atrRatio < 0.65 ? 'text-violet-300 font-bold' : s.atrRatio < 0.75 ? 'text-sky-300' : 'text-zinc-400'}>
                    {s.atrRatio.toFixed(2)}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right text-xs font-mono text-zinc-200">${fmt(s.entry)}</td>
                <td className="px-4 py-3.5 text-right text-xs font-mono text-emerald-400">${fmt(s.target)}</td>
                <td className="px-4 py-3.5"><ScoreBar score={s.score} /></td>
                <td className="px-3 py-3.5 text-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggle(s.rank); }}
                    className="p-1.5 rounded-md hover:bg-zinc-700 text-zinc-400 transition-colors"
                  >
                    <svg className={`w-4 h-4 transition-transform duration-200 ${expanded === s.rank ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </td>
              </tr>
              {expanded === s.rank && (
                <tr className="bg-zinc-800/60">
                  <td colSpan={10} className="p-0 border-b border-zinc-700">
                    <PreBreakoutDetail setup={s} />
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
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
        <span>✅</span>
        <span>Risk-On — {count} high-confidence setup{count !== 1 ? 's' : ''} found across S&P 500</span>
      </div>
    );
  }
  if (regime === 'risk-off') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
        <span>⚠️</span>
        <span>Risk-Off — Only {count} high-confidence setup{count !== 1 ? 's' : ''} passed the filter today. Market conditions are defensive.</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-medium">
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

/* ── Static economic events (replace with /api/market/events when ready) ── */
const MACRO_EVENTS: MacroEvent[] = [];

/* ── Main Page ─────────────────────────────────────────────────── */
export default function MorningBriefPage() {
  const [macro, setMacro] = useState<MacroData | null>(null);
  const [macroLoading, setMacroLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [nextScan, setNextScan] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('moving');

  // Moving Now (momentum scanner)
  const [setups, setSetups] = useState<Setup[]>([]);
  const [scannerLoading, setScannerLoading] = useState(true);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [staleData, setStaleData] = useState(false);

  // Setting Up (pre-breakout scanner)
  const [preSetups, setPreSetups] = useState<PreBreakoutRow[]>([]);
  const [preLoading, setPreLoading] = useState(true);
  const [preScannedAt, setPreScannedAt] = useState<string | null>(null);

  const countdown = useMarketCountdown();

  const fetchMacro = useCallback(async () => {
    try {
      const res = await fetch('/api/market/macro');
      if (res.ok) {
        setMacro(await res.json());
        setLastUpdated(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      }
    } finally {
      setMacroLoading(false);
    }
  }, []);

  const fetchSetups = useCallback(async () => {
    setScannerLoading(true);
    try {
      const res = await fetch('/api/market/setups');
      if (res.ok) {
        const data = await res.json() as { setups: Setup[]; scannedAt: string | null; stale: boolean };
        setSetups(data.setups);
        setScannedAt(data.scannedAt);
        setStaleData(data.stale);
      }
    } finally {
      setScannerLoading(false);
    }
  }, []);

  const fetchPreSetups = useCallback(async () => {
    setPreLoading(true);
    try {
      const res = await fetch('/api/market/prebreakout');
      if (res.ok) {
        const data = await res.json() as { setups: PreBreakoutRow[]; scannedAt: string | null; stale: boolean };
        setPreSetups(data.setups);
        setPreScannedAt(data.scannedAt);
      }
    } finally {
      setPreLoading(false);
    }
  }, []);

  // Returns ms until the next :00/:15/:30/:45 ET boundary (scanner cron schedule)
  function msUntilNextScanBoundary(): number {
    const etOffset = -4 * 60; // EDT (UTC-4); adjust to -5 in winter if needed
    const now = new Date();
    const etMin = (now.getUTCHours() * 60 + now.getUTCMinutes() + etOffset + 1440) % 1440;
    const nextBoundary = Math.ceil((etMin + 1) / 15) * 15; // next multiple of 15
    const minsLeft = (nextBoundary - etMin + 1440) % 1440 || 15;
    return minsLeft * 60 * 1000 - (now.getUTCSeconds() * 1000 + now.getUTCMilliseconds());
  }

  function nextScanLabel(): string {
    const ms = msUntilNextScanBoundary();
    const next = new Date(Date.now() + ms);
    return next.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  useEffect(() => {
    fetchMacro();
    fetchSetups();
    fetchPreSetups();
    setNextScan(nextScanLabel());

    const macroTimer = setInterval(fetchMacro, 10 * 60 * 1000);

    let repeatTimer: ReturnType<typeof setInterval> | null = null;
    const msToNext = msUntilNextScanBoundary();
    const boundaryTimer = setTimeout(() => {
      fetchSetups();
      fetchPreSetups();
      setNextScan(nextScanLabel());
      repeatTimer = setInterval(() => {
        fetchSetups();
        fetchPreSetups();
        setNextScan(nextScanLabel());
      }, 15 * 60 * 1000);
    }, msToNext + 30_000);

    const labelTimer = setInterval(() => setNextScan(nextScanLabel()), 60_000);

    return () => {
      clearInterval(macroTimer);
      clearTimeout(boundaryTimer);
      if (repeatTimer) clearInterval(repeatTimer);
      clearInterval(labelTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const regime: Regime = (macro?.riskRegime as Regime) ?? 'neutral';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const scanTimeLabel = scannedAt
    ? new Date(scannedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : null;
  const preTimeLabel = preScannedAt
    ? new Date(preScannedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : null;

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
                {activeTab === 'moving' && scanTimeLabel && ` · Last AI scan ${scanTimeLabel}`}
                {activeTab === 'coiling' && preTimeLabel && ` · Last AI scan ${preTimeLabel}`}
                {activeTab === 'moving' && staleData && <span className="text-amber-500 dark:text-amber-400"> · Stale</span>}
              </span>
            )}
            <button
              onClick={() => { fetchMacro(); fetchSetups(); fetchPreSetups(); setNextScan(nextScanLabel()); }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-xs font-medium text-gray-600 dark:text-zinc-300 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Market Pulse */}
        {macroLoading ? <MacroPulse macro={null} /> : <MacroPulse macro={macro} />}

        {/* Macro Events */}
        <MacroEvents events={MACRO_EVENTS} />

        {/* Tab bar + regime banner */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-zinc-800/60 rounded-xl p-1 border border-zinc-700">
            <button
              onClick={() => setActiveTab('moving')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'moving'
                  ? 'bg-zinc-900 text-white shadow border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              🚀 Moving Now
              {setups.length > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'moving' ? 'bg-indigo-500/30 text-indigo-300' : 'bg-zinc-700 text-zinc-400'}`}>
                  {setups.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('coiling')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'coiling'
                  ? 'bg-zinc-900 text-white shadow border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              🎯 Setting Up
              {preSetups.length > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'coiling' ? 'bg-violet-500/30 text-violet-300' : 'bg-zinc-700 text-zinc-400'}`}>
                  {preSetups.length}
                </span>
              )}
            </button>
          </div>

          {/* Context badge */}
          {activeTab === 'moving'
            ? <RegimeBanner regime={regime} count={setups.length} />
            : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/30 text-violet-300 text-xs font-medium">
                <span>🎯</span>
                <span>Anticipation scanner — {preSetups.length} stock{preSetups.length !== 1 ? 's' : ''} coiling before a potential move</span>
              </div>
            )
          }
        </div>

        {/* Sub-header description */}
        {activeTab === 'moving' ? (
          <p className="text-xs text-zinc-500 -mt-2">
            AI scanned S&P 500 · ranked by momentum + volume confluence · already in motion
          </p>
        ) : (
          <p className="text-xs text-zinc-500 -mt-2">
            NR7 · ATR squeeze · volume accumulation · near 20d high — stocks coiling <strong className="text-zinc-300">before</strong> the move happens
          </p>
        )}

        {/* Scanner tables */}
        {activeTab === 'moving'
          ? <ScannerTable setups={setups} loading={scannerLoading} />
          : <PreBreakoutTable setups={preSetups} loading={preLoading} />
        }

        {/* Footer note */}
        <p className="text-[11px] text-gray-400 dark:text-zinc-600 text-center pb-4">
          Setups are AI-generated suggestions based on technical analysis and catalyst data. They are not financial advice.
          Always define your entry, stop, and risk before trading.
        </p>

      </div>
    </Layout>
  );
}
