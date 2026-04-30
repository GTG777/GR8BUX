import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Layout } from '@/components/Layout';
import type { ScreenerRow } from '@/pages/api/market/screener';
import type { PerfRow } from '@/pages/api/market/top-performers';

// ── Presets ───────────────────────────────────────────────────────
const PRESETS: Record<string, string[]> = {
  'Tech': ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AMD','AVGO','CRM','ORCL','NFLX','ADBE','QCOM','INTC'],
  'Mega Cap': ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','LLY','V','JPM','UNH','XOM','TSLA','AVGO','JNJ','COST'],
  'Financials': ['JPM','GS','MS','BAC','WFC','V','MA','AXP','BLK','SCHW','CB','PGR','TFC','USB','COF'],
  'Energy': ['XOM','CVX','COP','EOG','SLB','PSX','VLO','MPC','OXY','HAL','DVN','HES','APA','BKR','MRO'],
  'Healthcare': ['UNH','LLY','JNJ','ABBV','MRK','PFE','TMO','ABT','AMGN','BMY','ISRG','MDT','CVS','CI','ELV'],
  'Consumer': ['AMZN','HD','MCD','COST','TGT','WMT','NKE','SBUX','LOW','TJX','YUM','ULTA','ROST','DG','DLTR'],
  'ETFs': ['SPY','QQQ','IWM','DIA','GLD','SLV','TLT','HYG','XLE','XLF','XLK','XLV','XLI','XLC','ARKK'],
};

// ── Types ─────────────────────────────────────────────────────────
type SortKey = keyof Pick<ScreenerRow,'price'|'changePct'|'trendScore'|'rsi'|'tsi'|'volumeRatio'|'atr14'|'hv20'>;
type TrendFilter = 'all' | 'bull3' | 'bull' | 'bear' | 'bear3';
type RsiFilter   = 'all' | 'oversold' | 'neutral' | 'overbought';
type VolFilter   = 'all' | 'elevated';
type GradeFilter = 'all' | 'A' | 'B' | 'C';

// ── Helpers ───────────────────────────────────────────────────────
function trendLabel(s: number) {
  if (s === 3)  return { text: '▲▲▲ Strong Bull', cls: 'text-green-600 dark:text-green-400 font-bold' };
  if (s === 2)  return { text: '▲▲ Bullish',      cls: 'text-green-500 dark:text-green-400' };
  if (s === 1)  return { text: '▲ Leaning Bull',  cls: 'text-emerald-500' };
  if (s === -1) return { text: '▼ Leaning Bear',  cls: 'text-orange-500' };
  if (s === -2) return { text: '▼▼ Bearish',      cls: 'text-red-500' };
  return              { text: '▼▼▼ Strong Bear', cls: 'text-red-600 dark:text-red-400 font-bold' };
}

function gradeChip(g: string) {
  if (g === 'A') return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300';
  if (g === 'B') return 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300';
  if (g === 'C') return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
  return 'bg-gray-100 dark:bg-zinc-800 text-gray-400';
}

function rsiColor(rsi: number) {
  if (rsi > 70) return 'text-red-600 dark:text-red-400';
  if (rsi < 30) return 'text-green-600 dark:text-green-400';
  return 'text-gray-700 dark:text-zinc-200';
}

function changeColor(v: number) {
  return v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';
}

function retColor(v: number) {
  if (v >= 50)  return 'text-emerald-600 dark:text-emerald-400 font-bold';
  if (v >= 20)  return 'text-green-600 dark:text-green-400 font-semibold';
  if (v >= 5)   return 'text-green-500 dark:text-green-400';
  if (v >= 0)   return 'text-gray-600 dark:text-zinc-300';
  if (v >= -20) return 'text-red-500 dark:text-red-400';
  return 'text-red-700 dark:text-red-400 font-semibold';
}

function retBar(v: number) {
  const capped = Math.min(Math.abs(v), 150);
  const pct    = (capped / 150) * 100;
  const color  = v >= 0 ? 'bg-green-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 w-36">
      <div className="w-20 h-1.5 rounded-full bg-gray-100 dark:bg-zinc-700 overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums w-14 ${retColor(v)}`}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</span>
    </div>
  );
}

function MedalBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span title="🥇 #1">🥇</span>;
  if (rank === 2) return <span title="🥈 #2">🥈</span>;
  if (rank === 3) return <span title="🥉 #3">🥉</span>;
  return <span className="text-xs text-gray-400 dark:text-zinc-500 tabular-nums w-6 text-center">{rank}</span>;
}

// ── Chip button ───────────────────────────────────────────────────
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
        active
          ? 'bg-indigo-600 border-indigo-600 text-white'
          : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:border-indigo-400 dark:hover:border-indigo-500'
      }`}
    >
      {children}
    </button>
  );
}

// ── Sort header ───────────────────────────────────────────────────
function SortTh({ col, label, sortKey, dir, onSort }: {
  col: SortKey; label: string; sortKey: SortKey; dir: 'asc'|'desc'; onSort: (k: SortKey) => void
}) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide cursor-pointer select-none hover:text-indigo-600 dark:hover:text-indigo-400 whitespace-nowrap"
    >
      {label}{active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function StockScreenerPage() {
  const router = useRouter();

  // ── Tab ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'screener' | 'performers'>('screener');

  // ── Screener state ────────────────────────────────────────────────
  const [activePreset, setActivePreset] = useState<string>('Tech');
  const [customInput, setCustomInput]   = useState('');
  const [rows, setRows]                 = useState<ScreenerRow[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [scanned, setScanned]           = useState(false);

  // Filters
  const [trend, setTrend]   = useState<TrendFilter>('all');
  const [rsiF, setRsiF]     = useState<RsiFilter>('all');
  const [volF, setVolF]     = useState<VolFilter>('all');
  const [gradeF, setGradeF] = useState<GradeFilter>('all');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('trendScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // ── Top Performers state ──────────────────────────────────────────
  type PerfSortKey = 'rank' | 'ret1y' | 'ret6m' | 'ret3m' | 'ret1m' | 'price';
  const [perfRows, setPerfRows]     = useState<PerfRow[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfLoaded, setPerfLoaded]   = useState(false);
  const [perfError, setPerfError]     = useState('');
  const [perfSortKey, setPerfSortKey] = useState<PerfSortKey>('ret1y');
  const [perfSortDir, setPerfSortDir] = useState<'asc' | 'desc'>('desc');
  const [perfCachedAt, setPerfCachedAt] = useState('');
  const [perfLimit, setPerfLimit]   = useState(30);

  const fetchPerformers = useCallback(async (limit = 30) => {
    setPerfLoading(true);
    setPerfError('');
    try {
      const res  = await fetch(`/api/market/top-performers?limit=${limit}&sortBy=ret1y`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load rankings');
      setPerfRows(json.rows);
      setPerfLoaded(true);
      if (json.cachedAt) setPerfCachedAt(json.cachedAt);
    } catch (e) {
      setPerfError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setPerfLoading(false);
    }
  }, []);

  const handlePerfSort = (key: PerfSortKey) => {
    if (key === perfSortKey) setPerfSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setPerfSortKey(key); setPerfSortDir(key === 'rank' ? 'asc' : 'desc'); }
  };

  const sortedPerfRows = [...perfRows].sort((a, b) => {
    const av = a[perfSortKey] as number;
    const bv = b[perfSortKey] as number;
    return perfSortDir === 'asc' ? av - bv : bv - av;
  });

  // ── Scan ─────────────────────────────────────────────────────────
  const scan = useCallback(async () => {
    setLoading(true);
    setError('');
    const symbols = customInput.trim()
      ? customInput.split(/[\s,]+/).map(s => s.toUpperCase()).filter(Boolean)
      : PRESETS[activePreset] ?? [];
    if (symbols.length === 0) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/market/screener?symbols=${symbols.join(',')}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Scan failed');
      setRows(json.rows);
      setScanned(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  }, [activePreset, customInput]);

  // ── Sort handler ─────────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  // ── Filter + sort rows ────────────────────────────────────────────
  const visible = rows
    .filter(r => {
      if (trend === 'bull3' && r.trendScore !== 3)  return false;
      if (trend === 'bull'  && r.trendScore < 1)    return false;
      if (trend === 'bear'  && r.trendScore > -1)   return false;
      if (trend === 'bear3' && r.trendScore !== -3)  return false;
      if (rsiF === 'oversold'   && r.rsi >= 30)  return false;
      if (rsiF === 'neutral'    && (r.rsi < 30 || r.rsi > 70)) return false;
      if (rsiF === 'overbought' && r.rsi <= 70)  return false;
      if (volF === 'elevated'   && r.volumeRatio < 1.3) return false;
      if (gradeF !== 'all' && r.grade !== gradeF) return false;
      return true;
    })
    .sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === 'asc' ? av - bv : bv - av;
    });

  return (
    <Layout title="Market">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Page header ── */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Market</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
            Stock Screener &amp; Top Performers — powered by live market data
          </p>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-zinc-800">
          {(['screener', 'performers'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-zinc-900'
                  : 'border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
              }`}
            >
              {tab === 'screener' ? '🔍 Stock Screener' : '🏆 Top Performers'}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════
            TAB: SCREENER
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'screener' && (<>

        {/* ── Controls ── */}
        <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-4 space-y-4">

          {/* Presets */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Preset Lists</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(PRESETS).map(p => (
                <Chip key={p} active={activePreset === p && !customInput} onClick={() => { setActivePreset(p); setCustomInput(''); }}>
                  {p}
                </Chip>
              ))}
            </div>
          </div>

          {/* Custom symbols + scan */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide block mb-1">
                Custom Symbols (comma or space separated, max 40)
              </label>
              <input
                type="text"
                value={customInput}
                onChange={e => setCustomInput(e.target.value.toUpperCase())}
                placeholder="e.g. AAPL, TSLA, NVDA, SPY"
                className="w-full rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={scan}
                disabled={loading}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg transition-colors text-sm"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Scanning…
                  </>
                ) : '🔍 Scan'}
              </button>
            </div>
          </div>

          {/* Filters — only shown once there are results */}
          {scanned && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-gray-100 dark:border-zinc-800">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Trend</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['all','bull3','bull','bear','bear3'] as TrendFilter[]).map(v => (
                    <Chip key={v} active={trend === v} onClick={() => setTrend(v)}>
                      {v === 'all' ? 'All' : v === 'bull3' ? '▲▲▲' : v === 'bull' ? '▲ Bull' : v === 'bear' ? '▼ Bear' : '▼▼▼'}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">RSI</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['all','oversold','neutral','overbought'] as RsiFilter[]).map(v => (
                    <Chip key={v} active={rsiF === v} onClick={() => setRsiF(v)}>
                      {v === 'all' ? 'All' : v === 'oversold' ? '< 30' : v === 'neutral' ? '30–70' : '> 70'}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Volume</p>
                <div className="flex flex-wrap gap-1.5">
                  <Chip active={volF === 'all'} onClick={() => setVolF('all')}>All</Chip>
                  <Chip active={volF === 'elevated'} onClick={() => setVolF('elevated')}>Elevated ≥1.3×</Chip>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Grade</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['all','A','B','C'] as GradeFilter[]).map(v => (
                    <Chip key={v} active={gradeF === v} onClick={() => setGradeF(v)}>
                      {v === 'all' ? 'All' : `Grade ${v}`}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* ── Empty / initial state ── */}
        {!loading && !scanned && !error && (
          <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-12 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-gray-500 dark:text-zinc-400 text-sm">
              Select a preset or enter symbols above, then click <strong>Scan</strong>.
            </p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Results cached 15 min. Click any row to open Stock Analysis.</p>
          </div>
        )}

        {/* ── No results after filter ── */}
        {!loading && scanned && visible.length === 0 && rows.length > 0 && (
          <div className="rounded-xl border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-6 text-center text-sm text-amber-700 dark:text-amber-400">
            No symbols match the current filters. Try relaxing your criteria.
          </div>
        )}

        {/* ── Results table ── */}
        {visible.length > 0 && (
          <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700 dark:text-zinc-200">
                {visible.length} result{visible.length !== 1 ? 's' : ''}
                {visible.length < rows.length && <span className="text-gray-400 dark:text-zinc-500 font-normal"> of {rows.length} scanned</span>}
              </p>
              <p className="text-xs text-gray-400 dark:text-zinc-500">Click a row → Stock Analysis</p>
            </div>

            {/* Table — always visible, scrolls horizontally on narrow screens */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-zinc-800/60">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Symbol</th>
                    <SortTh col="price"       label="Price"     sortKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh col="changePct"   label="Change%"   sortKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh col="trendScore"  label="Trend"     sortKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh col="rsi"         label="RSI"       sortKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh col="tsi"         label="TSI"       sortKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh col="volumeRatio" label="Vol Ratio" sortKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh col="atr14"       label="ATR"       sortKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh col="hv20"        label="HV20%"     sortKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Grade</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Setups</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {visible.map(row => {
                    const tl = trendLabel(row.trendScore);
                    return (
                      <tr
                        key={row.symbol}
                        onClick={() => router.push(`/stocks?symbol=${row.symbol}`)}
                        className="hover:bg-indigo-50 dark:hover:bg-indigo-950/20 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-bold text-gray-900 dark:text-white">{row.symbol}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-700 dark:text-zinc-200">
                          ${row.price.toFixed(2)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono font-semibold ${changeColor(row.changePct)}`}>
                          {row.changePct >= 0 ? '+' : ''}{row.changePct.toFixed(2)}%
                        </td>
                        <td className={`px-3 py-2.5 text-right text-xs ${tl.cls}`}>
                          {tl.text}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono ${rsiColor(row.rsi)}`}>
                          {row.rsi.toFixed(1)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono ${row.tsi > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                          {row.tsi.toFixed(1)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono ${row.volumeRatio >= 1.3 ? 'text-orange-600 dark:text-orange-400 font-semibold' : 'text-gray-600 dark:text-zinc-300'}`}>
                          {row.volumeRatio.toFixed(2)}×
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-600 dark:text-zinc-300">
                          ${row.atr14.toFixed(2)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-600 dark:text-zinc-300">
                          {row.hv20.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${gradeChip(row.grade)}`}>
                            {row.grade}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {row.setupCount > 0
                            ? <span className="text-indigo-600 dark:text-indigo-400 font-bold">{row.setupCount}</span>
                            : <span className="text-gray-300 dark:text-zinc-600">—</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>


          </div>
        )}

        {/* ── Legend ── */}
        {scanned && (
          <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Column Guide</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-2">
              {[
                ['Trend Score',  'EMAs 20/50/200 vs price. +3 = all below (strong uptrend). −3 = all above (strong downtrend).'],
                ['RSI',         'Relative Strength Index 14. < 30 = oversold (green). > 70 = overbought (red).'],
                ['TSI',         'True Strength Index (25,13). Positive = bullish momentum. Negative = bearish.'],
                ['Vol Ratio',   "Today's volume vs 20-day average. ≥ 1.3× = elevated conviction (orange)."],
                ['ATR',         'Average True Range 14. Dollar measure of daily price volatility.'],
                ['HV20%',       'Historical volatility (annualised). Useful for options pricing context.'],
                ['Grade',       'A = 4–5 signals aligned. B = 2–3. C = 0–1. Based on trend + momentum + volume.'],
                ['Setups',      'Count of high-confidence trade setups detected. Click row to see full breakdown.'],
              ].map(([term, def]) => (
                <div key={term} className="flex gap-2 text-xs py-1">
                  <span className="font-semibold text-gray-700 dark:text-gray-200 w-24 shrink-0">{term}</span>
                  <span className="text-gray-500 dark:text-gray-400">{def}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </>)}

        {/* ════════════════════════════════════════════════════════
            TAB: TOP PERFORMERS
        ════════════════════════════════════════════════════════ */}
        {activeTab === 'performers' && (
          <div className="space-y-5">
            {/* Header + Load */}
            <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">Best Performing Stocks</h2>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                    Ranked by 1-year price return · ~{UNIVERSE_COUNT} stocks · Cached 4 hours
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {perfLoaded && perfCachedAt && (
                    <span className="text-xs text-gray-400 dark:text-zinc-500">
                      Updated {new Date(perfCachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    <select
                      value={perfLimit}
                      onChange={e => setPerfLimit(Number(e.target.value))}
                      className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-gray-700 dark:text-zinc-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value={10}>Top 10</option>
                      <option value={20}>Top 20</option>
                      <option value={30}>Top 30</option>
                      <option value={50}>Top 50</option>
                    </select>
                    <button
                      onClick={() => fetchPerformers(perfLimit)}
                      disabled={perfLoading}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-1.5 rounded-lg transition-colors text-sm"
                    >
                      {perfLoading ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Loading…
                        </>
                      ) : perfLoaded ? '🔄 Refresh' : '🏆 Load Rankings'}
                    </button>
                  </div>
                </div>
              </div>
              {!perfLoaded && !perfLoading && (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-lg px-3 py-2">
                  ⏱ First load takes ~15–30s as it fetches 1 year of data for {UNIVERSE_COUNT} stocks. Results are then cached for 4 hours.
                </p>
              )}
            </div>

            {/* Error */}
            {perfError && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {perfError}
              </div>
            )}

            {/* Loading skeleton */}
            {perfLoading && (
              <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-8 text-center">
                <span className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin inline-block mb-3" />
                <p className="text-sm text-gray-500 dark:text-zinc-400">Fetching {UNIVERSE_COUNT} stocks — hang tight…</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">This only runs every 4 hours</p>
              </div>
            )}

            {/* Empty prompt */}
            {!perfLoaded && !perfLoading && !perfError && (
              <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-12 text-center">
                <div className="text-4xl mb-3">🏆</div>
                <p className="text-gray-500 dark:text-zinc-400 text-sm">
                  Click <strong>Load Rankings</strong> to see the best performing stocks by 1M, 3M, 6M and 1Y returns.
                </p>
              </div>
            )}

            {/* Results table */}
            {perfLoaded && sortedPerfRows.length > 0 && (
              <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700 dark:text-zinc-200">
                    Top {sortedPerfRows.length} stocks — ranked by 1Y return
                  </p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">Click any row → Stock Analysis</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-zinc-800/60">
                      <tr>
                        <th
                          onClick={() => handlePerfSort('rank')}
                          className="px-4 py-2 text-center text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 w-12"
                        >
                          #{perfSortKey === 'rank' ? (perfSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                          Symbol
                        </th>
                        <th
                          onClick={() => handlePerfSort('price')}
                          className="px-3 py-2 text-right text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 whitespace-nowrap"
                        >
                          Price{perfSortKey === 'price' ? (perfSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                        {(['ret1m', 'ret3m', 'ret6m', 'ret1y'] as const).map(col => {
                          const labels: Record<string, string> = { ret1m: '1M %', ret3m: '3M %', ret6m: '6M %', ret1y: '1Y %' };
                          return (
                            <th
                              key={col}
                              onClick={() => handlePerfSort(col)}
                              className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 whitespace-nowrap w-36 ${
                                perfSortKey === col
                                  ? 'text-indigo-600 dark:text-indigo-400'
                                  : 'text-gray-500 dark:text-zinc-400'
                              }`}
                            >
                              {labels[col]}{perfSortKey === col ? (perfSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                      {sortedPerfRows.map(row => (
                        <tr
                          key={row.symbol}
                          onClick={() => router.push(`/stocks?symbol=${row.symbol}`)}
                          className="hover:bg-indigo-50 dark:hover:bg-indigo-950/20 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-2.5 text-center">
                            <MedalBadge rank={row.rank} />
                          </td>
                          <td className="px-4 py-2.5">
                            <div>
                              <span className="font-bold text-gray-900 dark:text-white">{row.symbol}</span>
                              <span className="ml-2 text-xs text-gray-400 dark:text-zinc-500">{row.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-700 dark:text-zinc-200">
                            ${row.price.toFixed(2)}
                          </td>
                          <td className="px-3 py-2.5">{retBar(row.ret1m)}</td>
                          <td className="px-3 py-2.5">{retBar(row.ret3m)}</td>
                          <td className="px-3 py-2.5">{retBar(row.ret6m)}</td>
                          <td className="px-3 py-2.5">{retBar(row.ret1y)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="px-4 py-3 border-t border-gray-100 dark:border-zinc-800 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400 dark:text-zinc-500">
                  <span><span className="text-emerald-600 dark:text-emerald-400 font-bold">Bold green</span> = +50%+</span>
                  <span><span className="text-green-600 dark:text-green-400 font-semibold">Green</span> = +20%+</span>
                  <span><span className="text-gray-600 dark:text-zinc-300">Grey</span> = 0%–20%</span>
                  <span><span className="text-red-500">Red</span> = negative</span>
                  <span>Rank # = by 1Y return · bar width scales to 150% max</span>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </Layout>
  );
}

const UNIVERSE_COUNT = 88;

