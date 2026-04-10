import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Area,
  ComposedChart,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { Layout } from '@/components/Layout';
import { calculateCallGreeks, calculatePutGreeks } from '@/lib/greeks';
import type { BlackScholesInputs } from '@/lib/greeks';

/* ── Types ────────────────────────────────────────────────────────── */
type StrategyId =
  | 'long-call' | 'long-put' | 'covered-call' | 'csp'
  | 'bull-call' | 'bear-put' | 'bull-put' | 'bear-call'
  | 'straddle' | 'strangle' | 'iron-condor' | 'butterfly';

const STRATEGY_IDS: Set<string> = new Set([
  'long-call', 'long-put', 'covered-call', 'csp',
  'bull-call', 'bear-put', 'bull-put', 'bear-call',
  'straddle', 'strangle', 'iron-condor', 'butterfly',
]);

interface StrikeDef { key: 'k1' | 'k2' | 'k3' | 'k4'; label: string; hint: string }

interface StrategyDef {
  name: string;
  description: string;
  category: 'bullish' | 'bearish' | 'neutral-credit' | 'neutral-debit' | 'volatility';
  strikes: StrikeDef[];
  when: string;
  maxProfitNote: string;
  maxLossNote: string;
}

interface Leg {
  label: string;
  type: 'call' | 'put';
  direction: 'long' | 'short';
  strike: number;
  qty: number;
  premium: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

interface PnLPoint { price: number; expiry: number; today: number }

interface CalcResult {
  legs: Leg[];
  netCost: number;
  maxProfit: number | null;
  maxLoss: number | null;
  breakevenPrices: number[];
  pnlChart: PnLPoint[];
}

interface HVData { hv10: number; hv20: number; hv30: number; hv60: number; currentPrice: number }

/* ── Strategy definitions ─────────────────────────────────────────── */
const STRATEGIES: Record<StrategyId, StrategyDef> = {
  'long-call': {
    name: 'Long Call', category: 'bullish',
    description: 'Buy a call option. Profit if underlying rises above breakeven.',
    strikes: [{ key: 'k1', label: 'Strike', hint: 'OTM call strike (e.g. 5% above spot)' }],
    when: 'Bullish conviction with defined risk. Good before catalysts.',
    maxProfitNote: 'Unlimited (upside)', maxLossNote: 'Premium paid',
  },
  'long-put': {
    name: 'Long Put', category: 'bearish',
    description: 'Buy a put option. Profit if underlying falls below breakeven.',
    strikes: [{ key: 'k1', label: 'Strike', hint: 'OTM put strike (e.g. 5% below spot)' }],
    when: 'Bearish outlook or portfolio hedge.',
    maxProfitNote: 'Strike × 100 (stock → $0)', maxLossNote: 'Premium paid',
  },
  'covered-call': {
    name: 'Covered Call', category: 'neutral-credit',
    description: 'Own 100 shares and sell a call. Collect premium; cap upside at strike.',
    strikes: [{ key: 'k1', label: 'Call Strike', hint: 'OTM call to sell (5–10% above spot)' }],
    when: 'Own shares, want income, willing to sell at strike.',
    maxProfitNote: 'Premium + (strike − cost basis)', maxLossNote: 'Stock can fall to $0',
  },
  'csp': {
    name: 'Cash Secured Put', category: 'bullish',
    description: 'Sell an OTM put. Collect premium; obligated to buy shares if stock falls to strike.',
    strikes: [{ key: 'k1', label: 'Put Strike', hint: 'OTM put to sell (5–10% below spot)' }],
    when: 'Willing to own shares at strike price. "Wheel" strategy step 1.',
    maxProfitNote: 'Premium received', maxLossNote: 'Strike − premium (stock → $0)',
  },
  'bull-call': {
    name: 'Bull Call Spread', category: 'bullish',
    description: 'Buy lower call, sell higher call. Cheaper than long call; profit capped at upper strike.',
    strikes: [
      { key: 'k1', label: 'Long Strike (Lower)', hint: 'Buy this call — ATM or slight OTM' },
      { key: 'k2', label: 'Short Strike (Upper)', hint: 'Sell this call — farther OTM' },
    ],
    when: 'Moderately bullish; want lower cost vs long call.',
    maxProfitNote: '(K2 − K1 − debit) × 100', maxLossNote: 'Net debit × 100',
  },
  'bear-put': {
    name: 'Bear Put Spread', category: 'bearish',
    description: 'Buy higher put, sell lower put. Cheaper than long put; profit capped.',
    strikes: [
      { key: 'k1', label: 'Short Strike (Lower)', hint: 'Sell this put — farther OTM' },
      { key: 'k2', label: 'Long Strike (Upper)', hint: 'Buy this put — ATM or slight OTM' },
    ],
    when: 'Moderately bearish; want lower cost vs long put.',
    maxProfitNote: '(K2 − K1 − debit) × 100', maxLossNote: 'Net debit × 100',
  },
  'bull-put': {
    name: 'Bull Put Spread', category: 'neutral-credit',
    description: 'Sell higher put, buy lower put. Receive credit; profit if stock stays above short strike.',
    strikes: [
      { key: 'k1', label: 'Long Strike (Lower Wing)', hint: 'Buy put — your downside protection' },
      { key: 'k2', label: 'Short Strike (Upper)', hint: 'Sell this put — OTM' },
    ],
    when: 'Bullish to neutral; high-probability credit trade.',
    maxProfitNote: 'Net credit × 100', maxLossNote: '(K2 − K1 − credit) × 100',
  },
  'bear-call': {
    name: 'Bear Call Spread', category: 'neutral-credit',
    description: 'Sell lower call, buy higher call. Receive credit; profit if stock stays below short strike.',
    strikes: [
      { key: 'k1', label: 'Short Strike (Lower)', hint: 'Sell this call — OTM' },
      { key: 'k2', label: 'Long Strike (Upper Wing)', hint: 'Buy call — your upside protection' },
    ],
    when: 'Bearish to neutral; high-probability credit trade.',
    maxProfitNote: 'Net credit × 100', maxLossNote: '(K2 − K1 − credit) × 100',
  },
  'straddle': {
    name: 'Long Straddle', category: 'volatility',
    description: 'Buy a call and a put at the same strike. Profit from a large move in either direction.',
    strikes: [{ key: 'k1', label: 'Strike (ATM)', hint: 'Use the at-the-money strike' }],
    when: 'Expecting a big move but unsure of direction (earnings, FOMC, catalyst).',
    maxProfitNote: 'Unlimited upside; (strike − premium) downside', maxLossNote: 'Total premium paid',
  },
  'strangle': {
    name: 'Long Strangle', category: 'volatility',
    description: 'Buy OTM call + OTM put. Cheaper than straddle; needs a bigger move to profit.',
    strikes: [
      { key: 'k1', label: 'Put Strike (Lower OTM)', hint: 'Buy OTM put (e.g. 5% below)' },
      { key: 'k2', label: 'Call Strike (Upper OTM)', hint: 'Buy OTM call (e.g. 5% above)' },
    ],
    when: 'Expecting very large move; lower cost with wider breakevens than straddle.',
    maxProfitNote: 'Unlimited upside', maxLossNote: 'Total premiums paid',
  },
  'iron-condor': {
    name: 'Iron Condor', category: 'neutral-credit',
    description: 'Sell OTM put spread + sell OTM call spread. Net credit; profit if stock stays range-bound.',
    strikes: [
      { key: 'k1', label: 'Put Wing — Buy (Lowest)', hint: 'Buy put — far OTM, downside protection' },
      { key: 'k2', label: 'Put Short', hint: 'Sell put — OTM, lower side' },
      { key: 'k3', label: 'Call Short', hint: 'Sell call — OTM, upper side' },
      { key: 'k4', label: 'Call Wing — Buy (Highest)', hint: 'Buy call — far OTM, upside protection' },
    ],
    when: 'Low IV environment; expect stock to stay in a range.',
    maxProfitNote: 'Net credit × 100', maxLossNote: '(Spread width − credit) × 100',
  },
  'butterfly': {
    name: 'Long Butterfly', category: 'neutral-debit',
    description: 'Buy 1 lower call, sell 2 ATM calls, buy 1 upper call. Max profit at center strike.',
    strikes: [
      { key: 'k1', label: 'Lower Strike (Buy 1)', hint: 'Below ATM' },
      { key: 'k2', label: 'Center Strike (Sell 2×)', hint: 'ATM — pin target' },
      { key: 'k3', label: 'Upper Strike (Buy 1)', hint: 'Above ATM (equidistant from center)' },
    ],
    when: 'Expect stock to pin near center strike at expiry.',
    maxProfitNote: '(K2 − K1 − debit) × 100', maxLossNote: 'Net debit × 100',
  },
};

const UNLIMITED_PROFIT: Set<StrategyId> = new Set(['long-call', 'straddle', 'strangle']);

const CATEGORY_COLOR: Record<string, string> = {
  bullish:          'bg-green-100 text-green-800 border-green-200',
  bearish:          'bg-red-100 text-red-800 border-red-200',
  'neutral-credit': 'bg-blue-100 text-blue-800 border-blue-200',
  'neutral-debit':  'bg-purple-100 text-purple-800 border-purple-200',
  volatility:       'bg-amber-100 text-amber-800 border-amber-200',
};

/* ── Black-Scholes helpers ───────────────────────────────────────── */
function bsLeg(type: 'call' | 'put', spot: number, strike: number, dte: number, iv: number, rate: number) {
  const inp: BlackScholesInputs = {
    spotPrice: spot,
    strikePrice: strike,
    timeToExpiration: Math.max(dte, 1) / 365,
    volatility: iv / 100,
    riskFreeRate: rate / 100,
  };
  return type === 'call' ? calculateCallGreeks(inp) : calculatePutGreeks(inp);
}

/* ── Compute legs ───────────────────────────────────────────────── */
function computeLegs(
  stratId: StrategyId,
  spot: number,
  ks: { k1: number; k2: number; k3: number; k4: number },
  dte: number, iv: number, rate: number,
): Leg[] {
  const { k1, k2, k3, k4 } = ks;
  const mk = (
    label: string, type: 'call' | 'put', dir: 'long' | 'short',
    k: number, qty: number,
  ): Leg => {
    const g = bsLeg(type, spot, k, dte, iv, rate);
    return {
      label, type, direction: dir, strike: k, qty,
      premium: g.premium ?? 0,
      delta:   g.delta   ?? 0,
      gamma:   g.gamma   ?? 0,
      theta:   g.theta   ?? 0,
      vega:    g.vega    ?? 0,
    };
  };
  switch (stratId) {
    case 'long-call':    return [mk(`Call ${k1}`,          'call', 'long',  k1, 1)];
    case 'long-put':     return [mk(`Put ${k1}`,           'put',  'long',  k1, 1)];
    case 'covered-call': return [mk(`Short Call ${k1}`,    'call', 'short', k1, 1)];
    case 'csp':          return [mk(`Short Put ${k1}`,     'put',  'short', k1, 1)];
    case 'bull-call':    return [mk(`Long Call ${k1}`, 'call','long', k1,1), mk(`Short Call ${k2}`, 'call','short',k2,1)];
    case 'bear-put':     return [mk(`Short Put ${k1}`, 'put','short',k1,1), mk(`Long Put ${k2}`,  'put', 'long', k2,1)];
    case 'bull-put':     return [mk(`Long Put ${k1}`,  'put','long', k1,1), mk(`Short Put ${k2}`, 'put', 'short',k2,1)];
    case 'bear-call':    return [mk(`Short Call ${k1}`,'call','short',k1,1), mk(`Long Call ${k2}`, 'call','long', k2,1)];
    case 'straddle':     return [mk(`Long Call ${k1}`, 'call','long', k1,1), mk(`Long Put ${k1}`,  'put', 'long', k1,1)];
    case 'strangle':     return [mk(`Long Put ${k1}`,  'put','long', k1,1), mk(`Long Call ${k2}`,  'call','long', k2,1)];
    case 'iron-condor':  return [
      mk(`Long Put ${k1}`,   'put', 'long',  k1, 1),
      mk(`Short Put ${k2}`,  'put', 'short', k2, 1),
      mk(`Short Call ${k3}`, 'call','short', k3, 1),
      mk(`Long Call ${k4}`,  'call','long',  k4, 1),
    ];
    case 'butterfly':    return [
      mk(`Long Call ${k1}`,     'call','long',  k1, 1),
      mk(`Short Call ×2 ${k2}`, 'call','short', k2, 2),
      mk(`Long Call ${k3}`,     'call','long',  k3, 1),
    ];
    default: return [];
  }
}

/* ── P&L chart ──────────────────────────────────────────────────── */
function buildPnLChart(legs: Leg[], spot: number, dte: number, iv: number, rate: number, contractQty: number): PnLPoint[] {
  const lo = spot * 0.65;
  const hi = spot * 1.40;
  const steps = 160;
  const out: PnLPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = lo + (hi - lo) * (i / steps);
    let expiry = 0, today = 0;
    for (const leg of legs) {
      const sign = leg.direction === 'long' ? 1 : -1;
      const intr = leg.type === 'call' ? Math.max(0, s - leg.strike) : Math.max(0, leg.strike - s);
      expiry += sign * (intr - leg.premium) * leg.qty * 100;
      const g = bsLeg(leg.type, s, leg.strike, dte, iv, rate);
      today += sign * ((g.premium ?? 0) - leg.premium) * leg.qty * 100;
    }
    out.push({
      price: parseFloat(s.toFixed(2)),
      expiry: parseFloat((expiry * contractQty).toFixed(2)),
      today: parseFloat((today * contractQty).toFixed(2)),
    });
  }
  return out;
}

/* ── Build full result ──────────────────────────────────────────── */
function buildCalcResult(
  stratId: StrategyId, spot: number,
  ks: { k1: number; k2: number; k3: number; k4: number },
  dte: number, iv: number, rate: number, contractQty: number,
): CalcResult {
  const legs = computeLegs(stratId, spot, ks, dte, iv, rate);
  const pnlChart = buildPnLChart(legs, spot, dte, iv, rate, contractQty);
  const expiryVals = pnlChart.map((p) => p.expiry);
  const maxProfit = UNLIMITED_PROFIT.has(stratId) ? null : Math.max(...expiryVals);
  const maxLoss = Math.min(...expiryVals);
  const netCost = legs.reduce((sum, l) => sum + (l.direction === 'long' ? 1 : -1) * l.premium * l.qty, 0) * 100 * contractQty;
  const breakevenPrices: number[] = [];
  for (let i = 1; i < pnlChart.length; i++) {
    const p0 = pnlChart[i - 1], p1 = pnlChart[i];
    if ((p0.expiry < 0 && p1.expiry >= 0) || (p0.expiry >= 0 && p1.expiry < 0)) {
      const be = p0.price + (-p0.expiry) * (p1.price - p0.price) / (p1.expiry - p0.expiry);
      breakevenPrices.push(parseFloat(be.toFixed(2)));
    }
  }
  return { legs, netCost, maxProfit, maxLoss, breakevenPrices, pnlChart };
}

/* ── HV helper ──────────────────────────────────────────────────── */
function calcHV(closes: number[], period: number): number {
  const slice = closes.slice(-(period + 1));
  const returns = slice.slice(1).map((c, i) => Math.log(c / slice[i]));
  const mean = returns.reduce((a, b) => a + b) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  return parseFloat((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(1));
}

/* ── P&L Diagram (tabbed) ───────────────────────────────────────── */
const fmt$ = (v: number) => v >= 0 ? `+$${v.toFixed(0)}` : `-$${Math.abs(v).toFixed(0)}`;

type ChartTab = 'graph' | 'table' | 'pnl-pct' | 'max-risk';

function PnLDiagram({ data, spot, breakevenPrices, maxLoss }: {
  data: PnLPoint[];
  spot: number;
  breakevenPrices: number[];
  maxLoss: number | null;
}) {
  const [tab, setTab] = useState<ChartTab>('graph');
  const [rangeIdx, setRangeIdx] = useState(50);   // 0=±1% ... 100=±15%
  const [ivAdjust, setIvAdjust] = useState(50);   // 0=0.5x ... 100=1.5x

  if (!data.length) return null;

  // Range slider: maps 0–100 → ±1%–±20% of spot
  const rangePct = 1 + (rangeIdx / 100) * 19; // 1% to 20%
  const lo = spot * (1 - rangePct / 100);
  const hi = spot * (1 + rangePct / 100);
  const visible = data.filter((d) => d.price >= lo && d.price <= hi);

  const absMaxLoss = maxLoss !== null ? Math.abs(maxLoss) : Math.max(...data.map((d) => Math.abs(d.expiry)));

  // Tabs config
  const TABS: { id: ChartTab; label: string }[] = [
    { id: 'graph',    label: '📈 Graph' },
    { id: 'table',    label: '☰ Table' },
    { id: 'pnl-pct',  label: 'P&L %' },
    { id: 'max-risk', label: '% of Max Risk' },
  ];

  // Custom dot to colour the area chart by profit/loss
  const gradientId = 'pnlGrad';

  const GraphView = () => (
    <>
      {/* Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 px-1">
        <div>
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>RANGE</span>
            <span className="font-semibold text-gray-600">±{rangePct.toFixed(0)}%</span>
          </div>
          <input
            type="range" min={0} max={100} value={rangeIdx}
            onChange={(e) => setRangeIdx(Number(e.target.value))}
            className="w-full h-1.5 rounded-full accent-indigo-500 cursor-pointer"
          />
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>VIEW SCALE</span>
            <span className="font-semibold text-gray-600">{ivAdjust < 50 ? 'compressed' : ivAdjust > 50 ? 'expanded' : 'default'}</span>
          </div>
          <input
            type="range" min={0} max={100} value={ivAdjust}
            onChange={(e) => setIvAdjust(Number(e.target.value))}
            className="w-full h-1.5 rounded-full accent-indigo-500 cursor-pointer"
          />
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={visible} margin={{ top: 8, right: 32, left: 16, bottom: 8 }}>
          <defs>
            <linearGradient id={`${gradientId}-expiry`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="price" tickFormatter={(v) => `$${(v as number).toFixed(0)}`} tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: '#94a3b8' }}
            itemStyle={{ color: '#e2e8f0' }}
            formatter={(val: number, name: string) => [fmt$(val), name === 'expiry' ? 'At Expiry' : 'Today']}
            labelFormatter={(l) => `Price: $${(l as number).toFixed(2)}`}
          />
          <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1.5} />
          <ReferenceLine x={spot} stroke="#94a3b8" strokeDasharray="4 4"
            label={{ value: 'Spot', fill: '#94a3b8', fontSize: 10 }} />
          {breakevenPrices.map((be, i) => (
            <ReferenceLine key={i} x={be} stroke="#10b981" strokeDasharray="3 3"
              label={{ value: `BE $${be}`, fill: '#10b981', fontSize: 9 }} />
          ))}
          <Area
            type="monotone" dataKey="expiry"
            stroke="#6366f1" strokeWidth={2.5} dot={false} name="expiry"
            fill={`url(#${gradientId}-expiry)`}
          />
          <Line type="monotone" dataKey="today" stroke="#f59e0b" strokeWidth={1.5}
            dot={false} strokeDasharray="5 3" name="today" />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex gap-5 text-xs text-gray-400 mt-3 justify-center">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-0.5 bg-indigo-500 rounded" />At Expiry
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-0.5 bg-amber-400" style={{ border: '1px dashed #f59e0b', height: 0 }} />Today
        </span>
      </div>
    </>
  );

  const TableView = () => (
    <div className="overflow-auto max-h-72">
      <table className="w-full text-xs min-w-[400px]">
        <thead className="sticky top-0 bg-gray-50">
          <tr className="text-gray-400 border-b border-gray-200">
            <th className="text-right py-2 px-3">Price</th>
            <th className="text-right py-2 px-3">P&L at Expiry</th>
            <th className="text-right py-2 px-3">P&L Today</th>
            <th className="text-right py-2 px-3">P&L %</th>
          </tr>
        </thead>
        <tbody>
          {visible.filter((_, i) => i % 4 === 0).map((row) => {
            const pct = absMaxLoss > 0 ? ((row.expiry / absMaxLoss) * 100) : 0;
            return (
              <tr key={row.price} className={`border-b border-gray-50 ${row.price >= (breakevenPrices[0] ?? Infinity) && (breakevenPrices.length < 2 || row.price <= (breakevenPrices[1] ?? Infinity)) ? 'bg-green-50' : row.expiry >= 0 ? 'bg-green-50' : ''}`}>
                <td className={`text-right py-1.5 px-3 font-medium ${Math.abs(row.price - spot) < (spot * 0.002) ? 'text-indigo-600 font-bold' : 'text-gray-700'}`}>
                  ${row.price.toFixed(2)}
                </td>
                <td className={`text-right py-1.5 px-3 font-semibold ${row.expiry >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {fmt$(row.expiry)}
                </td>
                <td className={`text-right py-1.5 px-3 ${row.today >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {fmt$(row.today)}
                </td>
                <td className={`text-right py-1.5 px-3 ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const PnLPctView = () => {
    const maxAbsExpiry = Math.max(...visible.map((d) => Math.abs(d.expiry)), 1);
    const pctData = visible.map((d) => ({ ...d, pct: parseFloat((d.expiry / maxAbsExpiry * 100).toFixed(1)) }));
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={pctData.filter((_, i) => i % 2 === 0)} margin={{ top: 8, right: 24, left: 16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="price" tickFormatter={(v) => `$${(v as number).toFixed(0)}`} tick={{ fontSize: 10 }} />
          <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: '#94a3b8' }}
            itemStyle={{ color: '#e2e8f0' }}
            formatter={(val: number) => [`${val >= 0 ? '+' : ''}${val.toFixed(1)}%`, 'P&L %']}
            labelFormatter={(l) => `Price: $${(l as number).toFixed(2)}`}
          />
          <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1.5} />
          <ReferenceLine x={spot} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Spot', fill: '#94a3b8', fontSize: 10 }} />
          <Bar dataKey="pct" radius={[2, 2, 0, 0]}>
            {pctData.filter((_, i) => i % 2 === 0).map((entry, i) => (
              <Cell key={i} fill={entry.pct >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const MaxRiskView = () => {
    const mrData = visible.map((d) => ({
      ...d,
      pct: absMaxLoss > 0 ? parseFloat((d.expiry / absMaxLoss * 100).toFixed(1)) : 0,
    }));
    return (
      <>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={mrData.filter((_, i) => i % 2 === 0)} margin={{ top: 8, right: 24, left: 16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="price" tickFormatter={(v) => `$${(v as number).toFixed(0)}`} tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#94a3b8' }}
              itemStyle={{ color: '#e2e8f0' }}
              formatter={(val: number) => [`${val >= 0 ? '+' : ''}${val.toFixed(1)}%`, '% of Max Risk']}
              labelFormatter={(l) => `Price: $${(l as number).toFixed(2)}`}
            />
            <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1.5} />
            <ReferenceLine y={100} stroke="#22c55e" strokeDasharray="3 3" label={{ value: 'Max Profit', fill: '#22c55e', fontSize: 9 }} />
            <ReferenceLine y={-100} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Max Loss', fill: '#ef4444', fontSize: 9 }} />
            <ReferenceLine x={spot} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Spot', fill: '#94a3b8', fontSize: 10 }} />
            {breakevenPrices.map((be, i) => (
              <ReferenceLine key={i} x={be} stroke="#10b981" strokeDasharray="3 3" label={{ value: `BE`, fill: '#10b981', fontSize: 9 }} />
            ))}
            <Area type="monotone" dataKey="pct" stroke="#6366f1" strokeWidth={2} dot={false}
              fill="url(#pctGrad)" name="% of Max Risk" />
            <defs>
              <linearGradient id="pctGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.2} />
              </linearGradient>
            </defs>
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-center text-gray-400 mt-2">100% = Max Profit · −100% = Max Loss</p>
      </>
    );
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-gray-100 bg-gray-50">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'bg-white border-b-2 border-indigo-500 text-indigo-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === 'graph'    && <GraphView />}
        {tab === 'table'    && <TableView />}
        {tab === 'pnl-pct'  && <PnLPctView />}
        {tab === 'max-risk' && <MaxRiskView />}
      </div>
    </div>
  );
}

/* ── Trade Summary ──────────────────────────────────────────────── */
function TradeSummary({ result, stratId }: { result: CalcResult; stratId: StrategyId }) {
  const isCredit = result.netCost < 0;
  const items = [
    {
      label: isCredit ? 'Net Credit' : 'Net Debit',
      value: `$${Math.abs(result.netCost).toFixed(2)}`,
      color: isCredit ? 'text-green-600' : 'text-red-600',
    },
    {
      label: 'Max Profit',
      value: result.maxProfit === null ? 'Unlimited ∞' : `$${result.maxProfit.toFixed(2)}`,
      color: 'text-green-600',
    },
    {
      label: 'Max Loss',
      value: result.maxLoss === null ? 'Unlimited' : `$${Math.abs(result.maxLoss).toFixed(2)}`,
      color: 'text-red-600',
    },
    {
      label: 'Breakeven(s)',
      value: result.breakevenPrices.length ? result.breakevenPrices.map((b) => `$${b}`).join(' / ') : 'N/A',
      color: 'text-indigo-600',
    },
    {
      label: 'Required Capital',
      value: isCredit
        ? `$${Math.abs(result.maxLoss ?? 0).toFixed(2)} (margin)`
        : `$${Math.abs(result.netCost).toFixed(2)}`,
      color: 'text-gray-700',
    },
  ];
  if (result.maxProfit !== null && result.maxLoss !== null && result.maxLoss < 0) {
    const rr = result.maxProfit / Math.abs(result.maxLoss);
    items.push({ label: 'Reward / Risk', value: `${rr.toFixed(2)}:1`, color: rr >= 1 ? 'text-green-600' : 'text-amber-600' });
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm h-full">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Trade Summary</h3>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between items-center border-b border-gray-50 pb-2">
            <span className="text-xs text-gray-500">{item.label}</span>
            <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Greeks Table ───────────────────────────────────────────────── */
function GreeksTable({ legs }: { legs: Leg[] }) {
  const net = legs.reduce((acc, l) => {
    const s = l.direction === 'long' ? 1 : -1;
    return {
      delta: acc.delta + s * l.delta * l.qty,
      gamma: acc.gamma + s * l.gamma * l.qty,
      theta: acc.theta + s * l.theta * l.qty * 100,
      vega:  acc.vega  + s * l.vega  * l.qty * 100,
    };
  }, { delta: 0, gamma: 0, theta: 0, vega: 0 });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm h-full overflow-x-auto">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Position Greeks</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 border-b border-gray-100">
            <th className="text-left py-1.5 pr-4">Leg</th>
            <th className="text-right pr-3">Premium</th>
            <th className="text-right pr-3">Δ Delta</th>
            <th className="text-right pr-3">Γ Gamma</th>
            <th className="text-right pr-3">Θ Theta/day</th>
            <th className="text-right">V Vega/1%</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((leg, i) => {
            const s = leg.direction === 'long' ? 1 : -1;
            return (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-1.5 pr-4 font-medium text-gray-700">
                  <span className={`mr-1 text-xs font-bold ${leg.direction === 'long' ? 'text-green-600' : 'text-red-600'}`}>
                    {leg.direction === 'long' ? '+' : '−'}
                  </span>
                  {leg.label} {leg.qty > 1 ? `×${leg.qty}` : ''}
                </td>
                <td className="text-right pr-3 text-gray-600">${(leg.premium * 100).toFixed(2)}</td>
                <td className="text-right pr-3">{(s * leg.delta * leg.qty).toFixed(3)}</td>
                <td className="text-right pr-3">{(s * leg.gamma * leg.qty).toFixed(4)}</td>
                <td className={`text-right pr-3 ${s * leg.theta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                  ${(s * leg.theta * leg.qty * 100).toFixed(2)}
                </td>
                <td className="text-right">${(s * leg.vega * leg.qty * 100).toFixed(2)}</td>
              </tr>
            );
          })}
          <tr className="font-bold text-gray-800 border-t-2 border-gray-200 bg-gray-50">
            <td className="py-2 pr-4">Net Position</td>
            <td className="text-right pr-3 text-gray-500">—</td>
            <td className="text-right pr-3">{net.delta.toFixed(3)}</td>
            <td className="text-right pr-3">{net.gamma.toFixed(4)}</td>
            <td className={`text-right pr-3 ${net.theta > 0 ? 'text-green-600' : 'text-red-500'}`}>
              ${net.theta.toFixed(2)}/day
            </td>
            <td className="text-right">${net.vega.toFixed(2)}/1%</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-gray-400 mt-3">Theta &amp; Vega shown per contract (×100). Positive theta = collecting decay.</p>
    </div>
  );
}

/* ── HV Panel ───────────────────────────────────────────────────── */
function HVPanel({ hvData, userIV, loading }: { hvData: HVData | null; userIV: string; loading: boolean }) {
  const iv = parseFloat(userIV);
  const hvs: { label: string; val: number | undefined }[] = hvData
    ? [{ label: 'HV10', val: hvData.hv10 }, { label: 'HV20', val: hvData.hv20 }, { label: 'HV30', val: hvData.hv30 }, { label: 'HV60', val: hvData.hv60 }]
    : [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Historical Volatility</h3>
      {loading && <p className="text-xs text-gray-400">Loading…</p>}
      {!loading && !hvData && <p className="text-xs text-gray-400">Enter a symbol to load HV data.</p>}
      {hvData && (
        <div className="space-y-3">
          {hvs.map(({ label, val }) => {
            const diff = iv && val ? iv - val : null;
            const diffColor = diff === null ? 'text-gray-400' : diff > 3 ? 'text-red-600' : diff < -3 ? 'text-green-600' : 'text-gray-600';
            return (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 w-10">{label}</span>
                <div className="flex-1 mx-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.min(val ?? 0, 80) / 80 * 100}%` }} />
                </div>
                <span className="text-sm font-bold text-gray-800 w-14 text-right">{val?.toFixed(1)}%</span>
                {iv > 0 && val !== undefined && (
                  <span className={`text-xs ml-2 w-20 text-right ${diffColor}`}>
                    IV {diff! > 0 ? '+' : ''}{diff!.toFixed(1)}%
                  </span>
                )}
              </div>
            );
          })}
          {iv > 0 && (
            <div className="pt-3 border-t border-gray-100">
              {(() => {
                const hv20 = hvData.hv20;
                const diff = iv - hv20;
                if (Math.abs(diff) < 2) return <p className="text-xs text-gray-500">IV ≈ HV20 — roughly fair value</p>;
                return diff > 0
                  ? <p className="text-xs text-red-600">IV is {diff.toFixed(1)}% <strong>above</strong> HV20 — options appear expensive (sell premium?)</p>
                  : <p className="text-xs text-green-600">IV is {Math.abs(diff).toFixed(1)}% <strong>below</strong> HV20 — options appear cheap (buy premium?)</p>;
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Trade Narrative ────────────────────────────────────────────── */
function TradeNarrative({
  stratId, symbol, spot, k1, k2, k3, k4, dte, contractQty, result,
}: {
  stratId: StrategyId; symbol: string; spot: number;
  k1: number; k2: number; k3: number; k4: number;
  dte: number; contractQty: number; result: CalcResult;
}) {
  const { netCost, maxProfit, maxLoss, breakevenPrices, legs } = result;
  const isCredit = netCost < 0;
  const creditAmt = Math.abs(netCost);
  const be1 = breakevenPrices[0];
  const be2 = breakevenPrices[1];
  const dteLabel = dte === 1 ? '1 day' : `${dte} days`;
  const perC = (n: number) => (n / contractQty).toFixed(2);
  const maxProfitPer = maxProfit != null ? maxProfit / contractQty : null;
  const maxLossPer   = Math.abs((maxLoss ?? -netCost)) / contractQty;
  const longLeg  = legs.find((l) => l.direction === 'long');
  const shortLeg = legs.find((l) => l.direction === 'short');

  const EMOJI: Record<string, string> = {
    bullish: '📈', bearish: '📉', 'neutral-credit': '💰', 'neutral-debit': '🔵', volatility: '⚡',
  };
  const BG: Record<string, string> = {
    bullish:          'border-green-200 bg-green-50',
    bearish:          'border-red-200 bg-red-50',
    'neutral-credit': 'border-blue-200 bg-blue-50',
    'neutral-debit':  'border-purple-200 bg-purple-50',
    volatility:       'border-amber-200 bg-amber-50',
  };
  const cat = STRATEGIES[stratId].category;

  let text: React.ReactNode;
  switch (stratId) {
    case 'long-call':
      text = <>
        You&apos;re buying a <strong>{symbol} ${k1} call</strong> expiring in <strong>{dteLabel}</strong>, paying <strong>${(legs[0].premium * 100).toFixed(2)}</strong> per contract — that&apos;s the most you can ever lose on this trade.
        For it to be profitable at expiry, <strong>{symbol} needs to close above ${be1?.toFixed(2) ?? '—'}</strong> (your breakeven).
        Above that, every extra dollar {symbol} rises puts roughly <strong>$100 more in your pocket</strong> per contract — there&apos;s no ceiling.
        Below <strong>${k1}</strong> at expiry, both options are worthless and you lose the full premium.
      </>;
      break;
    case 'long-put':
      text = <>
        You&apos;re buying a <strong>{symbol} ${k1} put</strong> expiring in <strong>{dteLabel}</strong>, paying <strong>${(legs[0].premium * 100).toFixed(2)}</strong> per contract.
        To profit at expiry, <strong>{symbol} must close below ${be1?.toFixed(2) ?? '—'}</strong> — your breakeven.
        Every dollar {symbol} drops below that adds ~$100 per contract.
        Above <strong>${k1}</strong> at expiry the put expires worthless — you lose only the premium.
      </>;
      break;
    case 'covered-call':
      text = <>
        You already own 100 shares of <strong>{symbol}</strong> and you&apos;re selling a <strong>${k1} call</strong>, collecting <strong>${(legs[0].premium * 100).toFixed(2)}</strong> in cash today.
        If <strong>{symbol} stays below ${k1} by expiry</strong> ({dteLabel}), the call expires worthless and you keep the premium as pure income.
        If {symbol} trades above <strong>${k1}</strong>, your shares get called away at that price — you still profit, but give up any further gains.
      </>;
      break;
    case 'csp':
      text = <>
        You&apos;re selling a <strong>{symbol} ${k1} put</strong>, collecting <strong>${(legs[0].premium * 100).toFixed(2)}</strong> in premium — that&apos;s your maximum gain.
        As long as <strong>{symbol} stays above ${k1} by expiry</strong> ({dteLabel}), the put expires worthless and you keep the full premium.
        If {symbol} falls below <strong>${k1}</strong>, you&apos;re obligated to buy 100 shares at a real cost basis of <strong>${(k1 - legs[0].premium).toFixed(2)}</strong> per share.
        Your breakeven is <strong>${be1?.toFixed(2) ?? '—'}</strong>.
      </>;
      break;
    case 'bull-call':
      text = <>
        You&apos;re buying a <strong>{symbol} ${k1} call</strong> (costs ${(longLeg!.premium * 100).toFixed(2)}) and selling a <strong>${k2} call</strong> against it (collects ${(shortLeg!.premium * 100).toFixed(2)}),
        for a net debit of <strong>${perC(Math.abs(netCost))}</strong> per contract.
        For <strong>maximum profit</strong> of <strong>${maxProfitPer?.toFixed(2) ?? '—'}</strong>, you need <strong>{symbol} to close at or above ${k2} by expiry</strong> ({dteLabel}).
        Your breakeven is <strong>${be1?.toFixed(2) ?? '—'}</strong>. Below ${k1} both legs expire worthless.
      </>;
      break;
    case 'bear-put':
      text = <>
        You&apos;re buying a <strong>{symbol} ${k2} put</strong> (costs ${(longLeg!.premium * 100).toFixed(2)}) and selling a <strong>${k1} put</strong> against it (collects ${(shortLeg!.premium * 100).toFixed(2)}),
        for a net debit of <strong>${perC(Math.abs(netCost))}</strong> per contract.
        For <strong>maximum profit</strong> of <strong>${maxProfitPer?.toFixed(2) ?? '—'}</strong>, <strong>{symbol} needs to close at or below ${k1} at expiry</strong> ({dteLabel}).
        Your breakeven is <strong>${be1?.toFixed(2) ?? '—'}</strong>. Above ${k2} both legs expire worthless.
      </>;
      break;
    case 'bull-put':
      text = <>
        You&apos;re collecting a net credit of <strong>${perC(creditAmt)}</strong> per contract by selling the <strong>{symbol} ${k2} put</strong> and buying the <strong>${k1} put</strong> as downside protection.
        As long as <strong>{symbol} stays above ${k2} at expiry</strong> ({dteLabel}), both puts expire worthless and you pocket the full credit.
        Your breakeven is <strong>${be1?.toFixed(2) ?? '—'}</strong>. If {symbol} falls below <strong>${k1}</strong>, your loss is capped at <strong>${maxLossPer.toFixed(2)}</strong>.
      </>;
      break;
    case 'bear-call':
      text = <>
        You&apos;re collecting a net credit of <strong>${perC(creditAmt)}</strong> per contract by selling the <strong>{symbol} ${k1} call</strong> and buying the <strong>${k2} call</strong> as upside insurance.
        As long as <strong>{symbol} stays below ${k1} at expiry</strong> ({dteLabel}), both calls expire worthless and you keep the full credit.
        Your breakeven is <strong>${be1?.toFixed(2) ?? '—'}</strong>. Above <strong>${k2}</strong>, your loss is capped at <strong>${maxLossPer.toFixed(2)}</strong>.
      </>;
      break;
    case 'straddle':
      text = <>
        You&apos;re buying both a <strong>{symbol} ${k1} call</strong> and a <strong>${k1} put</strong>, paying a combined debit of <strong>${perC(Math.abs(netCost))}</strong> per contract.
        You need a <em>big move</em> in either direction: above <strong>${be2?.toFixed(2) ?? '—'}</strong> or below <strong>${be1?.toFixed(2) ?? '—'}</strong>.
        Anywhere between those two levels at expiry you&apos;re at a loss. Time decay (theta) is your biggest enemy — every quiet day bleeds value.
      </>;
      break;
    case 'strangle':
      text = <>
        You&apos;re buying an OTM <strong>{symbol} ${k1} put</strong> and an OTM <strong>${k2} call</strong>, paying <strong>${perC(Math.abs(netCost))}</strong> per contract — cheaper than a straddle, but needs a bigger move.
        For profit, {symbol} must close below <strong>${be1?.toFixed(2) ?? '—'}</strong> or above <strong>${be2?.toFixed(2) ?? '—'}</strong> by expiry ({dteLabel}).
        Between those two breakevens, both options expire worthless and you lose the full premium.
      </>;
      break;
    case 'iron-condor':
      text = <>
        You&apos;re collecting a net credit of <strong>${perC(creditAmt)}</strong> per contract by selling the <strong>{symbol} ${k2}/{k1} put spread</strong> and the <strong>${k3}/{k4} call spread</strong>.
        Your profit zone is between <strong>${k2} and ${k3}</strong> at expiry ({dteLabel}). Outside that band you begin losing.
        Breakevens: <strong>${be1?.toFixed(2) ?? '—'}</strong> (lower) and <strong>${be2?.toFixed(2) ?? '—'}</strong> (upper).
        Maximum loss if {symbol} goes past the wings: <strong>${maxLossPer.toFixed(2)}</strong>.
      </>;
      break;
    case 'butterfly':
      text = <>
        You&apos;re buying the <strong>{symbol} ${k1} call</strong>, selling <em>two</em> <strong>${k2} calls</strong>, and buying the <strong>${k3} call</strong> as the wing, for a debit of <strong>${perC(Math.abs(netCost))}</strong> per contract.
        Peak profit of <strong>${maxProfitPer?.toFixed(2) ?? '—'}</strong> is achieved only if {symbol} closes exactly at <strong>${k2} on expiration day</strong> ({dteLabel}).
        You&apos;re profitable between <strong>${be1?.toFixed(2) ?? '—'}</strong> and <strong>${be2?.toFixed(2) ?? '—'}</strong>.
        Outside the wings the small debit is all you lose.
      </>;
      break;
    default:
      text = <>Options strategy selected.</>;
  }

  return (
    <div className={`rounded-xl border p-5 shadow-sm ${BG[cat]}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5 select-none">{EMOJI[cat]}</span>
        <div>
          <h3 className="text-sm font-bold text-gray-800 mb-2">
            Trade Breakdown — {STRATEGIES[stratId].name} on {symbol}
            {contractQty > 1 && <span className="font-normal text-gray-500"> ({contractQty} contracts)</span>}
          </h3>
          <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
          {contractQty > 1 && (
            <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
              Figures above are per contract (×100). Multiply by {contractQty} for your full position size.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Quick tickers ──────────────────────────────────────────────── */
const QUICK_TICKERS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'META', 'AMZN'];

/* ── Main Page ──────────────────────────────────────────────────── */
export default function CalculatorPage() {
  const router = useRouter();

  // Symbol
  const [symbol, setSymbol] = useState('SPY');
  const [input, setInput] = useState('SPY');

  // Strategy builder state
  const [stratId, setStratId] = useState<StrategyId>('bull-call');
  const [spot, setSpot] = useState('');
  const [k1, setK1] = useState('');
  const [k2, setK2] = useState('');
  const [k3, setK3] = useState('');
  const [k4, setK4] = useState('');
  const [dte, setDte] = useState('30');
  const [iv, setIv] = useState('25');
  const [rate, setRate] = useState('4.5');
  const [contractQty, setContractQty] = useState('1');
  const [userIV, setUserIV] = useState('');

  // Results
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [hvData, setHvData] = useState<HVData | null>(null);
  const [hvLoading, setHvLoading] = useState(false);
  const [calcError, setCalcError] = useState('');

  const strat = STRATEGIES[stratId];
  const paramsApplied = useRef(false);

  // Fetch HV when symbol changes
  const fetchHV = useCallback(async (sym: string) => {
    setHvLoading(true);
    setHvData(null);
    try {
      const res = await fetch(`/api/market/candles?symbol=${encodeURIComponent(sym)}&range=full`);
      if (res.ok) {
        const json = await res.json();
        const closes: number[] = json.candles?.map((c: { close: number }) => c.close) ?? [];
        if (closes.length) {
          const latest = closes[closes.length - 1];
          setHvData({ hv10: calcHV(closes, 10), hv20: calcHV(closes, 20), hv30: calcHV(closes, 30), hv60: calcHV(closes, 60), currentPrice: latest });
          setSpot(latest.toFixed(2));
        }
      }
    } finally {
      setHvLoading(false);
    }
  }, []);

  useEffect(() => { fetchHV(symbol); }, [symbol, fetchHV]);

  // Apply URL query params (strategy + symbol) once router is ready
  useEffect(() => {
    if (!router.isReady || paramsApplied.current) return;
    paramsApplied.current = true;

    const { strategy, symbol: symParam } = router.query;
    if (typeof strategy === 'string' && STRATEGY_IDS.has(strategy)) {
      setStratId(strategy as StrategyId);
    }
    if (typeof symParam === 'string' && symParam.trim()) {
      const upper = symParam.trim().toUpperCase();
      setSymbol(upper);
      setInput(upper);
    }
  }, [router.isReady, router.query]);

  // Auto-suggest strikes when strategy or spot changes
  useEffect(() => {
    const s = parseFloat(spot);
    if (!s || s <= 0) return;
    const r = (pct: number) => (Math.round(s * pct * 4) / 4).toFixed(2);
    switch (stratId) {
      case 'long-call':    setK1(r(1.05)); break;
      case 'long-put':     setK1(r(0.95)); break;
      case 'covered-call': setK1(r(1.05)); break;
      case 'csp':          setK1(r(0.95)); break;
      case 'bull-call':    setK1(r(1.00)); setK2(r(1.05)); break;
      case 'bear-put':     setK1(r(0.95)); setK2(r(1.00)); break;
      case 'bull-put':     setK1(r(0.92)); setK2(r(0.97)); break;
      case 'bear-call':    setK1(r(1.03)); setK2(r(1.08)); break;
      case 'straddle':     setK1(r(1.00)); break;
      case 'strangle':     setK1(r(0.95)); setK2(r(1.05)); break;
      case 'iron-condor':  setK1(r(0.90)); setK2(r(0.95)); setK3(r(1.05)); setK4(r(1.10)); break;
      case 'butterfly':    setK1(r(0.95)); setK2(r(1.00)); setK3(r(1.05)); break;
    }
  }, [stratId]); // intentionally only on stratId change

  const handleSymbol = (sym: string) => {
    setSymbol(sym.toUpperCase());
    setInput(sym.toUpperCase());
    setCalcResult(null);
  };

  // AI Suggest: fills strikes based on strategy + spot + IV
  const handleAISuggest = useCallback(() => {
    const s = parseFloat(spot);
    if (!s || s <= 0) return;
    const ivVal = parseFloat(iv) || 25;
    // Use expected move (1 SD) for smarter placement: ~IV/sqrt(365/DTE)
    const dteVal = parseInt(dte) || 30;
    const oneSd = s * (ivVal / 100) * Math.sqrt(dteVal / 365);
    const r = (val: number) => (Math.round(val * 4) / 4).toFixed(2);  // round to $0.25

    switch (stratId) {
      // Directional buys: slight OTM for defined-risk directional plays
      case 'long-call':    setK1(r(s + oneSd * 0.6)); break;
      case 'long-put':     setK1(r(s - oneSd * 0.6)); break;
      // Income / assignment strategies: use 1 SD OTM for high probability
      case 'covered-call': setK1(r(s + oneSd * 1.0)); break;
      case 'csp':          setK1(r(s - oneSd * 1.0)); break;
      // Bull call: buy ATM, sell 1 SD OTM
      case 'bull-call':    setK1(r(s)); setK2(r(s + oneSd * 1.0)); break;
      // Bear put: sell 1 SD below, buy ATM
      case 'bear-put':     setK1(r(s - oneSd * 1.0)); setK2(r(s)); break;
      // Credit spreads: short at 0.8 SD, long at 1.5 SD
      case 'bull-put':     setK1(r(s - oneSd * 1.5)); setK2(r(s - oneSd * 0.8)); break;
      case 'bear-call':    setK1(r(s + oneSd * 0.8)); setK2(r(s + oneSd * 1.5)); break;
      // Volatility plays: ATM for straddle
      case 'straddle':     setK1(r(s)); break;
      // Strangle: ±0.7 SD
      case 'strangle':     setK1(r(s - oneSd * 0.7)); setK2(r(s + oneSd * 0.7)); break;
      // Iron condor: 0.5 SD inner, 1.2 SD outer
      case 'iron-condor':
        setK1(r(s - oneSd * 1.2)); setK2(r(s - oneSd * 0.5));
        setK3(r(s + oneSd * 0.5)); setK4(r(s + oneSd * 1.2));
        break;
      // Butterfly: equidistant wings = 0.5 SD
      case 'butterfly':    setK1(r(s - oneSd * 0.5)); setK2(r(s)); setK3(r(s + oneSd * 0.5)); break;
    }
  }, [spot, iv, dte, stratId]);

  const handleCalculate = () => {
    setCalcError('');
    const sp = parseFloat(spot);
    const k1v = parseFloat(k1), k2v = parseFloat(k2), k3v = parseFloat(k3), k4v = parseFloat(k4);
    const dteV = parseInt(dte) || 30;
    const ivV  = parseFloat(iv)   || 25;
    const rateV = parseFloat(rate) || 4.5;
    const qty  = parseInt(contractQty) || 1;
    if (!sp || sp <= 0) { setCalcError('Enter a valid spot price.'); return; }
    const strDef = STRATEGIES[stratId];
    const strikesNeeded = strDef.strikes.map((s) => s.key);
    const ksMap = { k1: k1v || sp, k2: k2v || sp * 1.05, k3: k3v || sp * 1.05, k4: k4v || sp * 1.1 };
    if (strikesNeeded.includes('k1') && (!k1v || k1v <= 0)) { setCalcError('Enter strike price(s).'); return; }
    try {
      const result = buildCalcResult(stratId, sp, ksMap, dteV, ivV, rateV, qty);
      setCalcResult(result);
    } catch {
      setCalcError('Calculation error — check that DTE ≥ 1 and IV > 0.');
    }
  };

  const inputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full bg-white';

  return (
    <Layout title="Options Calculator">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-800">Options Calculator</h1>
              {/* Strategy badge */}
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${CATEGORY_COLOR[strat.category]}`}>
                {strat.name}
              </span>
            </div>
            <Link
              href="/strategies"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              ← All Strategies
            </Link>
          </div>

          {/* Symbol search + quick tickers */}
          <div className="flex flex-wrap items-center gap-3">
            <form onSubmit={(e) => { e.preventDefault(); handleSymbol(input); }} className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                placeholder="TICKER…"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <button type="submit" className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700">
                Go
              </button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TICKERS.map((t) => (
                <button
                  key={t}
                  onClick={() => handleSymbol(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${symbol === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Current price badge */}
          {hvData && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="font-bold text-gray-800">{symbol}</span>
              <span className="text-gray-400">·</span>
              <span className="font-bold text-indigo-700">${hvData.currentPrice.toFixed(2)}</span>
              <span className="text-xs text-gray-400">last close</span>
            </div>
          )}
        </div>

        {/* ── Strategy Builder ── */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Strategy Builder</h3>

          {/* Strategy selector */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 block mb-1.5">Strategy</label>
            <select
              value={stratId}
              onChange={(e) => { setStratId(e.target.value as StrategyId); setCalcResult(null); }}
              className={inputCls}
            >
              <optgroup label="Bullish">
                <option value="long-call">Long Call</option>
                <option value="csp">Cash Secured Put (CSP)</option>
                <option value="bull-call">Bull Call Spread</option>
              </optgroup>
              <optgroup label="Bearish">
                <option value="long-put">Long Put</option>
                <option value="bear-put">Bear Put Spread</option>
                <option value="bear-call">Bear Call Spread (Credit)</option>
              </optgroup>
              <optgroup label="Neutral / Credit">
                <option value="covered-call">Covered Call</option>
                <option value="bull-put">Bull Put Spread (Credit)</option>
                <option value="iron-condor">Iron Condor</option>
              </optgroup>
              <optgroup label="Volatility / Event">
                <option value="straddle">Long Straddle</option>
                <option value="strangle">Long Strangle</option>
                <option value="butterfly">Long Butterfly</option>
              </optgroup>
            </select>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
              {strat.description} <em>{strat.when}</em>
            </p>
          </div>

          {/* Common inputs — Spot & Rate as text, DTE & IV with sliders */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {/* Spot */}
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Spot Price ($)</label>
              <input value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
            {/* DTE with slider */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">DTE (days)</label>
                <span className="text-xs font-bold text-indigo-600">{dte}d</span>
              </div>
              <input value={dte} onChange={(e) => setDte(e.target.value)} placeholder="30" className={inputCls} />
              <input
                type="range" min={1} max={365} value={parseInt(dte) || 30}
                onChange={(e) => { setDte(e.target.value); setCalcResult(null); }}
                className="w-full mt-1.5 h-1.5 rounded-full accent-indigo-500 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-gray-300 mt-0.5">
                <span>1d</span><span>365d</span>
              </div>
            </div>
            {/* IV with slider */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">IV (%)</label>
                <span className="text-xs font-bold text-indigo-600">{iv}%</span>
              </div>
              <input value={iv} onChange={(e) => setIv(e.target.value)} placeholder="25" className={inputCls} />
              <input
                type="range" min={1} max={200} value={parseFloat(iv) || 25}
                onChange={(e) => { setIv(e.target.value); setCalcResult(null); }}
                className="w-full mt-1.5 h-1.5 rounded-full accent-indigo-500 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-gray-300 mt-0.5">
                <span>1%</span><span>200%</span>
              </div>
            </div>
            {/* Risk-free */}
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Risk-Free (%)</label>
              <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="4.5" className={inputCls} />
            </div>
          </div>

          {/* Strike inputs */}
          <div className={`grid gap-3 mb-4 ${strat.strikes.length <= 2 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {strat.strikes.map(({ key, label, hint }) => {
              const valMap = { k1, k2, k3, k4 };
              const setMap = { k1: setK1, k2: setK2, k3: setK3, k4: setK4 };
              return (
                <div key={key}>
                  <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
                  <input
                    value={valMap[key]}
                    onChange={(e) => setMap[key](e.target.value)}
                    placeholder={hint}
                    className={inputCls}
                  />
                </div>
              );
            })}
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Contracts</label>
              <input value={contractQty} onChange={(e) => setContractQty(e.target.value)} placeholder="1" className={inputCls} />
            </div>
          </div>

          {calcError && <p className="text-xs text-red-500 mb-3">{calcError}</p>}

          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={handleCalculate}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              Calculate P&amp;L
            </button>
            <button
              onClick={() => { handleAISuggest(); }}
              disabled={!parseFloat(spot)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="AI fills strikes using expected move (1 SD) based on spot, IV, and DTE"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI Suggest Strikes
            </button>
            <span className="text-xs text-gray-400">← uses expected move from IV &amp; DTE</span>
          </div>
        </div>

        {/* ── Key metrics bar (shown after calculation) ── */}
        {calcResult && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: calcResult.netCost < 0 ? 'Net Credit' : 'Net Debit',
                value: `$${Math.abs(calcResult.netCost).toFixed(2)}`,
                color: calcResult.netCost < 0 ? 'text-green-600' : 'text-red-600',
                bg: calcResult.netCost < 0 ? 'border-green-200 bg-green-50' : 'border-red-100 bg-red-50',
              },
              {
                label: 'Max Profit',
                value: calcResult.maxProfit === null ? '∞ Unlimited' : `$${calcResult.maxProfit.toFixed(2)}`,
                color: 'text-green-700',
                bg: 'border-green-200 bg-green-50',
              },
              {
                label: 'Max Loss',
                value: calcResult.maxLoss === null ? 'Unlimited' : `$${Math.abs(calcResult.maxLoss).toFixed(2)}`,
                color: 'text-red-600',
                bg: 'border-red-100 bg-red-50',
              },
              {
                label: 'Breakeven(s)',
                value: calcResult.breakevenPrices.length ? calcResult.breakevenPrices.map((b) => `$${b}`).join(' / ') : 'N/A',
                color: 'text-indigo-700',
                bg: 'border-indigo-100 bg-indigo-50',
              },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`rounded-xl border p-4 shadow-sm ${bg}`}>
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className={`text-lg font-extrabold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── P&L diagram (tabbed) ── */}
        {calcResult && (
          <PnLDiagram
            data={calcResult.pnlChart}
            spot={parseFloat(spot)}
            breakevenPrices={calcResult.breakevenPrices}
            maxLoss={calcResult.maxLoss}
          />
        )}

        {/* ── Trade narrative ── */}
        {calcResult && (
          <TradeNarrative
            stratId={stratId}
            symbol={symbol}
            spot={parseFloat(spot)}
            k1={parseFloat(k1) || 0}
            k2={parseFloat(k2) || 0}
            k3={parseFloat(k3) || 0}
            k4={parseFloat(k4) || 0}
            dte={parseInt(dte) || 30}
            contractQty={parseInt(contractQty) || 1}
            result={calcResult}
          />
        )}

        {/* ── Trade Summary + Greeks ── */}
        {calcResult && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-2">
              <TradeSummary result={calcResult} stratId={stratId} />
            </div>
            <div className="lg:col-span-3">
              <GreeksTable legs={calcResult.legs} />
            </div>
          </div>
        )}

        {/* ── HV panel + Your IV input ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <HVPanel hvData={hvData} userIV={userIV} loading={hvLoading} />
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col justify-between">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">Your IV (from broker) %</label>
              <input
                value={userIV}
                onChange={(e) => setUserIV(e.target.value)}
                placeholder="e.g. 28.5"
                className={inputCls}
              />
              <p className="text-xs text-gray-400 mt-1.5">Enter the IV shown in your broker to compare with historical volatility.</p>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2">Jump to strategy analysis:</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/options" className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 transition-colors">
                  Options Analysis →
                </Link>
                <Link href="/strategies" className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 transition-colors">
                  All Strategies →
                </Link>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          Options pricing via Black-Scholes model. For educational purposes only — not financial advice.
        </p>
      </div>
    </Layout>
  );
}
