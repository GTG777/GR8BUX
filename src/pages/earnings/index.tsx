import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Layout } from '@/components/Layout';
import type { EarningsEvent } from '../api/market/earnings';

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function daysLabel(n: number): string {
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `In ${n} days`;
}

function groupByDate(events: EarningsEvent[]): Map<string, EarningsEvent[]> {
  const map = new Map<string, EarningsEvent[]>();
  for (const e of events) {
    const key = e.reportDate;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}

// ── Badges ────────────────────────────────────────────────────────────────
function UrgencyBadge({ urgency, daysOut }: { urgency: EarningsEvent['urgency']; daysOut: number }) {
  if (urgency === 'today') {
    return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">TODAY</span>;
  }
  if (urgency === 'this-week') {
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/40">{daysLabel(daysOut)}</span>;
  }
  if (urgency === 'next-week') {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">{daysLabel(daysOut)}</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-xs text-zinc-500 border border-zinc-700">{daysLabel(daysOut)}</span>;
}

function StrategyBadge({ strategy, ivCrush }: { strategy: EarningsEvent['strategy']; ivCrush: boolean }) {
  if (strategy === 'avoid') {
    return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">Avoid</span>;
  }
  if (strategy === 'sell-premium') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30" title="High IVR — selling premium before earnings may benefit from IV crush">
        {ivCrush ? '⚡ IV Crush Play' : 'Sell Premium'}
      </span>
    );
  }
  if (strategy === 'leaps-opportunity') {
    return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">LEAPS Opp.</span>;
  }
  return <span className="px-2 py-0.5 rounded text-xs text-zinc-500 border border-zinc-700">Watch</span>;
}

function IVRBar({ ivr }: { ivr: number | null }) {
  if (ivr == null) return <span className="text-zinc-600 text-xs">—</span>;
  const color = ivr >= 65 ? 'bg-violet-500' : ivr >= 40 ? 'bg-yellow-500' : 'bg-emerald-500';
  const textColor = ivr >= 65 ? 'text-violet-400' : ivr >= 40 ? 'text-yellow-400' : 'text-emerald-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 rounded-full bg-zinc-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(ivr, 100)}%` }} />
      </div>
      <span className={`text-xs font-mono ${textColor}`}>{ivr.toFixed(0)}</span>
    </div>
  );
}

const CONSENSUS_COLOR: Record<string, string> = {
  STRONG_BUY: 'text-emerald-400',
  BUY: 'text-green-400',
  NEUTRAL: 'text-zinc-400',
  WAIT: 'text-yellow-400',
  AVOID: 'text-red-400',
};

// ── Filter tabs ───────────────────────────────────────────────────────────
type FilterTab = 'all' | 'this-week' | 'next-week' | 'iv-crush' | 'leaps-opp';

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',       label: 'All Upcoming' },
  { id: 'this-week', label: '⚡ This Week' },
  { id: 'next-week', label: '📅 Next 2 Weeks' },
  { id: 'iv-crush',  label: '🔥 IV Crush Plays' },
  { id: 'leaps-opp', label: '🚀 LEAPS Opportunities' },
];

// ── Strategy legend ───────────────────────────────────────────────────────
const LEGEND = [
  { color: 'bg-violet-500', label: 'IV Crush Play — IVR ≥ 65: sell straddle/strangle before earnings, IV collapses after' },
  { color: 'bg-emerald-500', label: 'LEAPS Opp — IVR < 35: cheap IV, buy calls after earnings if bullish' },
  { color: 'bg-yellow-500', label: 'Watch — moderate IV, no clear edge yet' },
  { color: 'bg-red-500', label: 'Avoid — AI consensus is bearish or avoid' },
];

// ── Main page ─────────────────────────────────────────────────────────────
export default function EarningsCalendarPage() {
  const [events, setEvents]       = useState<EarningsEvent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [tab, setTab]             = useState<FilterTab>('all');
  const [cachedAt, setCachedAt]   = useState('');
  const [isStale, setIsStale]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/market/earnings?days=45');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setEvents(json.events ?? []);
      setCachedAt(json.cachedAt ?? '');
      setIsStale(!!json.stale);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load earnings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filter ───────────────────────────────────────────────────────────────
  const filtered = events.filter((e) => {
    if (tab === 'this-week')  return e.daysOut <= 7;
    if (tab === 'next-week')  return e.daysOut <= 14;
    if (tab === 'iv-crush')   return e.ivCrush;
    if (tab === 'leaps-opp')  return e.strategy === 'leaps-opportunity';
    return true;
  });

  const grouped = groupByDate(filtered);

  // ── Summary stats ────────────────────────────────────────────────────────
  const thisWeekCount  = events.filter((e) => e.daysOut <= 7).length;
  const ivCrushCount   = events.filter((e) => e.ivCrush).length;
  const leapsOppCount  = events.filter((e) => e.strategy === 'leaps-opportunity').length;

  return (
    <Layout>
      <Head><title>Earnings Calendar | GR8BUX</title></Head>

      <div className="space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Earnings Calendar</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {events.length} upcoming earnings across tracked LEAPS universe · 45-day lookahead
            </p>
          </div>
          <div className="flex items-center gap-3">
            {cachedAt && (
              <span className={`text-xs ${isStale ? 'text-yellow-500' : 'text-zinc-600'}`}>
                {isStale ? '⚠ Stale · ' : ''}Updated {new Date(cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* ── Summary cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'This Week',       value: thisWeekCount,   color: 'text-orange-400' },
            { label: 'IV Crush Plays',  value: ivCrushCount,    color: 'text-violet-400' },
            { label: 'LEAPS Opps',      value: leapsOppCount,   color: 'text-emerald-400' },
            { label: 'Total (45d)',     value: events.length,   color: 'text-zinc-300' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className={`text-3xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-zinc-500 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Filter tabs ────────────────────────────────────────────────── */}
        <div className="flex gap-1.5 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                tab === t.id
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-zinc-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ── Loading skeleton ───────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse">
                <div className="h-4 w-32 bg-zinc-800 rounded mb-3" />
                <div className="space-y-2">
                  {[1, 2].map((j) => (
                    <div key={j} className="h-10 bg-zinc-800 rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── No results ─────────────────────────────────────────────────── */}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16 text-zinc-600">
            <div className="text-4xl mb-3">📅</div>
            <p className="text-lg font-medium text-zinc-500">No earnings in this window</p>
            <p className="text-sm mt-1">Try switching to "All Upcoming"</p>
          </div>
        )}

        {/* ── Calendar groups ────────────────────────────────────────────── */}
        {!loading && !error && Array.from(grouped.entries()).map(([date, dateEvents]) => {
          const daysOut = dateEvents[0].daysOut;
          return (
            <div key={date} className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
              {/* Date header */}
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/60 border-b border-zinc-700/50">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-white">{fmtDate(date)}</span>
                  <UrgencyBadge urgency={dateEvents[0].urgency} daysOut={daysOut} />
                </div>
                <span className="text-xs text-zinc-500">{dateEvents.length} reporting</span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-700/40">
                      <th className="px-4 py-2 text-left">Symbol</th>
                      <th className="px-4 py-2 text-left">Company</th>
                      <th className="px-4 py-2 text-left">Sector</th>
                      <th className="px-4 py-2 text-right">Price</th>
                      <th className="px-4 py-2 text-right">Est. EPS</th>
                      <th className="px-4 py-2 text-right">Fiscal End</th>
                      <th className="px-4 py-2 text-center">IVR</th>
                      <th className="px-4 py-2 text-right">RSI</th>
                      <th className="px-4 py-2 text-center">AI Verdict</th>
                      <th className="px-4 py-2 text-center">Strategy</th>
                      <th className="px-4 py-2 text-center">Trade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dateEvents.map((e, i) => (
                      <tr
                        key={e.symbol}
                        className={`border-t border-zinc-700/20 hover:bg-zinc-800/40 transition-colors ${
                          i % 2 === 0 ? 'bg-zinc-900/20' : ''
                        }`}
                      >
                        {/* Symbol */}
                        <td className="px-4 py-2.5">
                          <span className="font-bold text-white text-sm">{e.symbol}</span>
                          {e.urgency === 'today' && (
                            <span className="ml-2 text-red-400 text-xs font-semibold animate-pulse">REPORTS TODAY</span>
                          )}
                        </td>

                        {/* Company */}
                        <td className="px-4 py-2.5 text-zinc-300 max-w-[160px] truncate">{e.name}</td>

                        {/* Sector */}
                        <td className="px-4 py-2.5 text-zinc-500">{e.sector}</td>

                        {/* Price */}
                        <td className="px-4 py-2.5 text-right text-zinc-200 font-mono">
                          {e.price != null ? `$${e.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                        </td>

                        {/* Est EPS */}
                        <td className="px-4 py-2.5 text-right font-mono">
                          {e.estimatedEPS != null ? (
                            <span className={e.estimatedEPS >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {e.estimatedEPS >= 0 ? '+' : ''}{e.estimatedEPS.toFixed(2)}
                            </span>
                          ) : <span className="text-zinc-600">—</span>}
                        </td>

                        {/* Fiscal end */}
                        <td className="px-4 py-2.5 text-right text-zinc-500">{e.fiscalDateEnding || '—'}</td>

                        {/* IVR */}
                        <td className="px-4 py-2.5">
                          <IVRBar ivr={e.ivRank} />
                        </td>

                        {/* RSI */}
                        <td className="px-4 py-2.5 text-right">
                          {e.rsi != null ? (
                            <span className={
                              e.rsi > 70 ? 'text-red-400' :
                              e.rsi < 35 ? 'text-blue-400' :
                              'text-zinc-400'
                            }>{e.rsi.toFixed(0)}</span>
                          ) : <span className="text-zinc-600">—</span>}
                        </td>

                        {/* AI Verdict */}
                        <td className="px-4 py-2.5 text-center">
                          {e.aiConsensus ? (
                            <span className={`font-semibold ${CONSENSUS_COLOR[e.aiConsensus] ?? 'text-zinc-400'}`}>
                              {e.aiConsensus.replace('_', ' ')}
                            </span>
                          ) : <span className="text-zinc-600">—</span>}
                        </td>

                        {/* Strategy */}
                        <td className="px-4 py-2.5 text-center">
                          <StrategyBadge strategy={e.strategy} ivCrush={e.ivCrush} />
                        </td>

                        {/* Trade links */}
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex gap-1.5 justify-center">
                            <Link
                              href={`/options?symbol=${e.symbol}`}
                              className="px-2 py-0.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
                            >
                              Chain
                            </Link>
                            <Link
                              href={`/leaps?symbol=${e.symbol}`}
                              className="px-2 py-0.5 text-xs bg-indigo-900/50 hover:bg-indigo-800/60 text-indigo-300 rounded border border-indigo-700/50 transition-colors"
                            >
                              LEAPS
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {/* ── Legend ─────────────────────────────────────────────────────── */}
        {!loading && filtered.length > 0 && (
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl px-5 py-4">
            <p className="text-xs font-semibold text-zinc-500 mb-3 uppercase tracking-wide">Strategy Guide</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LEGEND.map(({ color, label }) => (
                <div key={label} className="flex items-start gap-2 text-xs text-zinc-500">
                  <div className={`w-2.5 h-2.5 rounded-full ${color} mt-0.5 flex-shrink-0`} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-700 mt-3">
              IVR = Implied Volatility Rank (0–100). IV Crush: IV peaks before earnings, collapses after. Data: Alpha Vantage + Massive.com. Not financial advice.
            </p>
          </div>
        )}

      </div>
    </Layout>
  );
}
