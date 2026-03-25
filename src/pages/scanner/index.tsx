import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { calculateCallGreeks, calculatePutGreeks } from '@/lib/greeks';

/* ── Types ──────────────────────────────────────────────────────── */
type StratType = 'bull-put' | 'bear-call' | 'iron-condor';
type SortKey = 'pop' | 'ev' | 'credit' | 'theta' | 'dte' | 'maxLoss' | 'creditToWidth';
type SortDir = 'asc' | 'desc';
type Bias = 'bullish' | 'bearish' | 'neutral';

interface ScanResult {
  id: string;
  type: StratType;
  dte: number;
  shortPutStrike?: number;
  longPutStrike?: number;
  shortCallStrike?: number;
  longCallStrike?: number;
  creditPerContract: number;   // $ received per contract
  maxLossPerContract: number;  // $ at risk per contract
  pop: number;                 // 0–100
  thetaPerDay: number;         // $ collected per day (positive)
  ev: number;                  // expected value $
  breakevenLow?: number;
  breakevenHigh?: number;
  shortDelta: number;
  creditToWidth: number;       // credit / (width × 100) — % of max profit collected
}

interface MarketData {
  price: number;
  hv10: number;
  hv20: number;
  hv30: number;
  ema20: number;
  bias: Bias;
}

/* ── Math: exact Black-Scholes risk-neutral probabilities ─────── */
function normCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

function calcD2(S: number, K: number, T: number, sigma: number, r: number): number {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return d1 - sigma * Math.sqrt(T);
}

// P(S_T > K) — bull put profits, short put expires worthless
const probAbove = (S: number, K: number, T: number, s: number, r: number) =>
  normCDF(calcD2(S, K, T, s, r));

// P(S_T < K) — bear call profits, short call expires worthless
const probBelow = (S: number, K: number, T: number, s: number, r: number) =>
  1 - normCDF(calcD2(S, K, T, s, r));

// P(K_put < S_T < K_call) — IC profit zone (exact: N(d2_Kput) - N(d2_Kcall))
// This equals probAbove(K_put) + probBelow(K_call) - 1 exactly by B-S
const probBetween = (S: number, Kp: number, Kc: number, T: number, s: number, r: number) =>
  Math.max(0, normCDF(calcD2(S, Kp, T, s, r)) - normCDF(calcD2(S, Kc, T, s, r)));

/* ── Strike ladder ──────────────────────────────────────────────── */
function autoStrikeWidth(spot: number): number {
  if (spot < 20)  return 0.5;
  if (spot < 50)  return 1;
  if (spot < 100) return 2.5;
  if (spot < 200) return 5;
  return 5;
}

function generateStrikes(spot: number, width: number): number[] {
  const lo = Math.floor(spot * 0.72 / width) * width;
  const hi = Math.ceil(spot  * 1.28 / width) * width;
  const arr: number[] = [];
  for (let k = lo; k <= hi; k += width) arr.push(Math.round(k * 100) / 100);
  return arr;
}

/* ── HV / EMA helpers ──────────────────────────────────────────── */
function calcHV(closes: number[], period: number): number {
  if (closes.length < period + 1) return 0;
  const sl = closes.slice(-(period + 1));
  const rets = sl.slice(1).map((c, i) => Math.log(c / sl[i]));
  const mean = rets.reduce((a, b) => a + b) / rets.length;
  const v = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return parseFloat((Math.sqrt(v) * Math.sqrt(252) * 100).toFixed(1));
}

function calcEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes.at(-1) ?? 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

/* ── Scan builders ──────────────────────────────────────────────── */
function mkBullPut(
  spot: number, sigma: number, r: number,
  shortK: number, longK: number, dte: number, spreadWidth: number,
): ScanResult | null {
  if (shortK >= spot || longK >= shortK || longK <= 0) return null;
  const T = Math.max(dte, 1) / 365;
  const inp = (K: number) => ({ spotPrice: spot, strikePrice: K, timeToExpiration: T, volatility: sigma, riskFreeRate: r });
  const sg = calculatePutGreeks(inp(shortK));
  const lg = calculatePutGreeks(inp(longK));
  const credit = ((sg.premium ?? 0) - (lg.premium ?? 0)) * 100;
  if (credit < 1) return null;
  const maxLoss = spreadWidth * 100 - credit;
  if (maxLoss <= 0) return null;
  const pop = probAbove(spot, shortK, T, sigma, r) * 100;
  // Net theta: credit spread collects decay. long.theta - short.theta gives positive when short has more decay
  const theta = ((lg.theta ?? 0) - (sg.theta ?? 0)) * 100;
  const ev = (pop / 100) * credit - (1 - pop / 100) * maxLoss;
  return {
    id: `bp-${shortK}-${longK}-${dte}`,
    type: 'bull-put',
    dte,
    shortPutStrike: shortK,
    longPutStrike: longK,
    creditPerContract: parseFloat(credit.toFixed(2)),
    maxLossPerContract: parseFloat(maxLoss.toFixed(2)),
    pop: parseFloat(pop.toFixed(1)),
    thetaPerDay: parseFloat(theta.toFixed(2)),
    ev: parseFloat(ev.toFixed(2)),
    breakevenLow: parseFloat((shortK - credit / 100).toFixed(2)),
    shortDelta: parseFloat(Math.abs(sg.delta ?? 0).toFixed(3)),
    creditToWidth: parseFloat((credit / (spreadWidth * 100)).toFixed(3)),
  };
}

function mkBearCall(
  spot: number, sigma: number, r: number,
  shortK: number, longK: number, dte: number, spreadWidth: number,
): ScanResult | null {
  if (shortK <= spot || longK <= shortK) return null;
  const T = Math.max(dte, 1) / 365;
  const inp = (K: number) => ({ spotPrice: spot, strikePrice: K, timeToExpiration: T, volatility: sigma, riskFreeRate: r });
  const sg = calculateCallGreeks(inp(shortK));
  const lg = calculateCallGreeks(inp(longK));
  const credit = ((sg.premium ?? 0) - (lg.premium ?? 0)) * 100;
  if (credit < 1) return null;
  const maxLoss = spreadWidth * 100 - credit;
  if (maxLoss <= 0) return null;
  const pop = probBelow(spot, shortK, T, sigma, r) * 100;
  const theta = ((lg.theta ?? 0) - (sg.theta ?? 0)) * 100;
  const ev = (pop / 100) * credit - (1 - pop / 100) * maxLoss;
  return {
    id: `bc-${shortK}-${longK}-${dte}`,
    type: 'bear-call',
    dte,
    shortCallStrike: shortK,
    longCallStrike: longK,
    creditPerContract: parseFloat(credit.toFixed(2)),
    maxLossPerContract: parseFloat(maxLoss.toFixed(2)),
    pop: parseFloat(pop.toFixed(1)),
    thetaPerDay: parseFloat(theta.toFixed(2)),
    ev: parseFloat(ev.toFixed(2)),
    breakevenHigh: parseFloat((shortK + credit / 100).toFixed(2)),
    shortDelta: parseFloat(Math.abs(sg.delta ?? 0).toFixed(3)),
    creditToWidth: parseFloat((credit / (spreadWidth * 100)).toFixed(3)),
  };
}

function mkIronCondor(bp: ScanResult, bc: ScanResult, spreadWidth: number): ScanResult | null {
  if (!bp.shortPutStrike || !bc.shortCallStrike) return null;
  const credit = bp.creditPerContract + bc.creditPerContract;
  const maxLoss = spreadWidth * 100 - credit;
  if (maxLoss <= 0) return null;
  // Exact B-S: N(d2_Kput) - N(d2_Kcall) = probAbove(Kput) + probBelow(Kcall) - 1
  const pop = Math.max(0, bp.pop + bc.pop - 100);
  const theta = bp.thetaPerDay + bc.thetaPerDay;
  const ev = (pop / 100) * credit - (1 - pop / 100) * maxLoss;
  return {
    id: `ic-${bp.shortPutStrike}-${bc.shortCallStrike}-${bp.dte}`,
    type: 'iron-condor',
    dte: bp.dte,
    shortPutStrike: bp.shortPutStrike,
    longPutStrike: bp.longPutStrike,
    shortCallStrike: bc.shortCallStrike,
    longCallStrike: bc.longCallStrike,
    creditPerContract: parseFloat(credit.toFixed(2)),
    maxLossPerContract: parseFloat(maxLoss.toFixed(2)),
    pop: parseFloat(pop.toFixed(1)),
    thetaPerDay: parseFloat(theta.toFixed(2)),
    ev: parseFloat(ev.toFixed(2)),
    breakevenLow: bp.breakevenLow,
    breakevenHigh: bc.breakevenHigh,
    shortDelta: Math.max(bp.shortDelta, bc.shortDelta),
    creditToWidth: parseFloat((credit / (spreadWidth * 100)).toFixed(3)),
  };
}

/* ── Full scan ──────────────────────────────────────────────────── */
function runScan(
  spot: number, sigma: number, rate: number,
  dtes: number[], spreadWidth: number, minPoP: number,
  strategies: StratType[],
): ScanResult[] {
  const sw = autoStrikeWidth(spot);
  const strikes = generateStrikes(spot, sw);
  const all: ScanResult[] = [];

  for (const dte of dtes) {
    const bullPuts: ScanResult[]  = [];
    const bearCalls: ScanResult[] = [];

    for (const shortK of strikes) {
      if (strategies.includes('bull-put') || strategies.includes('iron-condor')) {
        const longK = parseFloat((shortK - spreadWidth).toFixed(2));
        const r = mkBullPut(spot, sigma, rate, shortK, longK, dte, spreadWidth);
        if (r) bullPuts.push(r);
      }
      if (strategies.includes('bear-call') || strategies.includes('iron-condor')) {
        const longK = parseFloat((shortK + spreadWidth).toFixed(2));
        const r = mkBearCall(spot, sigma, rate, shortK, longK, dte, spreadWidth);
        if (r) bearCalls.push(r);
      }
    }

    if (strategies.includes('bull-put'))  all.push(...bullPuts);
    if (strategies.includes('bear-call')) all.push(...bearCalls);

    if (strategies.includes('iron-condor') && bullPuts.length && bearCalls.length) {
      // Best EV iron condor per DTE
      const bestEVBP = bullPuts.reduce((a, b) => a.ev > b.ev ? a : b);
      const bestEVBC = bearCalls.reduce((a, b) => a.ev > b.ev ? a : b);
      const ic1 = mkIronCondor(bestEVBP, bestEVBC, spreadWidth);
      if (ic1) all.push(ic1);

      // Highest PoP iron condor per DTE
      const highPopBP = bullPuts.reduce((a, b) => a.pop > b.pop ? a : b);
      const highPopBC = bearCalls.reduce((a, b) => a.pop > b.pop ? a : b);
      if (highPopBP.id !== bestEVBP.id || highPopBC.id !== bestEVBC.id) {
        const ic2 = mkIronCondor(highPopBP, highPopBC, spreadWidth);
        if (ic2) all.push({ ...ic2, id: ic2.id + '-hp' });
      }

      // Balanced IC: 0.30-delta legs (most common "standard" IC)
      const bal30BP = bullPuts.reduce((a, b) => Math.abs(a.shortDelta - 0.30) < Math.abs(b.shortDelta - 0.30) ? a : b);
      const bal30BC = bearCalls.reduce((a, b) => Math.abs(a.shortDelta - 0.30) < Math.abs(b.shortDelta - 0.30) ? a : b);
      if (bal30BP.id !== bestEVBP.id) {
        const ic3 = mkIronCondor(bal30BP, bal30BC, spreadWidth);
        if (ic3) all.push({ ...ic3, id: ic3.id + '-bal' });
      }
    }
  }

  return all
    .filter((r) => r.pop >= minPoP && r.ev > 0)
    .sort((a, b) => b.ev - a.ev);
}

/* ── Compact TradingView chart ──────────────────────────────────── */
function TVMini({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    const wd = document.createElement('div');
    wd.className = 'tradingview-widget-container__widget';
    wd.style.cssText = 'height:300px;width:100%';
    ref.current.appendChild(wd);
    const sc = document.createElement('script');
    sc.type = 'text/javascript';
    sc.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    sc.async = true;
    sc.innerHTML = JSON.stringify({
      width: '100%', height: 300, symbol,
      interval: 'D', timezone: 'America/New_York', theme: 'light',
      style: '1', locale: 'en',
      enable_publishing: false, allow_symbol_change: false,
      hide_side_toolbar: true, withdateranges: false,
      save_image: false,
      studies: [
        { id: 'MAExp@tv-basicstudies', inputs: { length: 20 } },
        { id: 'MAExp@tv-basicstudies', inputs: { length: 50 } },
        { id: 'Volume@tv-basicstudies' },
      ],
    });
    ref.current.appendChild(sc);
  }, [symbol]);
  return <div className="tradingview-widget-container" ref={ref} style={{ height: 300, width: '100%' }} />;
}

/* ── Market Bias Bar ───────────────────────────────────────────── */
function BiasBar({ md, iv, ivSource }: { md: MarketData; iv: number; ivSource: 'hv20' | 'manual' }) {
  const biasColor = md.bias === 'bullish' ? 'text-green-600' : md.bias === 'bearish' ? 'text-red-600' : 'text-gray-600';
  const biasIcon  = md.bias === 'bullish' ? '▲ Bullish'    : md.bias === 'bearish' ? '▼ Bearish'    : '→ Neutral';
  const biasTip   = md.bias === 'bullish'
    ? 'Price > EMA20 — Bull Put Spreads have statistical edge'
    : md.bias === 'bearish'
    ? 'Price < EMA20 — Bear Call Spreads have statistical edge'
    : 'Price ≈ EMA20 — Iron Condors suit rangebound conditions';
  const pctFromEMA = ((md.price - md.ema20) / md.ema20 * 100).toFixed(1);
  const hvDiff = iv - md.hv20;
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4 flex flex-wrap items-center gap-6 text-sm">
      <div>
        <span className="text-xs text-gray-400 block">Last Price</span>
        <span className="font-bold text-gray-800 text-lg">${md.price.toFixed(2)}</span>
      </div>
      <div>
        <span className="text-xs text-gray-400 block">HV10 / HV20 / HV30</span>
        <span className="font-semibold text-gray-700">{md.hv10}% / {md.hv20}% / {md.hv30}%</span>
      </div>
      <div>
        <span className="text-xs text-gray-400 block">Scanning IV ({ivSource === 'hv20' ? 'auto=HV20' : 'manual'})</span>
        <span className="font-semibold text-indigo-600">{iv.toFixed(1)}%</span>
        {ivSource === 'manual' && (
          <span className={`ml-2 text-xs ${hvDiff > 3 ? 'text-red-500' : hvDiff < -3 ? 'text-green-500' : 'text-gray-500'}`}>
            {hvDiff > 0 ? '+' : ''}{hvDiff.toFixed(1)}% vs HV20
          </span>
        )}
      </div>
      <div>
        <span className="text-xs text-gray-400 block">EMA20</span>
        <span className="font-semibold text-gray-700">
          ${md.ema20.toFixed(2)}
          <span className={`ml-1 text-xs ${parseFloat(pctFromEMA) > 0 ? 'text-green-600' : 'text-red-600'}`}>
            ({pctFromEMA}%)
          </span>
        </span>
      </div>
      <div className="ml-auto">
        <span className="text-xs text-gray-400 block">Market Bias</span>
        <span className={`font-bold text-base ${biasColor}`}>{biasIcon}</span>
        <span className="text-xs text-gray-500 block max-w-xs">{biasTip}</span>
      </div>
    </div>
  );
}

/* ── PoP badge ──────────────────────────────────────────────────── */
function PoPBadge({ pop }: { pop: number }) {
  const cls = pop >= 80 ? 'bg-green-100 text-green-800' :
              pop >= 70 ? 'bg-lime-100   text-lime-800'  :
              pop >= 60 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100   text-red-800';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{pop.toFixed(1)}%</span>;
}

function TypeBadge({ type }: { type: StratType }) {
  const map: Record<StratType, string> = {
    'bull-put':     'bg-green-600 text-white',
    'bear-call':    'bg-red-600   text-white',
    'iron-condor':  'bg-blue-600  text-white',
  };
  const label: Record<StratType, string> = {
    'bull-put':    'Bull Put',
    'bear-call':   'Bear Call',
    'iron-condor': 'Iron Condor',
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${map[type]}`}>{label[type]}</span>;
}

/* ── Strikes display ────────────────────────────────────────────── */
function StrikeLabel({ r }: { r: ScanResult }) {
  if (r.type === 'bull-put')
    return <span className="font-mono text-xs">{r.shortPutStrike}P / {r.longPutStrike}P</span>;
  if (r.type === 'bear-call')
    return <span className="font-mono text-xs">{r.shortCallStrike}C / {r.longCallStrike}C</span>;
  return (
    <span className="font-mono text-xs">
      {r.longPutStrike}P / <strong>{r.shortPutStrike}P</strong> — <strong>{r.shortCallStrike}C</strong> / {r.longCallStrike}C
    </span>
  );
}

/* ── Top Opportunity Card ───────────────────────────────────────── */
function TopCard({ result, symbol, rank }: { result: ScanResult; symbol: string; rank: string }) {
  const bg: Record<StratType, string> = {
    'bull-put':    'border-green-200 bg-green-50',
    'bear-call':   'border-red-200   bg-red-50',
    'iron-condor': 'border-blue-200  bg-blue-50',
  };
  const label: Record<StratType, string> = { 'bull-put': '📈', 'bear-call': '📉', 'iron-condor': '↔️' };

  const strikes =
    result.type === 'bull-put'
      ? `Short ${result.shortPutStrike}P / Long ${result.longPutStrike}P`
      : result.type === 'bear-call'
      ? `Short ${result.shortCallStrike}C / Long ${result.longCallStrike}C`
      : `${result.longPutStrike}P/${result.shortPutStrike}P — ${result.shortCallStrike}C/${result.longCallStrike}C`;

  const narrative =
    result.type === 'bull-put'
      ? `Sell the ${result.shortPutStrike} put, buy the ${result.longPutStrike} put as protection. Collect $${result.creditPerContract.toFixed(0)} upfront. As long as ${symbol} stays above $${result.breakevenLow?.toFixed(2)} at expiry, you keep the full credit. Max loss: $${result.maxLossPerContract.toFixed(0)}.`
      : result.type === 'bear-call'
      ? `Sell the ${result.shortCallStrike} call, buy the ${result.longCallStrike} call as protection. Collect $${result.creditPerContract.toFixed(0)} upfront. As long as ${symbol} stays below $${result.breakevenHigh?.toFixed(2)} at expiry, you keep the full credit. Max loss: $${result.maxLossPerContract.toFixed(0)}.`
      : `Sell the ${result.shortPutStrike}/${result.longPutStrike} put spread + the ${result.shortCallStrike}/${result.longCallStrike} call spread. Collect $${result.creditPerContract.toFixed(0)} total. Profit zone: $${result.breakevenLow?.toFixed(2)} – $${result.breakevenHigh?.toFixed(2)}. Both spreads expire worthless within that range. Max loss: $${result.maxLossPerContract.toFixed(0)}.`;

  return (
    <div className={`rounded-xl border p-5 shadow-sm ${bg[result.type]}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-lg mr-2">{label[result.type]}</span>
          <TypeBadge type={result.type} />
          <span className="ml-2 text-xs text-gray-500 font-medium">{rank}</span>
        </div>
        <PoPBadge pop={result.pop} />
      </div>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{result.dte} DTE — {strikes}</p>
      <p className="text-sm text-gray-700 leading-relaxed mb-4">{narrative}</p>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Credit', value: `$${result.creditPerContract.toFixed(0)}` },
          { label: 'Max Loss', value: `$${result.maxLossPerContract.toFixed(0)}` },
          { label: 'Θ/day', value: `$${result.thetaPerDay.toFixed(2)}` },
          { label: 'PoP', value: `${result.pop.toFixed(1)}%` },
          { label: 'Exp. Value', value: `$${result.ev.toFixed(0)}` },
          { label: 'Credit/Width', value: `${(result.creditToWidth * 100).toFixed(0)}%` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white bg-opacity-60 rounded-lg p-2">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-sm font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Results table ──────────────────────────────────────────────── */
function ScanTable({
  results, sortKey, sortDir, onSort, activeType,
}: {
  results: ScanResult[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  activeType: StratType | 'all';
}) {
  const displayed = activeType === 'all' ? results : results.filter((r) => r.type === activeType);
  const arrow = (k: SortKey) => sortKey === k ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '';

  const thCls = 'text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-indigo-600 select-none whitespace-nowrap';
  const tdCls = 'py-2 px-3 text-sm';

  if (!displayed.length) return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-10 text-center text-gray-400 text-sm">
      No results match your filters. Try lowering Min PoP or adding more DTEs.
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
      <table className="w-full min-w-[800px]">
        <thead className="border-b border-gray-100 bg-gray-50">
          <tr>
            <th className={thCls} onClick={() => onSort('dte')}>DTE{arrow('dte')}</th>
            <th className={thCls}>Type</th>
            <th className={thCls}>Strikes</th>
            <th className={thCls} onClick={() => onSort('credit')}>Credit{arrow('credit')}</th>
            <th className={thCls} onClick={() => onSort('maxLoss')}>Max Loss{arrow('maxLoss')}</th>
            <th className={thCls} onClick={() => onSort('pop')}>PoP{arrow('pop')}</th>
            <th className={thCls} onClick={() => onSort('theta')}>Θ/day{arrow('theta')}</th>
            <th className={thCls} onClick={() => onSort('ev')}>Exp. Value{arrow('ev')}</th>
            <th className={thCls} onClick={() => onSort('creditToWidth')}>Credit/Width{arrow('creditToWidth')}</th>
            <th className={thCls}>Breakeven(s)</th>
          </tr>
        </thead>
        <tbody>
          {displayed.slice(0, 60).map((r, i) => (
            <tr key={r.id} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} hover:bg-indigo-50/40 transition-colors`}>
              <td className={tdCls + ' font-mono text-gray-700'}>{r.dte}d</td>
              <td className={tdCls}><TypeBadge type={r.type} /></td>
              <td className={tdCls}><StrikeLabel r={r} /></td>
              <td className={tdCls + ' text-green-700 font-semibold'}>${r.creditPerContract.toFixed(0)}</td>
              <td className={tdCls + ' text-red-600'}>${r.maxLossPerContract.toFixed(0)}</td>
              <td className={tdCls}><PoPBadge pop={r.pop} /></td>
              <td className={tdCls + ' text-indigo-600 font-medium'}>${r.thetaPerDay.toFixed(2)}</td>
              <td className={tdCls + ` font-bold ${r.ev >= 0 ? 'text-green-700' : 'text-red-600'}`}>${r.ev.toFixed(0)}</td>
              <td className={tdCls + ' text-gray-600'}>{(r.creditToWidth * 100).toFixed(0)}%</td>
              <td className={tdCls + ' font-mono text-xs text-gray-600'}>
                {r.breakevenLow ? `↑ $${r.breakevenLow}` : ''}{r.breakevenLow && r.breakevenHigh ? ' / ' : ''}{r.breakevenHigh ? `↓ $${r.breakevenHigh}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {displayed.length > 60 && (
        <p className="text-xs text-gray-400 text-center py-2">Showing top 60 of {displayed.length} results</p>
      )}
    </div>
  );
}

/* ── Legend / glossary ──────────────────────────────────────────── */
function GlossaryRow({ term, def }: { term: string; def: string }) {
  return <div className="flex gap-3 text-xs"><span className="font-semibold text-gray-700 w-24 shrink-0">{term}</span><span className="text-gray-500">{def}</span></div>;
}

/* ── Main page ──────────────────────────────────────────────────── */
const QUICK = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'META', 'AMZN'];
const DTE_OPTIONS = [7, 14, 21, 30, 45, 60];
const WIDTH_OPTIONS = [5, 10, 25, 50];
const MIN_POP_OPTIONS = [55, 60, 65, 70, 75, 80];

export default function ScannerPage() {
  const [symbol, setSymbol] = useState('SPY');
  const [input, setInput] = useState('SPY');

  // Scanner params
  const [selectedDTEs, setSelectedDTEs]   = useState<number[]>([21, 30, 45]);
  const [spreadWidth, setSpreadWidth]     = useState(10);
  const [minPoP, setMinPoP]               = useState(65);
  const [strategies, setStrategies]       = useState<StratType[]>(['bull-put', 'bear-call', 'iron-condor']);
  const [ivSource, setIvSource]           = useState<'hv20' | 'manual'>('hv20');
  const [manualIV, setManualIV]           = useState('');

  // Data & results
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [lastScanned, setLastScanned] = useState('');

  // Table state
  const [sortKey, setSortKey]   = useState<SortKey>('ev');
  const [sortDir, setSortDir]   = useState<SortDir>('desc');
  const [activeType, setActiveType] = useState<StratType | 'all'>('all');

  const fetchAndScan = useCallback(async (sym: string) => {
    setLoading(true);
    setError('');
    setScanResults([]);
    try {
      const res = await fetch(`/api/market/candles?symbol=${encodeURIComponent(sym)}&range=full`);
      if (!res.ok) throw new Error(`Failed to fetch data for ${sym}`);
      const json = await res.json();
      const closes: number[] = json.candles?.map((c: { close: number }) => c.close) ?? [];
      if (!closes.length) throw new Error('No price data returned');

      const price = closes.at(-1)!;
      const hv10 = calcHV(closes, 10);
      const hv20 = calcHV(closes, 20);
      const hv30 = calcHV(closes, 30);
      const ema20 = calcEMA(closes, 20);
      const pctFromEMA = (price - ema20) / ema20 * 100;
      const bias: Bias = pctFromEMA > 1 ? 'bullish' : pctFromEMA < -1 ? 'bearish' : 'neutral';

      const md: MarketData = { price, hv10, hv20, hv30, ema20, bias };
      setMarketData(md);

      const iv = ivSource === 'manual' && parseFloat(manualIV) > 0
        ? parseFloat(manualIV)
        : hv20;

      const results = runScan(price, iv / 100, 0.045, selectedDTEs, spreadWidth, minPoP, strategies);
      setScanResults(sortResults(results, sortKey, sortDir));
      setLastScanned(new Date().toLocaleTimeString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  }, [ivSource, manualIV, selectedDTEs, spreadWidth, minPoP, strategies, sortKey, sortDir]);

  useEffect(() => { fetchAndScan(symbol); }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  function sortResults(r: ScanResult[], key: SortKey, dir: SortDir): ScanResult[] {
    return [...r].sort((a, b) => {
      const vals: Record<SortKey, number> = {
        pop: a.pop - b.pop, ev: a.ev - b.ev, credit: a.creditPerContract - b.creditPerContract,
        theta: a.thetaPerDay - b.thetaPerDay, dte: a.dte - b.dte,
        maxLoss: a.maxLossPerContract - b.maxLossPerContract,
        creditToWidth: a.creditToWidth - b.creditToWidth,
      };
      return dir === 'desc' ? -(vals[key]) : vals[key];
    });
  }

  const handleSort = (key: SortKey) => {
    const newDir: SortDir = sortKey === key && sortDir === 'desc' ? 'asc' : 'desc';
    setSortKey(key);
    setSortDir(newDir);
    setScanResults(sortResults(scanResults, key, newDir));
  };

  const handleSymbol = (sym: string) => {
    setSymbol(sym.toUpperCase());
    setInput(sym.toUpperCase());
  };

  const toggleDTE = (d: number) =>
    setSelectedDTEs((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);

  const toggleStrategy = (s: StratType) =>
    setStrategies((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const handleRescan = () => fetchAndScan(symbol);

  const iv = ivSource === 'manual' && parseFloat(manualIV) > 0
    ? parseFloat(manualIV)
    : marketData?.hv20 ?? 0;

  // Top picks per type
  const topBP = scanResults.find((r) => r.type === 'bull-put');
  const topBC = scanResults.find((r) => r.type === 'bear-call');
  const topIC = scanResults.find((r) => r.type === 'iron-condor');

  const inputCls = 'border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300';

  return (
    <Layout title="Options Scanner">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h1 className="text-xl font-bold text-gray-800 shrink-0">Options Scanner</h1>
            <p className="text-xs text-gray-400">High-probability credit strategies ranked by Expected Value</p>
            <form onSubmit={(e) => { e.preventDefault(); handleSymbol(input); }} className="flex gap-2 ml-auto">
              <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="TICKER…" className={`${inputCls} w-28`} />
              <button type="submit" className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700">Go</button>
            </form>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((t) => (
              <button key={t} onClick={() => handleSymbol(t)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${symbol === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* ── TV Chart ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <TVMini key={symbol} symbol={symbol} />
        </div>

        {/* ── Market Context ── */}
        {marketData && <BiasBar md={marketData} iv={iv} ivSource={ivSource} />}

        {/* ── Scanner Controls ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Scanner Controls</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

            {/* DTEs */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Expiration (DTE)</label>
              <div className="flex flex-wrap gap-2">
                {DTE_OPTIONS.map((d) => (
                  <button key={d} onClick={() => toggleDTE(d)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${selectedDTEs.includes(d) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {/* Spread width */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Spread Width ($)</label>
              <div className="flex flex-wrap gap-2">
                {WIDTH_OPTIONS.map((w) => (
                  <button key={w} onClick={() => setSpreadWidth(w)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${spreadWidth === w ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                    ${w}
                  </button>
                ))}
              </div>
            </div>

            {/* Min PoP */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Min Probability of Profit</label>
              <div className="flex flex-wrap gap-2">
                {MIN_POP_OPTIONS.map((p) => (
                  <button key={p} onClick={() => setMinPoP(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${minPoP === p ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                    {p}%
                  </button>
                ))}
              </div>
            </div>

            {/* Strategies + IV */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Strategies</label>
                <div className="flex flex-wrap gap-2">
                  {(['bull-put', 'bear-call', 'iron-condor'] as StratType[]).map((s) => (
                    <button key={s} onClick={() => toggleStrategy(s)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${strategies.includes(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                      {s === 'bull-put' ? 'Bull Put' : s === 'bear-call' ? 'Bear Call' : 'IC'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">IV Source</label>
                <div className="flex items-center gap-2">
                  <select value={ivSource} onChange={(e) => setIvSource(e.target.value as 'hv20' | 'manual')} className={inputCls}>
                    <option value="hv20">Auto (HV20{marketData ? ` = ${marketData.hv20}%` : ''})</option>
                    <option value="manual">Manual</option>
                  </select>
                  {ivSource === 'manual' && (
                    <input value={manualIV} onChange={(e) => setManualIV(e.target.value)} placeholder="e.g. 20" className={`${inputCls} w-20`} />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-5 pt-4 border-t border-gray-100">
            <button onClick={handleRescan} disabled={loading || selectedDTEs.length === 0 || strategies.length === 0}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2">
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Scanning…</>
              ) : '🔍 Run Scan'}
            </button>
            {lastScanned && !loading && <span className="text-xs text-gray-400">Last scanned at {lastScanned} · {scanResults.length} results</span>}
            {error && <span className="text-xs text-red-500">{error}</span>}
          </div>
        </div>

        {/* ── Top opportunities ── */}
        {!loading && (topBP || topBC || topIC) && (
          <div>
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-widest mb-3">Top Opportunities</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {topBP && <TopCard result={topBP} symbol={symbol} rank="Best Bull Put" />}
              {topBC && <TopCard result={topBC} symbol={symbol} rank="Best Bear Call" />}
              {topIC && <TopCard result={topIC} symbol={symbol} rank="Best Iron Condor" />}
            </div>
          </div>
        )}

        {/* ── Full results table ── */}
        {!loading && scanResults.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-bold text-gray-600 uppercase tracking-widest">All Results</h2>
              <div className="flex gap-1.5">
                {(['all', 'bull-put', 'bear-call', 'iron-condor'] as const).map((t) => (
                  <button key={t} onClick={() => setActiveType(t)}
                    className={`px-3 py-1 rounded text-xs font-semibold border transition-colors ${activeType === t ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                    {t === 'all' ? 'All' : t === 'bull-put' ? 'Bull Put' : t === 'bear-call' ? 'Bear Call' : 'Iron Condor'}
                  </button>
                ))}
              </div>
            </div>
            <ScanTable results={scanResults} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} activeType={activeType} />
          </div>
        )}

        {/* ── Glossary ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Column Guide</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <GlossaryRow term="PoP" def="Probability of Profit — exact Black-Scholes risk-neutral probability the trade expires fully profitable." />
            <GlossaryRow term="Exp. Value" def="Expected Value = (PoP × credit) − (loss prob × max loss). Positive EV = mathematical edge exists." />
            <GlossaryRow term="Θ / day" def="Net theta collected per day per contract ($) from time decay working in your favour." />
            <GlossaryRow term="Credit/Width" def="Premium collected ÷ spread width. Higher = more of the max profit captured upfront (good for credit sellers)." />
            <GlossaryRow term="Breakeven" def="Stock price at expiry where the trade breaks even — stay beyond this and you lose money." />
            <GlossaryRow term="IV Source" def="Auto uses HV20 (historical volatility) as a proxy for IV. Enter your broker's actual IV for more accurate pricing." />
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          All pricing via Black-Scholes model using Yahoo Finance historical data.
          For educational use only — not financial advice. Always verify with your broker&apos;s live quotes.
        </p>
      </div>
    </Layout>
  );
}
