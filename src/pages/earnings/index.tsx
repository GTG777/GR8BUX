import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Layout } from '@/components/Layout';
import type { EarningsEvent } from '../api/market/earnings';
import type { AllEarningsRow } from '../api/market/earnings-all';

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
    return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-500/40 animate-pulse">TODAY</span>;
  }
  if (urgency === 'this-week') {
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-300 dark:border-orange-500/40">{daysLabel(daysOut)}</span>;
  }
  if (urgency === 'next-week') {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-500/40">{daysLabel(daysOut)}</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-xs text-gray-500 dark:text-zinc-500 border border-gray-300 dark:border-zinc-700">{daysLabel(daysOut)}</span>;
}

function StrategyBadge({ strategy, ivCrush }: { strategy: EarningsEvent['strategy']; ivCrush: boolean }) {
  if (strategy === 'avoid') {
    return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-500/30">Avoid</span>;
  }
  if (strategy === 'sell-premium') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-500/30" title="High IVR — selling premium before earnings may benefit from IV crush">
        {ivCrush ? '⚡ IV Crush Play' : 'Sell Premium'}
      </span>
    );
  }
  if (strategy === 'leaps-opportunity') {
    return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">LEAPS Opp.</span>;
  }
  return <span className="px-2 py-0.5 rounded text-xs text-gray-500 dark:text-zinc-500 border border-gray-300 dark:border-zinc-700">Watch</span>;
}

function IVRBar({ ivr }: { ivr: number | null }) {
  if (ivr == null) return <span className="text-gray-400 dark:text-zinc-600 text-xs">—</span>;
  const color = ivr >= 65 ? 'bg-violet-500' : ivr >= 40 ? 'bg-yellow-500' : 'bg-emerald-500';
  const textColor = ivr >= 65 ? 'text-violet-600 dark:text-violet-400' : ivr >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-emerald-600 dark:text-emerald-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 rounded-full bg-gray-200 dark:bg-zinc-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(ivr, 100)}%` }} />
      </div>
      <span className={`text-xs font-mono ${textColor}`}>{ivr.toFixed(0)}</span>
    </div>
  );
}

const CONSENSUS_COLOR: Record<string, string> = {
  STRONG_BUY: 'text-emerald-600 dark:text-emerald-400',
  BUY: 'text-green-600 dark:text-green-400',
  NEUTRAL: 'text-gray-500 dark:text-zinc-400',
  WAIT: 'text-yellow-600 dark:text-yellow-400',
  AVOID: 'text-red-600 dark:text-red-400',
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

// ── Sorting ───────────────────────────────────────────────────────────────
type SortCol = 'date' | 'symbol' | 'company' | 'sector' | 'price' | 'eps' | 'fiscalEnd' | 'ivr' | 'rsi' | 'verdict' | 'strategy';
type SortDir = 'asc' | 'desc';
interface SortState { col: SortCol; dir: SortDir; }

function SortTh({ col, sort, onSort, children, className = '' }: {
  col: SortCol; sort: SortState | null; onSort: (c: SortCol) => void;
  children: React.ReactNode; className?: string;
}) {
  const active = sort?.col === col;
  const icon = active ? (sort?.dir === 'asc' ? '↑' : '↓') : '↕';
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-4 py-2 cursor-pointer select-none group transition-colors ${
        active ? 'text-indigo-500 dark:text-indigo-400' : 'text-gray-500 dark:text-zinc-500 hover:text-indigo-400 dark:hover:text-indigo-400'
      } ${className}`}
    >
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {children}
        <span className={`text-[10px] ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>{icon}</span>
      </span>
    </th>
  );
}

function EarningsTableHead({ sort, onSort, showDate = false }: {
  sort: SortState | null; onSort: (c: SortCol) => void; showDate?: boolean;
}) {
  return (
    <thead>
      <tr className="border-b border-gray-200 dark:border-zinc-700/40">
        {showDate && <SortTh col="date" sort={sort} onSort={onSort} className="text-left">Date</SortTh>}
        <SortTh col="symbol" sort={sort} onSort={onSort} className="text-left">Symbol</SortTh>
        <SortTh col="company" sort={sort} onSort={onSort} className="text-left">Company</SortTh>
        <SortTh col="sector" sort={sort} onSort={onSort} className="text-left">Sector</SortTh>
        <SortTh col="price" sort={sort} onSort={onSort} className="text-right">Price</SortTh>
        <SortTh col="eps" sort={sort} onSort={onSort} className="text-right">Est. EPS</SortTh>
        <SortTh col="fiscalEnd" sort={sort} onSort={onSort} className="text-right">Fiscal End</SortTh>
        <SortTh col="ivr" sort={sort} onSort={onSort} className="text-center">IVR</SortTh>
        <SortTh col="rsi" sort={sort} onSort={onSort} className="text-right">RSI</SortTh>
        <SortTh col="verdict" sort={sort} onSort={onSort} className="text-center">AI Verdict</SortTh>
        <SortTh col="strategy" sort={sort} onSort={onSort} className="text-center">Strategy</SortTh>
        <th className="px-4 py-2 text-center text-gray-500 dark:text-zinc-500">Trade</th>
      </tr>
    </thead>
  );
}

function EarningsTableRow({ e, i, showDate = false }: { e: EarningsEvent; i: number; showDate?: boolean }) {
  return (
    <tr className={`border-t border-gray-100 dark:border-zinc-700/20 hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors ${i % 2 === 0 ? 'bg-gray-50/50 dark:bg-zinc-900/20' : ''}`}>
      {showDate && (
        <td className="px-4 py-2.5 text-gray-500 dark:text-zinc-500 whitespace-nowrap">{fmtDate(e.reportDate)}</td>
      )}
      <td className="px-4 py-2.5">
        <span className="font-bold text-gray-900 dark:text-white text-sm">{e.symbol}</span>
        {e.urgency === 'today' && <span className="ml-2 text-red-400 text-xs font-semibold animate-pulse">TODAY</span>}
      </td>
      <td className="px-4 py-2.5 text-gray-700 dark:text-zinc-300 max-w-[160px] truncate">{e.name}</td>
      <td className="px-4 py-2.5 text-gray-500 dark:text-zinc-500">{e.sector}</td>
      <td className="px-4 py-2.5 text-right text-gray-800 dark:text-zinc-200 font-mono">
        {e.price != null ? `$${e.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
      </td>
      <td className="px-4 py-2.5 text-right font-mono">
        {e.estimatedEPS != null ? (
          <span className={e.estimatedEPS >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
            {e.estimatedEPS >= 0 ? '+' : ''}{e.estimatedEPS.toFixed(2)}
          </span>
        ) : <span className="text-gray-400 dark:text-zinc-600">—</span>}
      </td>
      <td className="px-4 py-2.5 text-right text-gray-500 dark:text-zinc-500">{e.fiscalDateEnding || '—'}</td>
      <td className="px-4 py-2.5"><IVRBar ivr={e.ivRank} /></td>
      <td className="px-4 py-2.5 text-right">
        {e.rsi != null ? (
          <span className={e.rsi > 70 ? 'text-red-500 dark:text-red-400' : e.rsi < 35 ? 'text-blue-500 dark:text-blue-400' : 'text-gray-600 dark:text-zinc-400'}>
            {e.rsi.toFixed(0)}
          </span>
        ) : <span className="text-gray-400 dark:text-zinc-600">—</span>}
      </td>
      <td className="px-4 py-2.5 text-center">
        {e.aiConsensus ? (
          <span className={`font-semibold ${CONSENSUS_COLOR[e.aiConsensus] ?? 'text-zinc-400'}`}>{e.aiConsensus.replace('_', ' ')}</span>
        ) : <span className="text-gray-400 dark:text-zinc-600">—</span>}
      </td>
      <td className="px-4 py-2.5 text-center">
        <StrategyBadge strategy={e.strategy} ivCrush={e.ivCrush} />
      </td>
      <td className="px-4 py-2.5 text-center">
        <div className="flex gap-1.5 justify-center">
          <Link href={`/options?symbol=${e.symbol}`} className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 rounded border border-gray-300 dark:border-zinc-700 transition-colors">Chain</Link>
          <Link href={`/leaps?symbol=${e.symbol}`} className="px-2 py-0.5 text-xs bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/50 dark:hover:bg-indigo-800/60 text-indigo-600 dark:text-indigo-300 rounded border border-indigo-200 dark:border-indigo-700/50 transition-colors">LEAPS</Link>
        </div>
      </td>
    </tr>
  );
}

// ── All Earnings Tab ──────────────────────────────────────────────────────
const DAYS_OPTIONS = [7, 14, 30, 45, 90];
const PAGE_SIZE = 50;

function AllEarningsTab() {
  const [rows, setRows]           = useState<AllEarningsRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage]           = useState(1);
  const [days, setDays]           = useState(45);
  const [q, setQ]                 = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [cachedAt, setCachedAt]   = useState('');
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetch_ = useCallback(async (pg: number, d: number, query: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ days: String(d), page: String(pg), limit: String(PAGE_SIZE), q: query });
      const res  = await fetch(`/api/market/earnings-all?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
      setRows(json.rows ?? []);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 1);
      if (json.cachedAt) setCachedAt(json.cachedAt);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetch_(1, days, q); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDays = (d: number) => { setDays(d); setPage(1); fetch_(1, d, q); };
  const handlePage = (p: number) => { setPage(p); fetch_(p, days, q); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const handleQ    = (v: string) => {
    setQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); fetch_(1, days, v); }, 300);
  };

  // Group by date
  const grouped = new Map<string, AllEarningsRow[]>();
  for (const r of rows) {
    if (!grouped.has(r.reportDate)) grouped.set(r.reportDate, []);
    grouped.get(r.reportDate)!.push(r);
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex-1 max-w-xs">
          <input
            type="text"
            value={q}
            onChange={(e) => handleQ(e.target.value)}
            placeholder="Search symbol or company…"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-zinc-500">Horizon:</span>
          {DAYS_OPTIONS.map((d) => (
            <button key={d} onClick={() => handleDays(d)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                days === d
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-700'
              }`}
            >{d}d</button>
          ))}
          {cachedAt && (
            <span className="text-xs text-gray-400 dark:text-zinc-600">
              Updated {new Date(cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Summary */}
      {!loading && !error && (
        <p className="text-sm text-gray-500 dark:text-zinc-500">
          <span className="font-semibold text-gray-900 dark:text-white">{total.toLocaleString()}</span> upcoming earnings in the next {days} days
          {q && <> matching <span className="font-semibold text-indigo-500">&ldquo;{q}&rdquo;</span></>}
          {' · '}Page {page} of {totalPages}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded-xl px-4 py-3 text-red-600 dark:text-red-400 text-sm">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <span className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && rows.length === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-zinc-600">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-lg font-medium text-gray-500 dark:text-zinc-500">No earnings found</p>
          <p className="text-sm mt-1">Try a wider horizon or clear the search</p>
        </div>
      )}

      {/* Table — grouped by date */}
      {!loading && !error && rows.length > 0 && Array.from(grouped.entries()).map(([date, dateRows]) => {
        const d = dateRows[0].daysOut;
        const isToday = d === 0;
        const label = isToday ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`;
        return (
          <div key={date} className="bg-white dark:bg-zinc-900/60 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700/50">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900 dark:text-white">{fmtDate(date)}</span>
                {isToday
                  ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-500/40 animate-pulse">TODAY</span>
                  : <span className="px-2 py-0.5 rounded-full text-xs text-gray-500 dark:text-zinc-500 border border-gray-300 dark:border-zinc-700">{label}</span>
                }
              </div>
              <span className="text-xs text-gray-500 dark:text-zinc-500">{dateRows.length} reporting</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-zinc-700/40 text-left text-gray-500 dark:text-zinc-500 uppercase tracking-wide">
                    <th className="px-4 py-2">Symbol</th>
                    <th className="px-4 py-2">Company</th>
                    <th className="px-4 py-2 text-right">Est. EPS</th>
                    <th className="px-4 py-2 text-right">Fiscal End</th>
                    <th className="px-4 py-2 text-center">Trade</th>
                  </tr>
                </thead>
                <tbody>
                  {dateRows.map((r, i) => (
                    <tr key={r.symbol} className={`border-t border-gray-100 dark:border-zinc-700/20 hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors ${i % 2 === 0 ? 'bg-gray-50/50 dark:bg-zinc-900/20' : ''}`}>
                      <td className="px-4 py-2.5">
                        <span className="font-bold text-gray-900 dark:text-white">{r.symbol}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-zinc-300 max-w-[220px] truncate">{r.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {r.estimatedEPS != null
                          ? <span className={r.estimatedEPS >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{r.estimatedEPS >= 0 ? '+' : ''}{r.estimatedEPS.toFixed(2)}</span>
                          : <span className="text-gray-400 dark:text-zinc-600">—</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 dark:text-zinc-500">{r.fiscalDateEnding || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex gap-1.5 justify-center">
                          <Link href={`/chart?symbol=${r.symbol}`} className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 rounded border border-gray-300 dark:border-zinc-700 transition-colors">Chart</Link>
                          <Link href={`/stocks?symbol=${r.symbol}`} className="px-2 py-0.5 text-xs bg-indigo-50 hover:bg-indigo-100 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-indigo-600 dark:text-indigo-300 rounded border border-indigo-200 dark:border-zinc-600 transition-colors">Analysis</Link>
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

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button onClick={() => handlePage(page - 1)} disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors">
            ← Prev
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page + i - 3;
            if (p < 1 || p > totalPages) return null;
            return (
              <button key={p} onClick={() => handlePage(p)}
                className={`w-8 h-8 rounded-lg text-sm transition-colors ${p === page ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-700'}`}>
                {p}
              </button>
            );
          })}
          <button onClick={() => handlePage(page + 1)} disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function EarningsCalendarPage() {
  const [pageTab, setPageTab]     = useState<'leaps' | 'all'>('leaps');
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

  // ── Sorting ───────────────────────────────────────────────────────────────
  const [sort, setSort] = useState<SortState | null>(null);
  function toggleSort(col: SortCol) {
    setSort(prev => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return null;
    });
  }
  const sortedFlat = sort ? [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sort.col) {
      case 'date':      cmp = a.reportDate.localeCompare(b.reportDate); break;
      case 'symbol':    cmp = a.symbol.localeCompare(b.symbol); break;
      case 'company':   cmp = a.name.localeCompare(b.name); break;
      case 'sector':    cmp = (a.sector ?? '').localeCompare(b.sector ?? ''); break;
      case 'price':     cmp = (a.price ?? 0) - (b.price ?? 0); break;
      case 'eps':       cmp = (a.estimatedEPS ?? -Infinity) - (b.estimatedEPS ?? -Infinity); break;
      case 'fiscalEnd': cmp = (a.fiscalDateEnding ?? '').localeCompare(b.fiscalDateEnding ?? ''); break;
      case 'ivr':       cmp = (a.ivRank ?? -1) - (b.ivRank ?? -1); break;
      case 'rsi':       cmp = (a.rsi ?? -1) - (b.rsi ?? -1); break;
      case 'verdict':   cmp = (a.aiConsensus ?? '').localeCompare(b.aiConsensus ?? ''); break;
      case 'strategy':  cmp = (a.strategy ?? '').localeCompare(b.strategy ?? ''); break;
    }
    return sort.dir === 'asc' ? cmp : -cmp;
  }) : null;

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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Earnings Calendar</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
              {pageTab === 'leaps'
                ? `${events.length} upcoming earnings across tracked LEAPS universe · 45-day lookahead`
                : 'All upcoming earnings from Alpha Vantage — search, filter, paginated'}
            </p>
          </div>
          {pageTab === 'leaps' && (
            <div className="flex items-center gap-3">
              {cachedAt && (
                <span className={`text-xs ${isStale ? 'text-yellow-500' : 'text-zinc-600'}`}>
                  {isStale ? '⚠ Stale · ' : ''}Updated {new Date(cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button
                onClick={load}
                disabled={loading}
                className="text-xs bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300 border border-gray-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading…' : '↻ Refresh'}
              </button>
            </div>
          )}
        </div>

        {/* ── Top-level page tabs ─────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-zinc-800">
          {([['leaps', '📅 LEAPS Calendar'], ['all', '🌐 All Earnings']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setPageTab(id)}
              className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
                pageTab === id
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-zinc-900'
                  : 'border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
              }`}
            >{label}</button>
          ))}
        </div>

        {/* ── All Earnings tab ────────────────────────────────────────────── */}
        {pageTab === 'all' && <AllEarningsTab />}

        {/* ── LEAPS Calendar tab ──────────────────────────────────────────── */}
        {pageTab === 'leaps' && (<>

        {/* ── Summary cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'This Week',       value: thisWeekCount,   color: 'text-orange-400' },
            { label: 'IV Crush Plays',  value: ivCrushCount,    color: 'text-violet-400' },
            { label: 'LEAPS Opps',      value: leapsOppCount,   color: 'text-emerald-400' },
            { label: 'Total (45d)',     value: events.length,   color: 'text-zinc-300' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
              <div className={`text-3xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500 dark:text-zinc-500 mt-1">{label}</div>
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
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-800 dark:hover:text-zinc-200 border border-gray-300 dark:border-zinc-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded-xl px-4 py-3 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* ── Loading skeleton ───────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 animate-pulse">
                <div className="h-4 w-32 bg-gray-200 dark:bg-zinc-800 rounded mb-3" />
                <div className="space-y-2">
                  {[1, 2].map((j) => (
                    <div key={j} className="h-10 bg-gray-200 dark:bg-zinc-800 rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── No results ─────────────────────────────────────────────────── */}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 dark:text-zinc-600">
            <div className="text-4xl mb-3">📅</div>
            <p className="text-lg font-medium text-gray-500 dark:text-zinc-500">No earnings in this window</p>
            <p className="text-sm mt-1">Try switching to &ldquo;All Upcoming&rdquo;</p>
          </div>
        )}

        {/* ── Flat sorted view ───────────────────────────────────────────── */}
        {!loading && !error && sortedFlat && (
          <div className="bg-white dark:bg-zinc-900/60 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700/50">
              <span className="text-xs text-gray-500 dark:text-zinc-500">
                {sortedFlat.length} results · sorted by{' '}
                <span className="text-indigo-500 dark:text-indigo-400 font-medium">{sort?.col}</span>{' '}
                {sort?.dir === 'asc' ? '↑' : '↓'} · click header again to reverse, third click to group
              </span>
              <button
                onClick={() => setSort(null)}
                className="text-xs text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 border border-gray-300 dark:border-zinc-700 rounded px-2 py-0.5 transition-colors"
              >
                ← Group by Date
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <EarningsTableHead sort={sort} onSort={toggleSort} showDate />
                <tbody>
                  {sortedFlat.map((e, i) => (
                    <EarningsTableRow key={`${e.symbol}-${e.reportDate}`} e={e} i={i} showDate />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Calendar groups ────────────────────────────────────────────── */}
        {!loading && !error && !sort && Array.from(grouped.entries()).map(([date, dateEvents]) => {
          const daysOut = dateEvents[0].daysOut;
          return (
            <div key={date} className="bg-white dark:bg-zinc-900/60 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              {/* Date header */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-zinc-800/60 border-b border-gray-200 dark:border-zinc-700/50">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900 dark:text-white">{fmtDate(date)}</span>
                  <UrgencyBadge urgency={dateEvents[0].urgency} daysOut={daysOut} />
                </div>
                <span className="text-xs text-gray-500 dark:text-zinc-500">{dateEvents.length} reporting</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <EarningsTableHead sort={sort} onSort={toggleSort} />
                  <tbody>
                    {dateEvents.map((e, i) => (
                      <EarningsTableRow key={e.symbol} e={e} i={i} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {/* ── Legend ─────────────────────────────────────────────────────── */}
        {!loading && filtered.length > 0 && (
          <div className="bg-gray-50 dark:bg-zinc-900/40 border border-gray-200 dark:border-zinc-800 rounded-xl px-5 py-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-zinc-500 mb-3 uppercase tracking-wide">Strategy Guide</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LEGEND.map(({ color, label }) => (
                <div key={label} className="flex items-start gap-2 text-xs text-gray-600 dark:text-zinc-500">
                  <div className={`w-2.5 h-2.5 rounded-full ${color} mt-0.5 flex-shrink-0`} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 dark:text-zinc-700 mt-3">
              IVR = Implied Volatility Rank (0–100). IV Crush: IV peaks before earnings, collapses after. Data: Alpha Vantage + Massive.com. Not financial advice.
            </p>
          </div>
        )}

        </>)}  {/* end LEAPS tab */}

      </div>
    </Layout>
  );
}
