import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';

/* ── P&L calculations ──────────────────────────────────────────────── */

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Call broken wing butterfly P&L at expiry
// K1 = lower long call, K2 = 2x short calls (center), K3 = upper long call
// K3-K2 > K2-K1 (broken wing — upside wing is wider)
function bwbPnl(S: number, K1: number, K2: number, K3: number, netCredit: number): number {
  const long1 = Math.max(S - K1, 0);
  const shorts = 2 * Math.max(S - K2, 0);
  const long2 = Math.max(S - K3, 0);
  return (long1 - shorts + long2 + netCredit) * 100;
}

// Put diagonal P&L at front-month expiry (simplified)
// Short put K4 (front, DTE_short), Long put K5 (back, DTE_long)
// timeRatio = sqrt(remaining_DTE / initial_DTE_long) — approximates back-month time value
// vegaBoost: factor applied when vol increases (down move scenario)
function diagonalPnl(
  S: number,
  K4: number,
  K5: number,
  shortPrem: number,
  longPrem: number,
  timeRatio = 0.71,
): number {
  const shortPnl = shortPrem - Math.max(K4 - S, 0);
  const longIntrinsic = Math.max(K5 - S, 0);
  const longTimeVal = (longPrem - Math.max(K5 - S, 0)) * timeRatio;
  const longVal = longIntrinsic + Math.max(longTimeVal, 0);
  return (shortPnl + longVal - longPrem) * 100;
}

/* ── Chart tooltip ──────────────────────────────────────────────────── */

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-lg text-xs">
      <p className="font-semibold mb-1 text-slate-700 dark:text-slate-200">S = ${label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-mono font-bold">
            {p.value >= 0 ? '+' : ''}${p.value.toFixed(0)}
          </span>
        </p>
      ))}
    </div>
  );
}

/* ── Setup defaults ─────────────────────────────────────────────────── */

const DEFAULTS = {
  underlying: 560,
  // BWB — placed above market
  bwbK1: 565,  // lower long call
  bwbK2: 570,  // center 2x short calls
  bwbK3: 576,  // upper long call (6pts — wider wing)
  bwbCredit: 0.25, // net credit per share received for BWB
  // Put diagonal — placed below market
  diagK4: 544,  // short put strike (front month, ~3% below)
  diagK5: 544,  // long put strike (back month, same strike)
  diagShortPrem: 1.50,
  diagLongPrem: 2.20,
};

/* ── Stat badge ─────────────────────────────────────────────────────── */

function StatBadge({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-xl p-4 text-center">
      <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{value}</p>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Greek row ──────────────────────────────────────────────────────── */

function GreekRow({ greek, bwb, diag, combined, note }: {
  greek: string; bwb: string; diag: string; combined: string; note: string;
}) {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-700">
      <td className="py-2 pr-4 font-semibold text-slate-700 dark:text-slate-200 font-mono">{greek}</td>
      <td className="py-2 pr-4 text-center">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bwb.startsWith('+') ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}`}>{bwb}</span>
      </td>
      <td className="py-2 pr-4 text-center">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${diag.startsWith('+') ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}`}>{diag}</span>
      </td>
      <td className="py-2 pr-4 text-center">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${combined.startsWith('+') ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>{combined}</span>
      </td>
      <td className="py-2 text-xs text-slate-500 dark:text-slate-400">{note}</td>
    </tr>
  );
}

/* ── Input ──────────────────────────────────────────────────────────── */

function NumInput({ label, value, onChange, step = 1, min, max }: {
  label: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
    </div>
  );
}

/* ── Setup API response type ────────────────────────────────────────── */

interface SetupMeta {
  symbol: string;
  price: number;
  fetchedAt: number;
  bwb: { expiry: string; dte: number; k1: number; k1Mid: number; k2: number; k2Mid: number; k3: number; k3Mid: number; netCredit: number; lowerWing: number; upperWing: number };
  diagonal: { frontExpiry: string; backExpiry: string; frontDte: number; backDte: number; k4: number; shortPrem: number; k5: number; longPrem: number; netDebit: number };
  warnings: string[];
}

/* ── Leg table cell formatters ──────────────────────────────────────── */

function FmtImpact({ val }: { val: number }) {
  if (val === 0) return <span className="text-slate-400">—</span>;
  return val > 0
    ? <span className="text-emerald-500 font-mono">+${val.toFixed(0)}</span>
    : <span className="text-rose-500 font-mono">-${Math.abs(val).toFixed(0)}</span>;
}

function FmtPrem({ val }: { val: number }) {
  if (val === 0) return <span className="text-slate-400">—</span>;
  return <span className="font-mono">${val.toFixed(2)}</span>;
}

/* ── Order legs table ───────────────────────────────────────────────── */

interface LegMids { k1Mid: number; k2Mid: number; k3Mid: number }

function LegsTable({ cfg, meta, legMids, onRefresh, refreshing }: {
  cfg: typeof DEFAULTS;
  meta: SetupMeta | null;
  legMids: LegMids;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const bwbExpiry    = meta?.bwb.expiry;
  const frontExpiry  = meta?.diagonal.frontExpiry;
  const backExpiry   = meta?.diagonal.backExpiry;

  const fmtDate = (d?: string) =>
    d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

  const hasCallMids = legMids.k1Mid > 0 || legMids.k2Mid > 0 || legMids.k3Mid > 0;

  const bwbNet  = cfg.bwbCredit;                              // net credit per share
  const diagNet = cfg.diagShortPrem - cfg.diagLongPrem;       // negative = net debit
  const totalNet = bwbNet + diagNet;

  const dollarImpact = (perShare: number, qty: number, side: 'buy' | 'sell') => {
    const raw = perShare * qty * 100;
    return side === 'sell' ? raw : -raw;
  };

  const thCls = 'py-2 px-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider';
  const tdCls = 'py-2 px-3 text-sm';

  return (
    <div className="mt-5 border-t border-slate-100 dark:border-slate-700 pt-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Order Legs</h3>
        <button
          onClick={onRefresh}
          disabled={refreshing || !meta}
          title={!meta ? 'Load a ticker first to enable refresh' : 'Fetch live premiums for current strikes'}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Fetching…' : 'Refresh Premiums'}
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className={thCls}>#</th>
              <th className={thCls}>Action</th>
              <th className={thCls}>Type</th>
              <th className={thCls}>Strike</th>
              <th className={thCls}>Expiry</th>
              <th className={thCls}>Qty</th>
              <th className={thCls}>Mid/share</th>
              <th className={thCls}>$ Impact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {/* ── BWB header row ── */}
            <tr className="bg-indigo-50/50 dark:bg-indigo-900/10">
              <td colSpan={8} className="py-1.5 px-3 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                Call Broken Wing Butterfly — {fmtDate(bwbExpiry)}
              </td>
            </tr>
            <tr>
              <td className={tdCls + ' text-slate-400'}>1</td>
              <td className={tdCls + ' font-semibold text-emerald-600 dark:text-emerald-400'}>BUY</td>
              <td className={tdCls}>Call</td>
              <td className={tdCls + ' font-mono'}>${cfg.bwbK1}</td>
              <td className={tdCls + ' text-slate-500'}>{fmtDate(bwbExpiry)}</td>
              <td className={tdCls}>1×</td>
              <td className={tdCls}><FmtPrem val={hasCallMids ? legMids.k1Mid : 0} /></td>
              <td className={tdCls}><FmtImpact val={hasCallMids ? dollarImpact(legMids.k1Mid, 1, 'buy') : 0} /></td>
            </tr>
            <tr>
              <td className={tdCls + ' text-slate-400'}>2</td>
              <td className={tdCls + ' font-semibold text-rose-600 dark:text-rose-400'}>SELL</td>
              <td className={tdCls}>Call</td>
              <td className={tdCls + ' font-mono'}>${cfg.bwbK2}</td>
              <td className={tdCls + ' text-slate-500'}>{fmtDate(bwbExpiry)}</td>
              <td className={tdCls}>2×</td>
              <td className={tdCls}><FmtPrem val={hasCallMids ? legMids.k2Mid : 0} /></td>
              <td className={tdCls}><FmtImpact val={hasCallMids ? dollarImpact(legMids.k2Mid, 2, 'sell') : 0} /></td>
            </tr>
            <tr>
              <td className={tdCls + ' text-slate-400'}>3</td>
              <td className={tdCls + ' font-semibold text-emerald-600 dark:text-emerald-400'}>BUY</td>
              <td className={tdCls}>Call</td>
              <td className={tdCls + ' font-mono'}>${cfg.bwbK3}</td>
              <td className={tdCls + ' text-slate-500'}>{fmtDate(bwbExpiry)}</td>
              <td className={tdCls}>1×</td>
              <td className={tdCls}><FmtPrem val={hasCallMids ? legMids.k3Mid : 0} /></td>
              <td className={tdCls}><FmtImpact val={hasCallMids ? dollarImpact(legMids.k3Mid, 1, 'buy') : 0} /></td>
            </tr>
            <tr className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
              <td colSpan={7} className="py-2 px-3 text-xs text-slate-500 dark:text-slate-400 text-right">BWB Net (credit = collected)</td>
              <td className="py-2 px-3">
                <FmtImpact val={bwbNet * 100} />
                <span className="ml-1 text-xs text-slate-400">{bwbNet >= 0 ? 'credit' : 'debit'}</span>
              </td>
            </tr>

            {/* ── Diagonal header row ── */}
            <tr className="bg-emerald-50/50 dark:bg-emerald-900/10">
              <td colSpan={8} className="py-1.5 px-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Put Diagonal — {fmtDate(frontExpiry)} front / {fmtDate(backExpiry)} back
              </td>
            </tr>
            <tr>
              <td className={tdCls + ' text-slate-400'}>4</td>
              <td className={tdCls + ' font-semibold text-rose-600 dark:text-rose-400'}>SELL</td>
              <td className={tdCls}>Put</td>
              <td className={tdCls + ' font-mono'}>${cfg.diagK4}</td>
              <td className={tdCls + ' text-slate-500'}>{fmtDate(frontExpiry)}</td>
              <td className={tdCls}>1×</td>
              <td className={tdCls}><FmtPrem val={cfg.diagShortPrem} /></td>
              <td className={tdCls}><FmtImpact val={dollarImpact(cfg.diagShortPrem, 1, 'sell')} /></td>
            </tr>
            <tr>
              <td className={tdCls + ' text-slate-400'}>5</td>
              <td className={tdCls + ' font-semibold text-emerald-600 dark:text-emerald-400'}>BUY</td>
              <td className={tdCls}>Put</td>
              <td className={tdCls + ' font-mono'}>${cfg.diagK5}</td>
              <td className={tdCls + ' text-slate-500'}>{fmtDate(backExpiry)}</td>
              <td className={tdCls}>1×</td>
              <td className={tdCls}><FmtPrem val={cfg.diagLongPrem} /></td>
              <td className={tdCls}><FmtImpact val={dollarImpact(cfg.diagLongPrem, 1, 'buy')} /></td>
            </tr>
            <tr className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
              <td colSpan={7} className="py-2 px-3 text-xs text-slate-500 dark:text-slate-400 text-right">Diagonal Net (usually a debit)</td>
              <td className="py-2 px-3">
                <FmtImpact val={diagNet * 100} />
                <span className="ml-1 text-xs text-slate-400">{diagNet >= 0 ? 'credit' : 'debit'}</span>
              </td>
            </tr>

            {/* ── Total net ── */}
            <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800">
              <td colSpan={7} className="py-3 px-3 font-bold text-slate-700 dark:text-slate-200 text-right">
                TOTAL NET (per 1-spread)
              </td>
              <td className="py-3 px-3">
                <span className={`text-base font-bold ${totalNet >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {totalNet >= 0 ? `+$${(totalNet * 100).toFixed(0)}` : `-$${(Math.abs(totalNet) * 100).toFixed(0)}`}
                </span>
                <span className={`ml-1 text-xs font-semibold ${totalNet >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {totalNet >= 0 ? 'CREDIT' : 'DEBIT'}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {!hasCallMids && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          Individual call premiums shown after loading a ticker. BWB $ impact is derived from the Net Credit field.
        </p>
      )}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default function FlyagonalPage() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [ticker, setTicker] = useState('SPY');
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupMeta, setSetupMeta] = useState<SetupMeta | null>(null);
  const [legMids, setLegMids] = useState<LegMids>({ k1Mid: 0, k2Mid: 0, k3Mid: 0 });
  const [refreshingPremiums, setRefreshingPremiums] = useState(false);
  const tickerRef = useRef<HTMLInputElement>(null);

  // Core fetch — takes the symbol as a param so it can be called on mount too
  const loadSetupForSymbol = useCallback(async (sym: string) => {
    if (!sym) return;
    setLoadingSetup(true);
    setSetupError(null);
    setSetupMeta(null);
    try {
      const res = await fetch(`/api/options/flyagonal-setup?symbol=${encodeURIComponent(sym)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load setup');
      const meta = data as SetupMeta;
      setSetupMeta(meta);
      setLegMids({ k1Mid: meta.bwb.k1Mid, k2Mid: meta.bwb.k2Mid, k3Mid: meta.bwb.k3Mid });
      setCfg({
        underlying:    meta.price,
        bwbK1:         meta.bwb.k1,
        bwbK2:         meta.bwb.k2,
        bwbK3:         meta.bwb.k3,
        bwbCredit:     meta.bwb.netCredit,
        diagK4:        meta.diagonal.k4,
        diagK5:        meta.diagonal.k5,
        diagShortPrem: meta.diagonal.shortPrem,
        diagLongPrem:  meta.diagonal.longPrem,
      });
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoadingSetup(false);
    }
  }, []);

  // Auto-load SPY on first render
  useEffect(() => { loadSetupForSymbol('SPY'); }, [loadSetupForSymbol]);

  const loadSetup = useCallback(() => loadSetupForSymbol(ticker), [ticker, loadSetupForSymbol]);

  // Refresh premiums for the CURRENT strikes without resetting them
  const refreshPremiums = useCallback(async () => {
    if (!setupMeta) { loadSetupForSymbol(ticker); return; }
    setRefreshingPremiums(true);
    try {
      const params = new URLSearchParams({
        symbol: setupMeta.symbol,
        frontExpiry: setupMeta.diagonal.frontExpiry,
        backExpiry:  setupMeta.diagonal.backExpiry,
        k1: cfg.bwbK1.toString(),
        k2: cfg.bwbK2.toString(),
        k3: cfg.bwbK3.toString(),
        k4: cfg.diagK4.toString(),
        k5: cfg.diagK5.toString(),
      });
      const res  = await fetch(`/api/options/flyagonal-premiums?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Refresh failed');
      setLegMids({ k1Mid: data.k1Mid, k2Mid: data.k2Mid, k3Mid: data.k3Mid });
      setCfg((prev) => ({
        ...prev,
        bwbCredit:     data.netCredit,
        diagShortPrem: data.shortPrem,
        diagLongPrem:  data.longPrem,
      }));
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : 'Premium refresh failed');
    } finally {
      setRefreshingPremiums(false);
    }
  }, [setupMeta, ticker, cfg.bwbK1, cfg.bwbK2, cfg.bwbK3, cfg.diagK4, cfg.diagK5, loadSetupForSymbol]);

  const set = (key: keyof typeof DEFAULTS) => (v: number) =>
    setCfg((prev) => ({ ...prev, [key]: v }));

  // Build chart data
  const chartData = useMemo(() => {
    const lo = cfg.underlying * 0.86;
    const hi = cfg.underlying * 1.12;
    const steps = 100;
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const S = lo + (hi - lo) * (i / steps);
      const bwb = bwbPnl(S, cfg.bwbK1, cfg.bwbK2, cfg.bwbK3, cfg.bwbCredit);
      const diag = diagonalPnl(S, cfg.diagK4, cfg.diagK5, cfg.diagShortPrem, cfg.diagLongPrem);
      out.push({
        price: Math.round(S),
        BWB: Math.round(bwb),
        Diagonal: Math.round(diag),
        Combined: Math.round(bwb + diag),
      });
    }
    return out;
  }, [cfg]);

  // Key metrics
  const maxCombined = useMemo(() => Math.max(...chartData.map((d) => d.Combined)), [chartData]);
  const minCombined = useMemo(() => Math.min(...chartData.map((d) => d.Combined)), [chartData]);
  const netDebit = ((cfg.diagLongPrem - cfg.diagShortPrem) - cfg.bwbCredit).toFixed(2);
  const tenPctTarget = ((cfg.diagLongPrem - cfg.diagShortPrem - cfg.bwbCredit) * 100 * 0.1).toFixed(0);

  return (
    <Layout title="Flyagonal">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                Options Strategy
              </span>
              <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                Defined Risk
              </span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Flyagonal</h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400 max-w-xl">
              A hybrid strategy combining a <strong className="text-slate-700 dark:text-slate-200">call broken wing butterfly</strong> above the market
              and a <strong className="text-slate-700 dark:text-slate-200">put diagonal</strong> below — designed to profit whether the market grinds up, drifts down, or stays flat.
            </p>
          </div>
        </div>

        {/* ── Performance reference stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBadge value="~97%" label="Reported Win Rate" sub="60 live trades" />
          <StatBadge value="4–5 days" label="Avg Hold Time" sub="Entered 8–10 DTE" />
          <StatBadge value="10%" label="Profit Target" sub="% of max loss at open" />
          <StatBadge value="3/10" label="Risk Rating" sub="Defined risk on both sides" />
        </div>

        {/* ── Two components ── */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* BWB card */}
          <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              <h2 className="font-bold text-slate-800 dark:text-white">Call Broken Wing Butterfly</h2>
              <span className="ml-auto text-xs text-indigo-600 dark:text-indigo-300 font-medium">ABOVE market</span>
            </div>
            <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <div className="flex gap-2">
                <span className="w-24 font-medium text-slate-500 dark:text-slate-400 shrink-0">Structure</span>
                <span>Long call (K1) + 2x Short calls (K2) + Long call (K3)</span>
              </div>
              <div className="flex gap-2">
                <span className="w-24 font-medium text-slate-500 dark:text-slate-400 shrink-0">Wing shape</span>
                <span>Wider upper wing (K3−K2 &gt; K2−K1). Reduces upside risk.</span>
              </div>
              <div className="flex gap-2">
                <span className="w-24 font-medium text-slate-500 dark:text-slate-400 shrink-0">Greeks</span>
                <span><strong>Negative Vega</strong> — profits when IV drops (up moves)</span>
              </div>
              <div className="flex gap-2">
                <span className="w-24 font-medium text-slate-500 dark:text-slate-400 shrink-0">Profit from</span>
                <span>Theta decay in 2 short calls + market grinding into tent</span>
              </div>
              <div className="flex gap-2">
                <span className="w-24 font-medium text-slate-500 dark:text-slate-400 shrink-0">Placement</span>
                <span>Lower strike (K1) just above current market price</span>
              </div>
            </div>
          </div>

          {/* Diagonal card */}
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <h2 className="font-bold text-slate-800 dark:text-white">Put Diagonal (Time Spread)</h2>
              <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-300 font-medium">BELOW market</span>
            </div>
            <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <div className="flex gap-2">
                <span className="w-24 font-medium text-slate-500 dark:text-slate-400 shrink-0">Structure</span>
                <span>Short put (front month) + Long put (back month, ~2× DTE)</span>
              </div>
              <div className="flex gap-2">
                <span className="w-24 font-medium text-slate-500 dark:text-slate-400 shrink-0">Time spread</span>
                <span>Short DTE captures fast decay; long DTE decays slower</span>
              </div>
              <div className="flex gap-2">
                <span className="w-24 font-medium text-slate-500 dark:text-slate-400 shrink-0">Greeks</span>
                <span><strong>Positive Vega</strong> — tent expands when IV spikes (down moves)</span>
              </div>
              <div className="flex gap-2">
                <span className="w-24 font-medium text-slate-500 dark:text-slate-400 shrink-0">Profit from</span>
                <span>IV spikes + differential theta (short decays faster)</span>
              </div>
              <div className="flex gap-2">
                <span className="w-24 font-medium text-slate-500 dark:text-slate-400 shrink-0">Placement</span>
                <span>Short put strike ~3% below current market price</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── P&L Visualizer ── */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <h2 className="font-bold text-slate-800 dark:text-white mb-1">P&L Visualizer — At Front Expiry</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Approximation at front-month expiry. Diagonal long put modeled with ~71% of original time value remaining (back month still has ~8 DTE). Values per 1-spread position.
          </p>

          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-sm">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Max Combined Profit</p>
              <p className="font-bold text-emerald-600 dark:text-emerald-400 text-lg">${maxCombined.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Max Risk (downside)</p>
              <p className="font-bold text-rose-600 dark:text-rose-400 text-lg">${Math.abs(minCombined).toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Net Debit at Entry</p>
              <p className="font-bold text-slate-700 dark:text-slate-200 text-lg">${netDebit}/share</p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">10% Profit Target</p>
              <p className="font-bold text-indigo-600 dark:text-indigo-400 text-lg">+${tenPctTarget}</p>
            </div>
          </div>

          <div className="h-64 mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                <XAxis
                  dataKey="price"
                  tickCount={7}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v: number) => `$${v}`}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v: number) => `$${v}`}
                  width={55}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                <ReferenceLine x={cfg.underlying} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Current', position: 'top', fontSize: 10, fill: '#f59e0b' }} />
                <Line type="monotone" dataKey="BWB" stroke="#6366f1" strokeWidth={1.5} dot={false} name="BWB" />
                <Line type="monotone" dataKey="Diagonal" stroke="#10b981" strokeWidth={1.5} dot={false} name="Diagonal" />
                <Line type="monotone" dataKey="Combined" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="Combined" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Setup inputs */}
          <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Customize Setup</h3>

            {/* ── Ticker auto-fill ── */}
            <div className="mb-4 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 p-4">
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Auto-fill from live options chain</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Enter a ticker to fetch the current price and pull real bid/ask premiums. Strikes are placed per the strategy&apos;s rules — K1 just above market, diagonal ~3% below. Most accurate during market hours.
              </p>
              <div className="flex gap-2">
                <input
                  ref={tickerRef}
                  type="text"
                  placeholder="SPY, QQQ, NVDA, SPX…"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && loadSetup()}
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  maxLength={10}
                />
                <button
                  onClick={loadSetup}
                  disabled={loadingSetup || !ticker.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  {loadingSetup ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Loading…
                    </span>
                  ) : 'Load Setup'}
                </button>
              </div>

              {setupError && (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{setupError}</p>
              )}

              {setupMeta && (
                <div className="mt-3 space-y-1.5">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                    <span>
                      <span className="font-medium">{setupMeta.symbol}</span> @ ${setupMeta.price.toFixed(2)}
                      {' '}· fetched {new Date(setupMeta.fetchedAt).toLocaleTimeString()}
                    </span>
                    <span>
                      BWB expiry <span className="font-medium">{setupMeta.bwb.expiry}</span> ({setupMeta.bwb.dte} DTE)
                      · wings {setupMeta.bwb.lowerWing}/{setupMeta.bwb.upperWing} pts
                    </span>
                    <span>
                      Diagonal front <span className="font-medium">{setupMeta.diagonal.frontExpiry}</span> ({setupMeta.diagonal.frontDte} DTE)
                      → back <span className="font-medium">{setupMeta.diagonal.backExpiry}</span> ({setupMeta.diagonal.backDte} DTE)
                    </span>
                  </div>
                  {setupMeta.warnings.length > 0 && (
                    <div className="space-y-1">
                      {setupMeta.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-600 dark:text-amber-400">⚠ {w}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-3">
              <NumInput label="Underlying price" value={cfg.underlying} onChange={set('underlying')} step={1} min={1} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">Call BWB</p>
                <div className="grid grid-cols-2 gap-2">
                  <NumInput label="K1 (lower long call)" value={cfg.bwbK1} onChange={set('bwbK1')} />
                  <NumInput label="K2 (short calls ×2)" value={cfg.bwbK2} onChange={set('bwbK2')} />
                  <NumInput label="K3 (upper long call)" value={cfg.bwbK3} onChange={set('bwbK3')} />
                  <NumInput label="Net credit ($/share)" value={cfg.bwbCredit} onChange={set('bwbCredit')} step={0.05} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">Put Diagonal</p>
                <div className="grid grid-cols-2 gap-2">
                  <NumInput label="K4 (short put, front)" value={cfg.diagK4} onChange={set('diagK4')} />
                  <NumInput label="K5 (long put, back)" value={cfg.diagK5} onChange={set('diagK5')} />
                  <NumInput label="Short prem ($/share)" value={cfg.diagShortPrem} onChange={set('diagShortPrem')} step={0.05} />
                  <NumInput label="Long prem ($/share)" value={cfg.diagLongPrem} onChange={set('diagLongPrem')} step={0.05} />
                </div>
              </div>
            </div>

            <LegsTable cfg={cfg} meta={setupMeta} legMids={legMids} onRefresh={refreshPremiums} refreshing={refreshingPremiums} />
          </div>
        </div>

        {/* ── Greeks profile ── */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <h2 className="font-bold text-slate-800 dark:text-white mb-3">Greeks Profile</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 dark:border-slate-600">
                  <th className="text-left py-2 pr-4 font-semibold text-slate-600 dark:text-slate-300">Greek</th>
                  <th className="text-center py-2 pr-4 font-semibold text-indigo-600 dark:text-indigo-400">BWB</th>
                  <th className="text-center py-2 pr-4 font-semibold text-emerald-600 dark:text-emerald-400">Diagonal</th>
                  <th className="text-center py-2 pr-4 font-semibold text-amber-600 dark:text-amber-400">Combined</th>
                  <th className="text-left py-2 font-semibold text-slate-600 dark:text-slate-300">What it means</th>
                </tr>
              </thead>
              <tbody>
                <GreekRow greek="Theta (θ)" bwb="+Positive" diag="+Positive" combined="+Strong" note="Time decay works for you on all legs. ~$300+/day near expiry." />
                <GreekRow greek="Vega (υ)" bwb="-Negative" diag="+Positive" combined="~Neutral" note="Components offset — strategy is somewhat vol-neutral. Down move expands diagonal tent." />
                <GreekRow greek="Delta (Δ)" bwb="~Neutral" diag="-Slight" combined="~Neutral" note="Near delta-neutral. Roll short strikes to stay balanced." />
                <GreekRow greek="Gamma (γ)" bwb="-Negative" diag="+Positive" combined="~Low" note="Low gamma risk since you exit 3–4 DTE before it spikes." />
              </tbody>
            </table>
          </div>
          <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
            <strong>Key insight:</strong> BWB has negative Vega (benefits from vol drops = up moves). Diagonal has positive Vega (benefits from vol spikes = down moves). Combined Vega is near-neutral, giving the strategy its self-adjusting character — it profits from the direction of the move, not just from vol staying put.
          </div>
        </div>

        {/* ── Setup rules ── */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
            <h2 className="font-bold text-slate-800 dark:text-white mb-3">Setup Rules</h2>
            <div className="space-y-3 text-sm">
              {[
                { label: 'Entry timing', text: '8–10 DTE for short strikes. Long diagonal put ~2× that (16–20 DTE).' },
                { label: 'BWB placement', text: 'K1 (lower long call) at or just above current market. Place the tent above the market.' },
                { label: 'Wing ratio', text: 'Upper wing (K3−K2) wider than lower wing (K2−K1). Reduces upside risk, usually entered for a small credit.' },
                { label: 'Diagonal placement', text: 'Short put strike ~3% below current market. Adjust to match ATR if vol is elevated.' },
                { label: 'Capital per trade', text: '~$500 in SPY, ~$5,000 in SPX. Defined risk on both sides.' },
                { label: 'Underlyings', text: 'SPX/ES preferred. Also SPY, QQQ, RUT/IWM, NVDA, TSLA, GOOGL, NFLX.' },
              ].map(({ label, text }) => (
                <div key={label} className="flex gap-3">
                  <span className="w-36 shrink-0 font-medium text-slate-500 dark:text-slate-400">{label}</span>
                  <span className="text-slate-700 dark:text-slate-300">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
            <h2 className="font-bold text-slate-800 dark:text-white mb-3">Trade Management</h2>
            <div className="space-y-3 text-sm">
              {[
                { label: 'Profit target', text: '10% of max risk at open. Exit whole trade or phase out legs.' },
                { label: 'Hold time', text: 'Usually 3–5 days. Always out at least 3–4 DTE to avoid gamma risk.' },
                { label: 'Phased exit', text: 'Can close BWB first then carry diagonal (or vice versa) once at 10% target.' },
                { label: 'Adjustments', text: '<50% of trades need adjustment. Roll one short strike to remain delta-neutral.' },
                { label: 'Big up move', text: 'Roll short calls higher (buy back 1–2 shorts, sell at higher strike). Reduce delta first.' },
                { label: 'Big down move', text: 'Roll short put higher (closer to market). Diagonal self-adjusts somewhat via positive Vega.' },
                { label: 'Achilles heel', text: '100+ pt up move followed by continued grind up. Upper tent gets chased. Use wider upper wing to mitigate.' },
              ].map(({ label, text }) => (
                <div key={label} className="flex gap-3">
                  <span className="w-36 shrink-0 font-medium text-slate-500 dark:text-slate-400">{label}</span>
                  <span className="text-slate-700 dark:text-slate-300">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── How components complement ── */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <h2 className="font-bold text-slate-800 dark:text-white mb-3">Why the Two Components Pair Together</h2>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 p-4">
              <p className="font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Market goes UP</p>
              <p className="text-slate-700 dark:text-slate-300">IV drops → BWB profits. Diagonal short put expires worthless. Combined: BWB carries the trade.</p>
            </div>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 p-4">
              <p className="font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Market goes DOWN</p>
              <p className="text-slate-700 dark:text-slate-300">IV spikes → Diagonal tent expands via positive Vega. Long put gains intrinsic. Combined: Diagonal self-adjusts downside.</p>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 p-4">
              <p className="font-semibold text-amber-700 dark:text-amber-300 mb-1">Market stays FLAT</p>
              <p className="text-slate-700 dark:text-slate-300">Both components collect theta. Overlap zone in the middle earns from decay on all short legs.</p>
            </div>
          </div>
        </div>

        {/* ── Suitability ── */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-5 text-sm text-slate-600 dark:text-slate-400">
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Who is this for?</p>
          <p>
            Best suited for traders with prior experience in butterflies <em>and</em> calendars/diagonals.
            Not recommended for beginners who haven&apos;t traded a condor or butterfly yet.
            Ideal as an income strategy trading small consistent size — targeting monthly income rather than big individual wins.
          </p>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Strategy concept developed by Steve G (sjgtrades.com). P&L diagram is an approximation for educational purposes only. Not financial advice.
          </p>
        </div>

      </div>
    </Layout>
  );
}
