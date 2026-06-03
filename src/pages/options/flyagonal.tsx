import React, { useState, useMemo } from 'react';
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

/* ── Page ───────────────────────────────────────────────────────────── */

export default function FlyagonalPage() {
  const [cfg, setCfg] = useState(DEFAULTS);

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
