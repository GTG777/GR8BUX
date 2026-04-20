import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { MoversData, MoverRow } from '@/pages/api/market/movers';

const REFRESH_MS = 5 * 60 * 1000;  // 5 min
const STALE_MS   = 10 * 60 * 1000; // stale badge after 10 min

type Tab = 'active' | 'gainers' | 'losers';

const TAB_META: Record<Tab, { label: string; emoji: string; tip: string }> = {
  active:  { label: 'Most Active',  emoji: '⚡', tip: 'Ranked by dollar volume (price × shares traded). Highest liquidity names of the session.' },
  gainers: { label: 'Top Gainers',  emoji: '🚀', tip: 'Stocks with the largest % gain today. During market hours sourced live; outside hours shows last session sorted by prev-day change.' },
  losers:  { label: 'Top Losers',   emoji: '🔻', tip: 'Stocks with the largest % decline today. During market hours sourced live; outside hours shows last session sorted by prev-day change.' },
};

/* ── Tooltip ──────────────────────────────────────────────────── */
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
      className="cursor-help"
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
          {text}
        </span>
      )}
    </span>
  );
}

/* ── Format helpers ───────────────────────────────────────────── */
function fmtVol(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

/* ── Single row ───────────────────────────────────────────────── */
function MoverRowItem({ row, tab }: { row: MoverRow; tab: Tab }) {
  const up   = row.changePct >= 0;
  const pctColor  = up ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
  const rankColor =
    row.rank === 1 ? 'text-yellow-500 font-bold' :
    row.rank === 2 ? 'text-gray-400 dark:text-zinc-400 font-semibold' :
    row.rank === 3 ? 'text-amber-600 dark:text-amber-500 font-semibold' :
    'text-gray-400 dark:text-zinc-600';

  const volLabel = tab === 'active'
    ? `$${fmtVol(row.dollarVolume)}`
    : fmtVol(row.volume);

  const volTip = tab === 'active'
    ? `Dollar volume: $${row.dollarVolume.toLocaleString()}\nShares: ${row.volume.toLocaleString()}`
    : `Volume: ${row.volume.toLocaleString()}\nDollar volume: $${row.dollarVolume.toLocaleString()}`;

  return (
    <div className="grid items-center gap-x-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors rounded-md"
      style={{ gridTemplateColumns: '1.5rem 2.5rem 1fr 4.5rem 4rem 4rem' }}>
      {/* Rank */}
      <span className={`text-xs text-center ${rankColor}`}>{row.rank}</span>

      {/* Symbol */}
      <span className="text-xs font-bold text-gray-800 dark:text-zinc-200 truncate">{row.symbol}</span>

      {/* Name */}
      <span className="text-xs text-gray-500 dark:text-zinc-400 truncate">{row.name}</span>

      {/* Price */}
      <span className="text-xs font-mono text-gray-700 dark:text-zinc-300 text-right">
        {row.price > 0 ? `$${row.price.toFixed(2)}` : '—'}
      </span>

      {/* Change % */}
      <span className={`text-xs font-semibold text-right ${pctColor}`}>
        {row.changePct >= 0 ? '+' : ''}{row.changePct.toFixed(2)}%
      </span>

      {/* Volume */}
      <Tooltip text={volTip}>
        <span className="text-xs text-gray-400 dark:text-zinc-500 text-right">{volLabel}</span>
      </Tooltip>
    </div>
  );
}

/* ── Info icon ────────────────────────────────────────────────── */
function InfoIcon() {
  return (
    <svg className="inline w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 ml-1 -mt-0.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 01-1-1v-4a1 1 0 112 0v4a1 1 0 01-1 1z" clipRule="evenodd" />
    </svg>
  );
}

/* ── Main component ───────────────────────────────────────────── */
export default function TopMovers() {
  const [data, setData]     = useState<MoversData | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [tab, setTab]       = useState<Tab>('active');
  const [isStale, setIsStale] = useState(false);
  const fetchedAt = useRef<number>(0);

  const load = useCallback(() => {
    fetch('/api/market/movers')
      .then((r) => r.json())
      .then((d: MoversData) => {
        setData(d);
        setError(null);
        fetchedAt.current = d.fetchedAt;
        setIsStale(Date.now() - d.fetchedAt > STALE_MS);
      })
      .catch((e: Error) => setError(e.message));
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
        Top movers unavailable: {error}
      </div>
    );
  }

  const rows: MoverRow[] = data ? data[tab] : [];
  const ts = data ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-4 py-4 space-y-3">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-gray-700 dark:text-zinc-300">🔥 Top Movers</h2>

        {/* Tabs */}
        <div className="flex gap-1">
          {(Object.keys(TAB_META) as Tab[]).map((t) => {
            const m = TAB_META[t];
            const active = t === tab;
            return (
              <Tooltip key={t} text={m.tip}>
                <button
                  onClick={() => setTab(t)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-transparent text-gray-600 dark:text-zinc-400 border-gray-300 dark:border-zinc-700 hover:border-blue-400 dark:hover:border-blue-600'
                  }`}
                >
                  {m.emoji} {m.label}
                </button>
              </Tooltip>
            );
          })}
        </div>

        {/* Right side badges */}
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-500">
          {isStale && (
            <span className="text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 rounded text-[10px]">
              Stale data
            </span>
          )}
          {data && !data.marketOpen && (
            <span className="text-blue-500 dark:text-blue-400 border border-blue-300 dark:border-blue-700 px-1.5 py-0.5 rounded text-[10px]">
              prev close
            </span>
          )}
          {ts && (
            <button onClick={load} className="hover:text-gray-700 dark:hover:text-zinc-200 transition-colors">
              Updated {ts} · refresh
            </button>
          )}
        </div>
      </div>

      {/* ── Column headers ── */}
      <div className="grid text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-600 px-3 gap-x-3"
        style={{ gridTemplateColumns: '1.5rem 2.5rem 1fr 4.5rem 4rem 4rem' }}>
        <span className="text-center">#</span>
        <span>Ticker</span>
        <span>Name</span>
        <span className="text-right">Price</span>
        <span className="text-right">Chg %</span>
        <Tooltip text={tab === 'active' ? 'Dollar volume = price × shares traded' : 'Share volume traded today'}>
          <span className="text-right cursor-help">
            {tab === 'active' ? '$Vol' : 'Vol'}
            <InfoIcon />
          </span>
        </Tooltip>
      </div>

      {/* ── Rows ── */}
      <div className="divide-y divide-gray-100 dark:divide-zinc-800/60">
        {!data ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-9 mx-3 my-1 bg-gray-100 dark:bg-zinc-800 rounded animate-pulse" />
          ))
        ) : rows.length === 0 ? (
          <div className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">
            Market closed — no live data for this session yet.
          </div>
        ) : (
          rows.map((row) => <MoverRowItem key={row.symbol} row={row} tab={tab} />)
        )}
      </div>
    </div>
  );
}
