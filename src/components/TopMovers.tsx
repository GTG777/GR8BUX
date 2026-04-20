import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { MoversData, MoverRow } from '@/pages/api/market/movers';

const REFRESH_MS = 5 * 60 * 1000;
const STALE_MS   = 10 * 60 * 1000;

type Tab     = 'active' | 'gainers' | 'losers';
type SortCol = keyof Pick<MoverRow, 'price' | 'change' | 'changePct' | 'open' | 'high' | 'low' | 'volume' | 'dollarVolume'>;
type SortDir = 'asc' | 'desc';

const TAB_META: Record<Tab, { label: string; emoji: string; tip: string }> = {
  active:  { label: 'Most Active',  emoji: '⚡', tip: 'Ranked by dollar volume (price × shares traded). Highest liquidity names of the session.' },
  gainers: { label: 'Top Gainers',  emoji: '🚀', tip: 'Stocks with the largest % gain today. During market hours sourced live; outside hours shows last session.' },
  losers:  { label: 'Top Losers',   emoji: '🔻', tip: 'Stocks with the largest % decline today. During market hours sourced live; outside hours shows last session.' },
};

// Fixed 11-column grid. Table wrapped in overflow-x-auto so all columns always render aligned.
const GRID = '1.5rem 3.5rem 1fr 5.5rem 5.5rem 5rem 4.5rem 4.5rem 4.5rem 5rem 6rem';

/* ── Tooltip ──────────────────────────────────────────────────── */
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
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
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)         return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function fmtPrice(p: number): string {
  return p > 0 ? `$${p.toFixed(2)}` : '—';
}

/* ── Sort indicator ───────────────────────────────────────────── */
function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol | null; sortDir: SortDir }) {
  if (sortCol !== col) return <span className="ml-0.5 text-gray-300 dark:text-zinc-700">⇅</span>;
  return <span className="ml-0.5 text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

/* ── Sortable header cell ─────────────────────────────────────── */
function SortHeader({
  col, label, tip, sortCol, sortDir, onSort,
}: {
  col: SortCol; label: string; tip: string;
  sortCol: SortCol | null; sortDir: SortDir; onSort: (c: SortCol) => void;
}) {
  return (
    <Tooltip text={tip}>
      <button
        onClick={() => onSort(col)}
        className="w-full text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors flex items-center justify-end gap-0.5"
      >
        {label}
        <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
      </button>
    </Tooltip>
  );
}

/* ── Single data row ──────────────────────────────────────────── */
function MoverRowItem({ row }: { row: MoverRow }) {
  const up       = row.changePct >= 0;
  const chgColor = up ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
  const rankColor =
    row.rank === 1 ? 'text-yellow-500 font-bold' :
    row.rank === 2 ? 'text-gray-400 dark:text-zinc-400 font-semibold' :
    row.rank === 3 ? 'text-amber-600 dark:text-amber-500 font-semibold' :
    'text-gray-400 dark:text-zinc-600';

  const rangeTip = `Open:  $${row.open.toFixed(2)}\nHigh:  $${row.high.toFixed(2)}\nLow:   $${row.low.toFixed(2)}\nClose: $${row.price.toFixed(2)}`;
  const volTip   = `Shares traded: ${row.volume.toLocaleString()}\nDollar volume: $${row.dollarVolume.toLocaleString()}`;

  return (
    <div
      className="grid items-center gap-x-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors rounded-md"
      style={{ gridTemplateColumns: GRID }}
    >
      <span className={`text-xs text-center tabular-nums ${rankColor}`}>{row.rank}</span>
      <span className="text-xs font-bold text-gray-800 dark:text-zinc-200 truncate">{row.symbol}</span>
      <span className="text-xs text-gray-500 dark:text-zinc-400 truncate">{row.name}</span>
      <span className="text-xs font-mono font-medium text-gray-800 dark:text-zinc-200 text-right tabular-nums">{fmtPrice(row.price)}</span>
      <span className={`text-xs font-mono font-semibold text-right tabular-nums ${chgColor}`}>{row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}</span>
      <span className={`text-xs font-semibold text-right tabular-nums ${chgColor}`}>{row.changePct >= 0 ? '+' : ''}{row.changePct.toFixed(2)}%</span>
      <Tooltip text={rangeTip}><span className="text-xs font-mono text-gray-500 dark:text-zinc-500 text-right tabular-nums block">{fmtPrice(row.open)}</span></Tooltip>
      <Tooltip text={rangeTip}><span className="text-xs font-mono text-green-600 dark:text-green-500 text-right tabular-nums block">{fmtPrice(row.high)}</span></Tooltip>
      <Tooltip text={rangeTip}><span className="text-xs font-mono text-red-500 dark:text-red-400 text-right tabular-nums block">{fmtPrice(row.low)}</span></Tooltip>
      <Tooltip text={volTip}><span className="text-xs text-gray-500 dark:text-zinc-400 text-right tabular-nums block">{fmtVol(row.volume)}</span></Tooltip>
      <Tooltip text={volTip}><span className="text-xs text-gray-500 dark:text-zinc-400 text-right tabular-nums block">${fmtVol(row.dollarVolume)}</span></Tooltip>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────── */
export default function TopMovers() {
  const [data, setData]       = useState<MoversData | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<Tab>('active');
  const [isStale, setIsStale] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
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

  // Reset sort when switching tabs
  useEffect(() => { setSortCol(null); }, [tab]);

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  const baseRows: MoverRow[] = data ? data[tab] : [];

  const rows = useMemo(() => {
    if (!sortCol) return baseRows;
    return [...baseRows].sort((a, b) => {
      const av = a[sortCol] as number;
      const bv = b[sortCol] as number;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [baseRows, sortCol, sortDir]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-600">
        Top movers unavailable: {error}
      </div>
    );
  }

  const ts = data
    ? new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const hProps = { sortCol, sortDir, onSort: handleSort };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-4 py-4 space-y-3">

      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-gray-700 dark:text-zinc-300">🔥 Top Movers</h2>

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

      {/* ── Scrollable table ── */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: '860px' }}>

          {/* Column headers */}
          <div
            className="grid items-center gap-x-2 px-3 pb-2 border-b border-gray-100 dark:border-zinc-800"
            style={{ gridTemplateColumns: GRID }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-500 text-center">#</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-500">Ticker</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-500">Name</span>
            <SortHeader col="price"        label="Price"    tip="Sort by last trade price"                                     {...hProps} />
            <SortHeader col="change"       label="Net $"    tip="Sort by net dollar change from previous close"                {...hProps} />
            <SortHeader col="changePct"    label="Chg %"    tip="Sort by % change from previous close"                         {...hProps} />
            <SortHeader col="open"         label="Open"     tip="Sort by session opening price"                                {...hProps} />
            <SortHeader col="high"         label="High"     tip="Sort by intraday high"                                         {...hProps} />
            <SortHeader col="low"          label="Low"      tip="Sort by intraday low"                                          {...hProps} />
            <SortHeader col="volume"       label="Volume"   tip="Sort by shares traded"                                        {...hProps} />
            <SortHeader col="dollarVolume" label="$Volume"  tip="Sort by dollar volume (price × shares). Measures liquidity."  {...hProps} />
          </div>

          {/* Rows */}
          <div className="space-y-0">
            {!data ? (
              Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-8 mx-3 my-1 bg-gray-100 dark:bg-zinc-800 rounded animate-pulse" />
              ))
            ) : rows.length === 0 ? (
              <div className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">
                Market closed — no live data for this session yet.
              </div>
            ) : (
              rows.map((row) => <MoverRowItem key={row.symbol} row={row} />)
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
