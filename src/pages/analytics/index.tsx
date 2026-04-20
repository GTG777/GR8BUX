import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  Cell, PieChart, Pie,
} from 'recharts';
import { Layout } from '@/components/Layout';
import { useTradeStore } from '@/store/tradeStore';
import type { Trade, TradeAnalytics } from '@/types';

/* ── Helpers ─────────────────────────────────────────────────────── */
const fmt$ = (n: number) =>
  (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtMonth = (d: string) => new Date(d + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

/* ── Info tooltip (ⓘ hover) ──────────────────────────────────────── */
function InfoTip({ text }: { text: string }) {
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  return (
    <span
      className="inline-flex items-center"
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e)  => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={()  => setPos(null)}
    >
      <svg
        className="w-3 h-3 text-gray-300 dark:text-zinc-600 hover:text-indigo-400 dark:hover:text-indigo-400 cursor-help transition-colors ml-1 shrink-0"
        viewBox="0 0 20 20" fill="currentColor"
      >
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 01-1-1v-4a1 1 0 112 0v4a1 1 0 01-1 1z" clipRule="evenodd" />
      </svg>
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

/* ── Stat card ───────────────────────────────────────────────────── */
function StatCard({
  label, value, sub, color = 'text-gray-900 dark:text-white', bg = '', tooltip,
}: { label: string; value: string; sub?: string; color?: string; bg?: string; tooltip?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm ${bg}`}>
      <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-1 flex items-center">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </p>
      <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Section header ──────────────────────────────────────────────── */
function SectionHead({ title, sub, tooltip }: { title: string; sub?: string; tooltip?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-bold text-gray-800 dark:text-white uppercase tracking-widest flex items-center">
        {title}
        {tooltip && <InfoTip text={tooltip} />}
      </h2>
      {sub && <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Custom tooltip ──────────────────────────────────────────────── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-zinc-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color ?? '#6366f1' }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' ? fmt$(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

/* ── Build equity curve from closed trades ───────────────────────── */
function buildEquityCurve(trades: Trade[]): { date: string; equity: number; drawdown: number }[] {
  const closed = trades
    .filter((t) => t.status === 'closed' && t.exitDate && t.pnl != null)
    .sort((a, b) => new Date(a.exitDate!).getTime() - new Date(b.exitDate!).getTime());

  let equity = 0;
  let peak = 0;
  return closed.map((t) => {
    equity += t.pnl!;
    peak = Math.max(peak, equity);
    return {
      date: fmtDate(t.exitDate!),
      equity: parseFloat(equity.toFixed(2)),
      drawdown: parseFloat((equity - peak).toFixed(2)),
    };
  });
}

/* ── Build monthly P&L bar data ──────────────────────────────────── */
function buildMonthly(trades: Trade[]): { month: string; pnl: number }[] {
  const map: Record<string, number> = {};
  trades
    .filter((t) => t.status === 'closed' && t.exitDate && t.pnl != null)
    .forEach((t) => {
      const key = t.exitDate!.slice(0, 7); // YYYY-MM
      map[key] = (map[key] ?? 0) + t.pnl!;
    });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({ month: fmtMonth(k), pnl: parseFloat(v.toFixed(2)) }));
}

/* ── Win/loss streak builder ─────────────────────────────────────── */
function buildStreaks(trades: Trade[]): { win: number; loss: number } {
  const closed = trades
    .filter((t) => t.status === 'closed' && t.pnl != null)
    .sort((a, b) => new Date(a.exitDate ?? a.entryDate).getTime() - new Date(b.exitDate ?? b.entryDate).getTime());
  let curWin = 0, curLoss = 0, maxWin = 0, maxLoss = 0;
  for (const t of closed) {
    if ((t.pnl ?? 0) > 0) { curWin++; curLoss = 0; maxWin = Math.max(maxWin, curWin); }
    else                   { curLoss++; curWin = 0; maxLoss = Math.max(maxLoss, curLoss); }
  }
  return { win: maxWin, loss: maxLoss };
}

/* ── Hold time histogram ─────────────────────────────────────────── */
function buildHoldTimes(trades: Trade[]): { bucket: string; count: number }[] {
  const buckets = ['1d', '2–5d', '1–2w', '2–4w', '1–3m', '3m+'];
  const counts = [0, 0, 0, 0, 0, 0];
  trades
    .filter((t) => t.status === 'closed' && t.exitDate && t.entryDate)
    .forEach((t) => {
      const days = Math.round((new Date(t.exitDate!).getTime() - new Date(t.entryDate).getTime()) / 86400000);
      if (days <= 1)        counts[0]++;
      else if (days <= 5)   counts[1]++;
      else if (days <= 14)  counts[2]++;
      else if (days <= 28)  counts[3]++;
      else if (days <= 90)  counts[4]++;
      else                  counts[5]++;
    });
  return buckets.map((b, i) => ({ bucket: b, count: counts[i] }));
}

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899'];

export default function AnalyticsPage() {
  const { trades, analytics, isLoading, fetchTrades, fetchAnalytics } = useTradeStore();
  const [period, setPeriod] = useState<'all' | '90d' | '30d' | 'ytd'>('all');
  const [tradeType, setTradeType] = useState<'all' | 'stock' | 'option'>('all');

  useEffect(() => {
    fetchTrades(undefined, 500);
    fetchAnalytics();
  }, [fetchTrades, fetchAnalytics]);

  /* ── Apply filters ─────────────────────────────────────────────── */
  const filtered = useMemo(() => {
    let t = trades;
    if (tradeType !== 'all') t = t.filter((x) => x.type === tradeType);
    if (period !== 'all') {
      const cutoff = new Date();
      if (period === '30d')  cutoff.setDate(cutoff.getDate() - 30);
      if (period === '90d')  cutoff.setDate(cutoff.getDate() - 90);
      if (period === 'ytd')  cutoff.setMonth(0, 1);
      t = t.filter((x) => new Date(x.entryDate) >= cutoff);
    }
    return t;
  }, [trades, period, tradeType]);

  const closed = useMemo(() => filtered.filter((t) => t.status === 'closed' && t.pnl != null), [filtered]);

  /* ── Derived stats ─────────────────────────────────────────────── */
  const totalPnL   = useMemo(() => closed.reduce((s, t) => s + (t.pnl ?? 0), 0), [closed]);
  const wins       = useMemo(() => closed.filter((t) => (t.pnl ?? 0) > 0), [closed]);
  const losses     = useMemo(() => closed.filter((t) => (t.pnl ?? 0) < 0), [closed]);
  const winRate    = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const avgWin     = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 0;
  const avgLoss    = losses.length > 0 ? losses.reduce((s, t) => s + (t.pnl ?? 0), 0) / losses.length : 0;
  const profitFactor = Math.abs(avgLoss) > 0 ? Math.abs(avgWin * wins.length) / Math.abs(avgLoss * losses.length) : 0;
  const largestWin  = wins.length > 0 ? Math.max(...wins.map((t) => t.pnl ?? 0)) : 0;
  const largestLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.pnl ?? 0)) : 0;
  const openTrades  = filtered.filter((t) => t.status === 'open').length;

  /* ── Chart data ────────────────────────────────────────────────── */
  const equityCurve = useMemo(() => buildEquityCurve(closed), [closed]);
  const monthlyData = useMemo(() => buildMonthly(closed), [closed]);
  const holdTimes   = useMemo(() => buildHoldTimes(closed), [closed]);
  const streaks     = useMemo(() => buildStreaks(closed), [closed]);

  /* ── By strategy pie ───────────────────────────────────────────── */
  const strategyData = useMemo(() => {
    const map: Record<string, number> = {};
    closed.forEach((t) => {
      const strat = t.optionData?.strategy || t.type || 'other';
      map[strat] = (map[strat] ?? 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [closed]);

  /* ── By symbol ─────────────────────────────────────────────────── */
  const symbolData = useMemo(() => {
    const map: Record<string, { pnl: number; count: number }> = {};
    closed.forEach((t) => {
      if (!map[t.symbol]) map[t.symbol] = { pnl: 0, count: 0 };
      map[t.symbol].pnl += t.pnl ?? 0;
      map[t.symbol].count++;
    });
    return Object.entries(map)
      .map(([symbol, d]) => ({ symbol, pnl: parseFloat(d.pnl.toFixed(2)), count: d.count }))
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 10);
  }, [closed]);

  /* ── Max drawdown from equity curve ───────────────────────────── */
  const maxDrawdown = useMemo(() => {
    if (!equityCurve.length) return 0;
    return Math.min(...equityCurve.map((p) => p.drawdown));
  }, [equityCurve]);

  const riskReward = Math.abs(avgLoss) > 0 ? Math.abs(avgWin / avgLoss) : 0;

  if (isLoading && !trades.length) {
    return (
      <Layout title="Analytics">
        <div className="flex items-center justify-center py-32">
          <span className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-3" />
          <span className="text-gray-500">Loading analytics…</span>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Analytics">
      <div className="space-y-8 max-w-7xl mx-auto pb-10">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Performance Analytics</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-500 mt-0.5">
              {closed.length} closed trades · {openTrades} open
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {/* Period */}
            <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-1 gap-1">
              {(['all', '30d', '90d', 'ytd'] as const).map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${period === p ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700'}`}>
                  {p === 'all' ? 'All Time' : p === 'ytd' ? 'YTD' : p}
                </button>
              ))}
            </div>
            {/* Type */}
            <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-1 gap-1">
              {(['all', 'stock', 'option'] as const).map((t) => (
                <button key={t} onClick={() => setTradeType(t)}
                  className={`px-3 py-1 rounded text-xs font-semibold capitalize transition-colors ${tradeType === t ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700'}`}>
                  {t === 'all' ? 'All Types' : t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {closed.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-zinc-800 p-16 text-center">
            <p className="text-4xl mb-4">📊</p>
            <p className="text-lg font-semibold text-gray-500 dark:text-zinc-400">No closed trades yet</p>
            <p className="text-sm text-gray-400 dark:text-zinc-600 mt-1 mb-6">Log trades and close them to see performance analytics</p>
            <Link href="/trades" className="inline-block px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">
              Go to Trade Journal →
            </Link>
          </div>
        ) : (
          <>
            {/* ── KPI Grid ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="Total P&L" value={fmt$(totalPnL)}
                color={totalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
                tooltip="Sum of all realized profits and losses across closed trades in the selected period. Open trades are excluded." />
              <StatCard label="Win Rate" value={`${winRate.toFixed(1)}%`}
                color={winRate >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
                sub={`${wins.length}W / ${losses.length}L`}
                tooltip="Percentage of closed trades that were profitable.\n\nAbove 50% is positive, but must be read alongside R:R — a 40% win rate with a 3:1 R:R is still highly profitable." />
              <StatCard label="Profit Factor" value={profitFactor.toFixed(2)}
                color={profitFactor >= 1.5 ? 'text-emerald-600 dark:text-emerald-400' : profitFactor >= 1 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}
                tooltip="Gross profits ÷ gross losses.\n\n>1.0 = profitable system\n>1.5 = strong edge\n>2.0 = exceptional edge\n<1.0 = losing system" />
              <StatCard label="Avg R:R" value={riskReward.toFixed(2)}
                color={riskReward >= 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-yellow-600 dark:text-yellow-400'}
                sub={`Avg W: ${fmt$(avgWin).replace('+', '')}`}
                tooltip="Average reward-to-risk ratio = Avg Win ÷ Avg Loss.\n\nA ratio ≥ 1.5 means your winners are at least 1.5× your losers on average. Combine with win rate to assess true edge." />
              <StatCard label="Max Drawdown" value={fmt$(maxDrawdown)}
                color="text-red-600 dark:text-red-400"
                sub={`Largest L: ${fmt$(largestLoss).replace('+', '')}`}
                tooltip="Largest peak-to-trough decline in cumulative P&L across the selected period.\n\nMeasures the worst losing sequence you experienced. Smaller is better — indicates better risk management." />
              <StatCard label="Largest Win" value={fmt$(largestWin)}
                color="text-emerald-600 dark:text-emerald-400"
                sub={`${closed.length} total trades`}
                tooltip="The single biggest winning trade in the selected period. Compare to Avg Win to check if your overall P&L is driven by one outlier trade." />
            </div>

            {/* ── Secondary KPIs ───────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Avg Win" value={fmt$(avgWin)} color="text-emerald-600 dark:text-emerald-400"
                tooltip="Average dollar profit per winning trade. Compare to Avg Loss to assess your reward-to-risk ratio." />
              <StatCard label="Avg Loss" value={fmt$(avgLoss)} color="text-red-600 dark:text-red-400"
                tooltip="Average dollar loss per losing trade. This is your baseline cost of being wrong — keep it controlled relative to your Avg Win." />
              <StatCard label="Best Win Streak" value={`${streaks.win} trades`} color="text-emerald-600 dark:text-emerald-400"
                tooltip="Longest consecutive run of profitable trades in the selected period. Useful for gauging when your edge is working well." />
              <StatCard label="Worst Loss Streak" value={`${streaks.loss} trades`} color="text-red-600 dark:text-red-400"
                tooltip="Longest consecutive run of losing trades. Important for sizing — ensure your account can withstand this streak without being forced out of the market." />
            </div>

            {/* ── Equity Curve ─────────────────────────────────────── */}
            {equityCurve.length >= 2 && (
              <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
                <SectionHead title="Equity Curve" sub="Cumulative P&L from closed trades in chronological order"
                  tooltip="Running total of realized P&L plotted over time by trade exit date.\n\nA smooth upward slope indicates consistent profitability. Steep drops are drawdown periods. Flat stretches mean no closed activity." />
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={equityCurve} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `$${v}`} width={60} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />
                    <Area type="monotone" dataKey="equity" name="Equity" stroke="#6366f1" fill="url(#eqGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Monthly P&L + Hold Time ───────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Monthly */}
              {monthlyData.length > 0 && (
                <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
                  <SectionHead title="Monthly P&L"
                    tooltip="Total realized P&L grouped by calendar month.\n\nGreen bars = profitable months, red bars = losing months. Useful for spotting seasonal patterns or periods of poor performance." />
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `$${v}`} width={55} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="pnl" name="P&L" radius={[3, 3, 0, 0]}>
                        {monthlyData.map((entry, i) => (
                          <Cell key={i} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Hold Time */}
              <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
                <SectionHead title="Hold Time Distribution" sub="How long trades were held"
                  tooltip="Distribution of how long you held trades before closing.\n\nReveals your trading style: day trader (1d), swing trader (2–14d), or position trader (1m+). Helps identify if your edge differs by hold duration." />
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={holdTimes} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} width={30} />
                    <Tooltip contentStyle={{ background: '#111827', border: 'none', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: '#9ca3af' }} formatter={(v: number) => [v, 'Trades']} />
                    <Bar dataKey="count" name="Trades" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Strategy Breakdown + Win/Loss Distribution ────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Strategy pie */}
              {strategyData.length > 0 && (
                <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
                  <SectionHead title="Trade Mix" sub="Closed trades by type / strategy"
                    tooltip="Breakdown of closed trades by instrument type or options strategy.\n\nShows where you deploy capital most. A heavily concentrated mix may indicate over-reliance on one setup." />
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width={140} height={140}>
                      <PieChart>
                        <Pie data={strategyData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                          {strategyData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1.5">
                      {strategyData.map((d, i) => (
                        <div key={d.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-gray-600 dark:text-zinc-400 capitalize">{d.name}</span>
                          </div>
                          <span className="font-semibold text-gray-800 dark:text-zinc-300">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Win vs Loss scatter */}
              <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
                <SectionHead title="Win / Loss Distribution" sub="Individual trade P&L"
                  tooltip="Bar for each of your last 30 closed trades — bar width is proportional to the P&L magnitude.\n\nLook for: are your winning bars consistently wider than losing bars? That confirms positive R:R in practice." />
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {closed.slice(-30).reverse().map((t) => {
                    const pnl = t.pnl ?? 0;
                    const pct = closed.length > 0 ? Math.abs(pnl) / Math.max(...closed.map((x) => Math.abs(x.pnl ?? 0))) * 100 : 0;
                    return (
                      <div key={t.id} className="flex items-center gap-2">
                        <span className="text-xs w-14 shrink-0 font-medium text-gray-500 dark:text-zinc-500">{fmtDate(t.exitDate ?? t.entryDate)}</span>
                        <span className="text-xs w-12 shrink-0 font-bold text-gray-700 dark:text-zinc-300">{t.symbol}</span>
                        <div className="flex-1 h-4 rounded overflow-hidden bg-gray-100 dark:bg-zinc-800">
                          <div className={`h-full rounded ${pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.max(2, pct)}%` }} />
                        </div>
                        <span className={`text-xs font-semibold w-20 text-right ${pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {fmt$(pnl)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-2">Last 30 closed trades</p>
              </div>
            </div>

            {/* ── Top / Bottom Symbols ─────────────────────────────── */}
            {symbolData.length > 0 && (
              <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
                <SectionHead title="P&L by Symbol" sub="Top 10 symbols by total realized P&L"
                  tooltip="Total realized P&L per ticker across all closed trades, sorted best to worst.\n\nHighlights your best and worst-performing stocks. Watch for concentration risk if one symbol dominates your P&L." />
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={symbolData} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="symbol" tick={{ fontSize: 11, fill: '#9ca3af', fontWeight: 600 }} width={50} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="pnl" name="P&L" radius={[0, 3, 3, 0]}>
                      {symbolData.map((entry, i) => (
                        <Cell key={i} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Strategy Performance Table ───────────────────────── */}
            {analytics?.byStrategy && Object.keys(analytics.byStrategy).length > 0 && (
              <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
                <SectionHead title="Performance by Strategy"
                  tooltip="Aggregated stats grouped by trade type or options strategy.\n\nIdentify which strategies are generating your edge and which are drag. Focus on high profit-factor, high win-rate strategies." />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-zinc-800">
                        {['Strategy', 'Trades', 'Win Rate', 'Total P&L', 'Avg P&L'].map((h) => (
                          <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(analytics.byStrategy)
                        .sort((a, b) => b.totalPnL - a.totalPnL)
                        .map((s) => (
                          <tr key={s.name} className="border-b border-gray-50 dark:border-zinc-800/50 hover:bg-gray-50 dark:hover:bg-zinc-800/30">
                            <td className="py-2.5 px-3 font-semibold text-gray-800 dark:text-zinc-200 capitalize">{s.name}</td>
                            <td className="py-2.5 px-3 text-gray-600 dark:text-zinc-400">{s.totalTrades}</td>
                            <td className={`py-2.5 px-3 font-semibold ${s.winRate >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                              {s.winRate.toFixed(1)}%
                            </td>
                            <td className={`py-2.5 px-3 font-bold ${s.totalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                              {fmt$(s.totalPnL)}
                            </td>
                            <td className={`py-2.5 px-3 font-semibold ${s.totalPnL / s.totalTrades >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                              {fmt$(s.totalPnL / s.totalTrades)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Expectancy formula ───────────────────────────────── */}
            <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-950/20 p-5">
              <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-widest mb-3 flex items-center">
                Mathematical Edge
                <InfoTip text={"Quantitative metrics that define whether your trading system has a statistical edge over time.\n\nExpectancy: expected $ per trade\nProfit Factor: gross wins ÷ gross losses\nKelly %: theoretically optimal position size"} />
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] text-indigo-400 dark:text-indigo-600 uppercase mb-1 flex items-center">
                    Expectancy per trade
                    <InfoTip text={"Expected dollar profit per trade.\n\nFormula: (Win% × Avg Win) + (Loss% × Avg Loss)\n\nPositive = your system makes money on average. Negative = you are losing money even if you win often."} />
                  </p>
                  <p className={`text-2xl font-extrabold ${(winRate / 100 * avgWin + (1 - winRate / 100) * avgLoss) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {fmt$(winRate / 100 * avgWin + (1 - winRate / 100) * avgLoss)}
                  </p>
                  <p className="text-[10px] text-indigo-400 dark:text-indigo-600 mt-1">= (W% × AvgWin) + (L% × AvgLoss)</p>
                </div>
                <div>
                  <p className="text-[10px] text-indigo-400 dark:text-indigo-600 uppercase mb-1 flex items-center">
                    Profit Factor
                    <InfoTip text={"Gross profits ÷ gross losses.\n\n>2.0 = exceptional edge\n>1.5 = strong edge\n>1.0 = profitable (but fragile)\n<1.0 = losing system\n\nAim for 1.5+ for a robust trading edge."} />
                  </p>
                  <p className={`text-2xl font-extrabold ${profitFactor >= 1.5 ? 'text-emerald-600 dark:text-emerald-400' : profitFactor >= 1 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                    {profitFactor.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-indigo-400 dark:text-indigo-600 mt-1">&gt; 1.5 = strong edge</p>
                </div>
                <div>
                  <p className="text-[10px] text-indigo-400 dark:text-indigo-600 uppercase mb-1 flex items-center">
                    Kelly % (sizing)
                    <InfoTip text={"Kelly Criterion — the theoretically optimal position size as a % of capital.\n\nFormula: Win% − (Loss% ÷ R:R)\n\nIn practice use ½ Kelly (half the value) to reduce account volatility. A high Kelly % does NOT mean you should bet that much."} />
                  </p>
                  <p className="text-2xl font-extrabold text-indigo-700 dark:text-indigo-400">
                    {riskReward > 0 ? `${Math.max(0, ((winRate / 100) - (1 - winRate / 100) / riskReward) * 100).toFixed(1)}%` : '—'}
                  </p>
                  <p className="text-[10px] text-indigo-400 dark:text-indigo-600 mt-1">Kelly = W% − (L% / R:R)</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
