import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Layout } from '@/components/Layout';
import { calculateCallGreeks, calculatePutGreeks } from '@/lib/greeks';
import { useTradeStore } from '@/store/tradeStore';
import type { OptionContract, OptionsChainResponse } from '@/pages/api/options/chain';

/* ── Types ──────────────────────────────────────────────────────── */
type StratType = 'bull-put' | 'bear-call' | 'iron-condor';
type SortKey = 'pop' | 'ev' | 'credit' | 'theta' | 'dte' | 'maxLoss' | 'creditToWidth' | 'riskReward';
type SortDir = 'asc' | 'desc';
type Bias = 'bullish' | 'bearish' | 'neutral';

interface Spread {
  id: string;
  type: StratType;
  dte: number;
  expirationStr: string;
  shortPut?: OptionContract;
  longPut?: OptionContract;
  shortCall?: OptionContract;
  longCall?: OptionContract;
  creditPerContract: number;
  maxLossPerContract: number;
  spreadWidth: number;
  pop: number;
  thetaPerDay: number;
  ev: number;
  breakevenLow?: number;
  breakevenHigh?: number;
  shortDelta: number;
  creditToWidth: number;
  avgIV: number;
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

// P(S_T > K) — bull put profits
const probAbove = (S: number, K: number, T: number, s: number, r: number) =>
  normCDF(calcD2(S, K, T, s, r));

// P(S_T < K) — bear call profits
const probBelow = (S: number, K: number, T: number, s: number, r: number) =>
  1 - normCDF(calcD2(S, K, T, s, r));

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

/* ── DTE helper ─────────────────────────────────────────────────── */
function dteTill(exStr: string): number {
  const exp = new Date(exStr + 'T16:00:00-05:00');
  return Math.max(1, Math.round((exp.getTime() - Date.now()) / 86400000));
}

/* ── Build spreads from real options chain ──────────────────────── */
function buildBullPuts(
  puts: OptionContract[], spot: number, r: number,
  minPoP: number, targetWidths: number[],
): Spread[] {
  const results: Spread[] = [];
  const byExp: Record<string, OptionContract[]> = {};
  for (const c of puts) (byExp[c.expirationStr] ??= []).push(c);

  for (const [exStr, contracts] of Object.entries(byExp)) {
    const dte = dteTill(exStr);
    const T = dte / 365;
    const sorted = [...contracts].sort((a, b) => b.strike - a.strike);

    for (const shortP of sorted) {
      if (shortP.strike >= spot) continue;
      if (shortP.strike < spot * 0.5) continue; // filter stale/pre-split strikes
      if (shortP.mid <= 0) continue;
      const sigma = shortP.impliedVolatility || 0.20;
      const pop = probAbove(spot, shortP.strike, T, sigma, r) * 100;
      if (pop < minPoP) continue;

      for (const w of targetWidths) {
        const longP = sorted.find((c) => Math.abs(c.strike - (shortP.strike - w)) < w * 0.4 && c.strike < shortP.strike);
        if (!longP || longP.mid <= 0) continue;
        const actualWidth = shortP.strike - longP.strike;
        const credit = (shortP.mid - longP.mid) * 100;
        if (credit < 5) continue;
        const maxLoss = actualWidth * 100 - credit;
        if (maxLoss <= 0) continue;
        const inp = (K: number, iv: number) => ({ spotPrice: spot, strikePrice: K, timeToExpiration: T, volatility: iv, riskFreeRate: r });
        const sg = calculatePutGreeks(inp(shortP.strike, sigma));
        const lg = calculatePutGreeks(inp(longP.strike, longP.impliedVolatility || 0.20));
        const theta = ((lg.theta ?? 0) - (sg.theta ?? 0)) * 100;
        const ev = (pop / 100) * credit - (1 - pop / 100) * maxLoss;
        results.push({
          id: `bp-${exStr}-${shortP.strike}-${longP.strike}`,
          type: 'bull-put', dte, expirationStr: exStr,
          shortPut: shortP, longPut: longP,
          creditPerContract: parseFloat(credit.toFixed(2)),
          maxLossPerContract: parseFloat(maxLoss.toFixed(2)),
          spreadWidth: actualWidth,
          pop: parseFloat(pop.toFixed(1)),
          thetaPerDay: parseFloat(theta.toFixed(2)),
          ev: parseFloat(ev.toFixed(2)),
          breakevenLow: parseFloat((shortP.strike - credit / 100).toFixed(2)),
          shortDelta: parseFloat(Math.abs(sg.delta ?? 0).toFixed(3)),
          creditToWidth: parseFloat((credit / (actualWidth * 100)).toFixed(3)),
          avgIV: parseFloat(((shortP.impliedVolatility + longP.impliedVolatility) / 2 * 100).toFixed(1)),
        });
      }
    }
  }
  return results;
}

function buildBearCalls(
  calls: OptionContract[], spot: number, r: number,
  minPoP: number, targetWidths: number[],
): Spread[] {
  const results: Spread[] = [];
  const byExp: Record<string, OptionContract[]> = {};
  for (const c of calls) (byExp[c.expirationStr] ??= []).push(c);

  for (const [exStr, contracts] of Object.entries(byExp)) {
    const dte = dteTill(exStr);
    const T = dte / 365;
    const sorted = [...contracts].sort((a, b) => a.strike - b.strike);

    for (const shortC of sorted) {
      if (shortC.strike <= spot) continue;
      if (shortC.strike > spot * 1.5) continue; // filter stale/pre-split strikes
      if (shortC.mid <= 0) continue;
      const sigma = shortC.impliedVolatility || 0.20;
      const pop = probBelow(spot, shortC.strike, T, sigma, r) * 100;
      if (pop < minPoP) continue;

      for (const w of targetWidths) {
        const longC = sorted.find((c) => Math.abs(c.strike - (shortC.strike + w)) < w * 0.4 && c.strike > shortC.strike);
        if (!longC || longC.mid <= 0) continue;
        const actualWidth = longC.strike - shortC.strike;
        const credit = (shortC.mid - longC.mid) * 100;
        if (credit < 5) continue;
        const maxLoss = actualWidth * 100 - credit;
        if (maxLoss <= 0) continue;
        const inp = (K: number, iv: number) => ({ spotPrice: spot, strikePrice: K, timeToExpiration: T, volatility: iv, riskFreeRate: r });
        const sg = calculateCallGreeks(inp(shortC.strike, sigma));
        const lg = calculateCallGreeks(inp(longC.strike, longC.impliedVolatility || 0.20));
        const theta = ((lg.theta ?? 0) - (sg.theta ?? 0)) * 100;
        const ev = (pop / 100) * credit - (1 - pop / 100) * maxLoss;
        results.push({
          id: `bc-${exStr}-${shortC.strike}-${longC.strike}`,
          type: 'bear-call', dte, expirationStr: exStr,
          shortCall: shortC, longCall: longC,
          creditPerContract: parseFloat(credit.toFixed(2)),
          maxLossPerContract: parseFloat(maxLoss.toFixed(2)),
          spreadWidth: actualWidth,
          pop: parseFloat(pop.toFixed(1)),
          thetaPerDay: parseFloat(theta.toFixed(2)),
          ev: parseFloat(ev.toFixed(2)),
          breakevenHigh: parseFloat((shortC.strike + credit / 100).toFixed(2)),
          shortDelta: parseFloat(Math.abs(sg.delta ?? 0).toFixed(3)),
          creditToWidth: parseFloat((credit / (actualWidth * 100)).toFixed(3)),
          avgIV: parseFloat(((shortC.impliedVolatility + longC.impliedVolatility) / 2 * 100).toFixed(1)),
        });
      }
    }
  }
  return results;
}

function buildIronCondors(bullPuts: Spread[], bearCalls: Spread[]): Spread[] {
  const results: Spread[] = [];
  const bpByExp: Record<string, Spread[]> = {};
  const bcByExp: Record<string, Spread[]> = {};
  for (const s of bullPuts)  (bpByExp[s.expirationStr] ??= []).push(s);
  for (const s of bearCalls) (bcByExp[s.expirationStr] ??= []).push(s);

  for (const exStr of Object.keys(bpByExp)) {
    const bps = bpByExp[exStr] ?? [];
    const bcs = bcByExp[exStr] ?? [];
    if (!bps.length || !bcs.length) continue;
    const topBPs = [...bps].sort((a, b) => b.ev - a.ev).slice(0, 3);
    const topBCs = [...bcs].sort((a, b) => b.ev - a.ev).slice(0, 3);
    for (const bp of topBPs) {
      for (const bc of topBCs) {
        if (!bp.shortPut || !bc.shortCall) continue;
        if (bp.shortPut.strike >= bc.shortCall.strike) continue;
        const credit = bp.creditPerContract + bc.creditPerContract;
        const maxLoss = Math.max(bp.maxLossPerContract, bc.maxLossPerContract);
        if (credit < 10) continue;
        const pop = Math.max(0, bp.pop + bc.pop - 100);
        const ev = (pop / 100) * credit - (1 - pop / 100) * maxLoss;
        if (ev <= 0) continue;
        results.push({
          id: `ic-${exStr}-${bp.shortPut.strike}-${bc.shortCall.strike}`,
          type: 'iron-condor', dte: bp.dte, expirationStr: exStr,
          shortPut: bp.shortPut, longPut: bp.longPut,
          shortCall: bc.shortCall, longCall: bc.longCall,
          creditPerContract: parseFloat(credit.toFixed(2)),
          maxLossPerContract: parseFloat(maxLoss.toFixed(2)),
          spreadWidth: Math.max(bp.spreadWidth, bc.spreadWidth),
          pop: parseFloat(pop.toFixed(1)),
          thetaPerDay: parseFloat((bp.thetaPerDay + bc.thetaPerDay).toFixed(2)),
          ev: parseFloat(ev.toFixed(2)),
          breakevenLow: bp.breakevenLow,
          breakevenHigh: bc.breakevenHigh,
          shortDelta: Math.max(bp.shortDelta, bc.shortDelta),
          creditToWidth: parseFloat((credit / (Math.max(bp.spreadWidth, bc.spreadWidth) * 100)).toFixed(3)),
          avgIV: parseFloat(((bp.avgIV + bc.avgIV) / 2).toFixed(1)),
        });
      }
    }
  }
  return results;
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
function BiasBar({ md, chainIV }: { md: MarketData; chainIV: number }) {
  const biasColor = md.bias === 'bullish' ? 'text-green-600' : md.bias === 'bearish' ? 'text-red-600' : 'text-gray-600';
  const biasIcon  = md.bias === 'bullish' ? '▲ Bullish' : md.bias === 'bearish' ? '▼ Bearish' : '→ Neutral';
  const biasTip   = md.bias === 'bullish'
    ? 'Price > EMA20 — Bull Put Spreads have statistical edge'
    : md.bias === 'bearish'
    ? 'Price < EMA20 — Bear Call Spreads have statistical edge'
    : 'Price ≈ EMA20 — Iron Condors suit rangebound conditions';
  const pctFromEMA = ((md.price - md.ema20) / md.ema20 * 100).toFixed(1);
  const ivPremium  = chainIV > 0 ? ((chainIV - md.hv20) / md.hv20 * 100).toFixed(0) : null;
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
      {chainIV > 0 && (
        <div>
          <span className="text-xs text-gray-400 block">Avg ATM IV (real chain)</span>
          <span className="font-semibold text-indigo-600">{chainIV.toFixed(1)}%</span>
          {ivPremium && (
            <span className={`ml-2 text-xs ${parseInt(ivPremium) > 10 ? 'text-red-500' : parseInt(ivPremium) < -10 ? 'text-green-500' : 'text-gray-500'}`}>
              {parseInt(ivPremium) > 0 ? '+' : ''}{ivPremium}% vs HV20
            </span>
          )}
        </div>
      )}
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
function StrikeLabel({ r }: { r: Spread }) {
  if (r.type === 'bull-put')
    return <span className="font-mono text-xs">{r.shortPut?.strike}P / {r.longPut?.strike}P</span>;
  if (r.type === 'bear-call')
    return <span className="font-mono text-xs">{r.shortCall?.strike}C / {r.longCall?.strike}C</span>;
  return (
    <span className="font-mono text-xs">
      {r.longPut?.strike}P / <strong>{r.shortPut?.strike}P</strong>
      {' — '}
      <strong>{r.shortCall?.strike}C</strong> / {r.longCall?.strike}C
    </span>
  );
}

/* ── Top Opportunity Card ───────────────────────────────────────── */
function TopCard({ result, symbol, rank }: { result: Spread; symbol: string; rank: string }) {
  const { createTrade } = useTradeStore();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const addToJournal = async () => {
    setSaving(true);
    setSaveError('');

    // Build legs from spread data
    const legs: { direction: 'long' | 'short'; type: 'call' | 'put'; strikePrice: number; expirationDate: string; quantity: number; entryPrice: number }[] = [];
    if (result.shortPut) legs.push({ direction: 'short', type: 'put',  strikePrice: result.shortPut.strike,  expirationDate: result.expirationStr, quantity: 1, entryPrice: result.shortPut.mid  });
    if (result.longPut)  legs.push({ direction: 'long',  type: 'put',  strikePrice: result.longPut.strike,   expirationDate: result.expirationStr, quantity: 1, entryPrice: result.longPut.mid   });
    if (result.shortCall)legs.push({ direction: 'short', type: 'call', strikePrice: result.shortCall.strike, expirationDate: result.expirationStr, quantity: 1, entryPrice: result.shortCall.mid });
    if (result.longCall) legs.push({ direction: 'long',  type: 'call', strikePrice: result.longCall.strike,  expirationDate: result.expirationStr, quantity: 1, entryPrice: result.longCall.mid  });

    const netCost = legs.reduce((sum, leg) => {
      const val = leg.entryPrice * leg.quantity * 100;
      return sum + (leg.direction === 'long' ? val : -val);
    }, 0);

    const strategyLabel: Record<StratType, string> = {
      'bull-put': 'Bull Put Spread',
      'bear-call': 'Bear Call Spread',
      'iron-condor': 'Iron Condor',
    };

    const payload = {
      type: 'option' as const,
      symbol,
      entryDate: new Date().toISOString(),
      commission: 0,
      notes: '',
      planNotes: `${strategyLabel[result.type]} — PoP ${result.pop.toFixed(1)}% · EV $${result.ev.toFixed(0)} · Max loss $${result.maxLossPerContract.toFixed(0)}`,
      tags: [result.type, 'screener'],
      strategy: strategyLabel[result.type],
      totalPremium: Math.abs(netCost),
      totalCost: netCost,
      legs,
    };

    const trade = await createTrade(payload);
    setSaving(false);
    if (trade) {
      setSaved(true);
      setTimeout(() => router.push('/trades'), 1200);
    } else {
      setSaveError('Failed to save — are you signed in?');
    }
  };

  const bg: Record<StratType, string> = {
    'bull-put':    'border-green-200 bg-green-50',
    'bear-call':   'border-red-200 bg-red-50',
    'iron-condor': 'border-blue-200 bg-blue-50',
  };
  const icon: Record<StratType, string> = { 'bull-put': '📈', 'bear-call': '📉', 'iron-condor': '↔️' };

  const strikeText =
    result.type === 'bull-put'
      ? `Short ${result.shortPut?.strike}P / Long ${result.longPut?.strike}P`
      : result.type === 'bear-call'
      ? `Short ${result.shortCall?.strike}C / Long ${result.longCall?.strike}C`
      : `${result.longPut?.strike}P / ${result.shortPut?.strike}P — ${result.shortCall?.strike}C / ${result.longCall?.strike}C`;

  const narrative =
    result.type === 'bull-put'
      ? `Sell the ${result.shortPut?.strike} put, buy the ${result.longPut?.strike} put. Collect $${result.creditPerContract.toFixed(0)} (real bid/ask mid). ${symbol} must stay above $${result.breakevenLow?.toFixed(2)} by expiry. Max loss: $${result.maxLossPerContract.toFixed(0)}.`
      : result.type === 'bear-call'
      ? `Sell the ${result.shortCall?.strike} call, buy the ${result.longCall?.strike} call. Collect $${result.creditPerContract.toFixed(0)} (real bid/ask mid). ${symbol} must stay below $${result.breakevenHigh?.toFixed(2)} by expiry. Max loss: $${result.maxLossPerContract.toFixed(0)}.`
      : `Sell ${result.shortPut?.strike}/${result.longPut?.strike} put spread + ${result.shortCall?.strike}/${result.longCall?.strike} call spread. Collect $${result.creditPerContract.toFixed(0)} total. Profit zone: $${result.breakevenLow?.toFixed(2)} – $${result.breakevenHigh?.toFixed(2)}. Max loss: $${result.maxLossPerContract.toFixed(0)}.`;

  const rrRatio = result.maxLossPerContract > 0
    ? `1 : ${(result.maxLossPerContract / result.creditPerContract).toFixed(1)}`
    : '—';
  const rorPct = result.maxLossPerContract > 0
    ? `${((result.creditPerContract / result.maxLossPerContract) * 100).toFixed(0)}%`
    : '—';

  return (
    <div className={`rounded-xl border p-5 shadow-sm ${bg[result.type]}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon[result.type]}</span>
        <TypeBadge type={result.type} />
        <span className="text-xs text-gray-500 font-medium">{rank}</span>
      </div>

      {/* ── Expiry · Strikes · Probability — hero block ── */}
      <div className="bg-white bg-opacity-75 rounded-xl px-4 py-3 mb-3 flex flex-wrap gap-5 items-start">
        {/* Expiry */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Expiry Date</p>
          <p className="text-xl font-bold text-gray-800 font-mono leading-none">{result.expirationStr}</p>
          <p className="text-xs text-gray-400 mt-1">{result.dte} days to expiry</p>
        </div>

        <div className="w-px bg-gray-200 self-stretch hidden sm:block" />

        {/* Strikes */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Strike Prices</p>
          <p className="text-base font-bold text-gray-800 font-mono leading-none">{strikeText}</p>
          <p className="text-xs text-gray-400 mt-1">
            {result.breakevenLow  ? `BE ↑ $${result.breakevenLow}` : ''}
            {result.breakevenLow && result.breakevenHigh ? '  ·  ' : ''}
            {result.breakevenHigh ? `BE ↓ $${result.breakevenHigh}` : ''}
          </p>
        </div>

        {/* Probability — far right */}
        <div className="ml-auto text-right">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Prob. of Success</p>
          <p className="text-4xl font-extrabold text-gray-800 leading-none">{result.pop.toFixed(1)}%</p>
          <p className="text-xs text-gray-400 mt-1">B-S risk-neutral PoP</p>
        </div>
      </div>

      <p className="text-sm text-gray-700 leading-relaxed mb-4">{narrative}</p>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Credit (real)', value: `$${result.creditPerContract.toFixed(0)}` },
          { label: 'Max Loss',      value: `$${result.maxLossPerContract.toFixed(0)}` },
          { label: 'Risk : Reward', value: rrRatio },
          { label: 'Return on Risk', value: rorPct },
          { label: 'Exp. Value',    value: `$${result.ev.toFixed(0)}` },
          { label: 'Θ / day',       value: `$${result.thetaPerDay.toFixed(2)}` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white bg-opacity-60 rounded-lg p-2">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-sm font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      {/* Add to Journal */}
      <div className="mt-4">
        {saveError && (
          <p className="text-xs text-red-500 mb-2 text-center">{saveError}</p>
        )}
        <button
          type="button"
          onClick={addToJournal}
          disabled={saving || saved}
          className={`w-full py-2 px-4 rounded-lg text-sm font-semibold transition ${
            saved
              ? 'bg-green-500 text-white cursor-default'
              : saving
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
        >
          {saved ? '✓ Added to Journal — redirecting…' : saving ? 'Saving…' : '📒 Add to Journal'}
        </button>
      </div>
    </div>
  );
}

/* ── Results table ──────────────────────────────────────────────── */
function ScanTable({
  results, sortKey, sortDir, onSort, activeType,
}: {
  results: Spread[];
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
      No results match your filters. Try lowering Min PoP or adjusting spread width.
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead className="border-b border-gray-100 bg-gray-50">
          <tr>
            <th className={thCls} onClick={() => onSort('dte')}>DTE{arrow('dte')}</th>
            <th className={thCls}>Expiry</th>
            <th className={thCls}>Type</th>
            <th className={thCls}>Strikes</th>
            <th className={thCls} onClick={() => onSort('credit')}>Credit{arrow('credit')}</th>
            <th className={thCls} onClick={() => onSort('maxLoss')}>Max Loss{arrow('maxLoss')}</th>
            <th className={thCls} onClick={() => onSort('riskReward')}>R/R{arrow('riskReward')}</th>
            <th className={thCls}>Avg IV</th>
            <th className={thCls} onClick={() => onSort('pop')}>PoP{arrow('pop')}</th>
            <th className={thCls} onClick={() => onSort('theta')}>Θ/day{arrow('theta')}</th>
            <th className={thCls} onClick={() => onSort('ev')}>Exp. Value{arrow('ev')}</th>
            <th className={thCls} onClick={() => onSort('creditToWidth')}>Cr/Width{arrow('creditToWidth')}</th>
            <th className={thCls}>Breakeven(s)</th>
          </tr>
        </thead>
        <tbody>
          {displayed.slice(0, 60).map((r, i) => (
            <tr key={r.id} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'} hover:bg-indigo-50/40 transition-colors`}>
              <td className={tdCls + ' font-mono text-gray-700'}>{r.dte}d</td>
              <td className={tdCls + ' font-mono text-xs text-gray-500'}>{r.expirationStr}</td>
              <td className={tdCls}><TypeBadge type={r.type} /></td>
              <td className={tdCls}><StrikeLabel r={r} /></td>
              <td className={tdCls + ' text-green-700 font-semibold'}>${r.creditPerContract.toFixed(0)}</td>
              <td className={tdCls + ' text-red-600'}>${r.maxLossPerContract.toFixed(0)}</td>
              <td className={tdCls + ' font-mono text-xs text-gray-500'}>1:{(r.maxLossPerContract / Math.max(r.creditPerContract, 0.01)).toFixed(1)}</td>
              <td className={tdCls + ' text-indigo-600'}>{r.avgIV.toFixed(1)}%</td>
              <td className={tdCls}><PoPBadge pop={r.pop} /></td>
              <td className={tdCls + ' text-indigo-600 font-medium'}>${r.thetaPerDay.toFixed(2)}</td>
              <td className={tdCls + ` font-bold ${r.ev >= 0 ? 'text-green-700' : 'text-red-600'}`}>${r.ev.toFixed(0)}</td>
              <td className={tdCls + ' text-gray-600'}>{(r.creditToWidth * 100).toFixed(0)}%</td>
              <td className={tdCls + ' font-mono text-xs text-gray-600'}>
                {r.breakevenLow ? `↑ $${r.breakevenLow}` : ''}
                {r.breakevenLow && r.breakevenHigh ? ' / ' : ''}
                {r.breakevenHigh ? `↓ $${r.breakevenHigh}` : ''}
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

/* ── Glossary ───────────────────────────────────────────────────── */
function GlossaryRow({ term, def }: { term: string; def: string }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="font-semibold text-gray-700 w-28 shrink-0">{term}</span>
      <span className="text-gray-500">{def}</span>
    </div>
  );
}

/* ── Constants ──────────────────────────────────────────────────── */
const QUICK = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'META', 'AMZN'];
const WIDTH_OPTIONS = [5, 10, 25, 50];
const MIN_POP_OPTIONS = [55, 60, 65, 70, 75, 80];

/* ── Main page ──────────────────────────────────────────────────── */
export default function ScannerPage() {
  const [symbol, setSymbol] = useState('SPY');
  const [input, setInput] = useState('SPY');

  const [targetWidths, setTargetWidths] = useState<number[]>([25]);
  const [minPoP, setMinPoP]             = useState(65);
  const [strategies, setStrategies]     = useState<StratType[]>(['bull-put', 'bear-call', 'iron-condor']);

  const [marketData, setMarketData]   = useState<MarketData | null>(null);
  const [scanResults, setScanResults] = useState<Spread[]>([]);
  const [chainIV, setChainIV]         = useState(0);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [lastScanned, setLastScanned] = useState('');

  const [sortKey, setSortKey]       = useState<SortKey>('ev');
  const [sortDir, setSortDir]       = useState<SortDir>('desc');
  const [activeType, setActiveType] = useState<StratType | 'all'>('all');

  function sortSpreads(arr: Spread[], key: SortKey, dir: SortDir): Spread[] {
    return [...arr].sort((a, b) => {
      const rr = (s: Spread) => s.creditPerContract / Math.max(s.maxLossPerContract, 0.01);
      const diff: Record<SortKey, number> = {
        pop: a.pop - b.pop, ev: a.ev - b.ev,
        credit: a.creditPerContract - b.creditPerContract,
        theta: a.thetaPerDay - b.thetaPerDay, dte: a.dte - b.dte,
        maxLoss: a.maxLossPerContract - b.maxLossPerContract,
        creditToWidth: a.creditToWidth - b.creditToWidth,
        riskReward: rr(a) - rr(b),
      };
      return dir === 'desc' ? -diff[key] : diff[key];
    });
  }

  const fetchAndScan = useCallback(async (sym: string) => {
    setLoading(true);
    setError('');
    setScanResults([]);
    try {
      const [candlesRes, chainRes] = await Promise.all([
        fetch(`/api/market/candles?symbol=${encodeURIComponent(sym)}&range=full`),
        fetch(`/api/options/chain?symbol=${encodeURIComponent(sym)}`),
      ]);
      if (!candlesRes.ok) throw new Error(`Price data fetch failed (${candlesRes.status})`);
      if (!chainRes.ok)   throw new Error(`Options chain fetch failed (${chainRes.status})`);

      const candlesJson = await candlesRes.json();
      const chain: OptionsChainResponse = await chainRes.json();

      const closes: number[] = candlesJson.candles?.map((c: { close: number }) => c.close) ?? [];
      if (!closes.length) throw new Error('No historical price data returned');

      const price = chain.underlyingPrice || closes.at(-1)!;
      const hv10  = calcHV(closes, 10);
      const hv20  = calcHV(closes, 20);
      const hv30  = calcHV(closes, 30);
      const ema20 = calcEMA(closes, 20);
      const pct   = (price - ema20) / ema20 * 100;
      const bias: Bias = pct > 1 ? 'bullish' : pct < -1 ? 'bearish' : 'neutral';
      setMarketData({ price, hv10, hv20, hv30, ema20, bias });

      if (!chain.contracts?.length)
        throw new Error('No options contracts returned — market may be closed or symbol has no listed options');

      const atm = chain.contracts.filter(
        (c) => Math.abs(c.strike - price) / price < 0.05 && c.impliedVolatility > 0,
      );
      setChainIV(atm.length
        ? parseFloat((atm.reduce((s, c) => s + c.impliedVolatility, 0) / atm.length * 100).toFixed(1))
        : 0);

      const puts  = chain.contracts.filter((c) => c.type === 'put');
      const calls = chain.contracts.filter((c) => c.type === 'call');
      const r = 0.045;

      const bps = strategies.includes('bull-put') || strategies.includes('iron-condor')
        ? buildBullPuts(puts, price, r, minPoP, targetWidths) : [];
      const bcs = strategies.includes('bear-call') || strategies.includes('iron-condor')
        ? buildBearCalls(calls, price, r, minPoP, targetWidths) : [];
      const ics = strategies.includes('iron-condor') ? buildIronCondors(bps, bcs) : [];

      let all: Spread[] = [];
      if (strategies.includes('bull-put'))    all = [...all, ...bps];
      if (strategies.includes('bear-call'))   all = [...all, ...bcs];
      if (strategies.includes('iron-condor')) all = [...all, ...ics];

      setScanResults(sortSpreads(all, sortKey, sortDir));
      setLastScanned(new Date().toLocaleTimeString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategies, targetWidths, minPoP, sortKey, sortDir]);

  useEffect(() => { fetchAndScan(symbol); }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = (key: SortKey) => {
    const dir: SortDir = sortKey === key && sortDir === 'desc' ? 'asc' : 'desc';
    setSortKey(key);
    setSortDir(dir);
    setScanResults(sortSpreads(scanResults, key, dir));
  };

  const handleSymbol = (sym: string) => {
    const s = sym.toUpperCase().trim();
    setSymbol(s);
    setInput(s);
  };

  const toggleWidth = (w: number) =>
    setTargetWidths((prev) => prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]);

  const toggleStrategy = (s: StratType) =>
    setStrategies((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const topBP = scanResults.find((r) => r.type === 'bull-put');
  const topBC = scanResults.find((r) => r.type === 'bear-call');
  const topIC = scanResults.find((r) => r.type === 'iron-condor');

  const inputCls = 'border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300';

  return (
    <Layout title="Options Screener">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h1 className="text-xl font-bold text-gray-800 shrink-0">Options Screener</h1>
            <p className="text-xs text-gray-400">Real options chain · Credit spreads ranked by Expected Value</p>
            <form onSubmit={(e) => { e.preventDefault(); handleSymbol(input); }} className="flex gap-2 ml-auto">
              <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())}
                placeholder="TICKER…" className={`${inputCls} w-28`} />
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
        {marketData && <BiasBar md={marketData} chainIV={chainIV} />}

        {/* ── Screener Controls ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Screener Controls</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                Spread Width(s) to scan
              </label>
              <div className="flex flex-wrap gap-2">
                {WIDTH_OPTIONS.map((w) => (
                  <button key={w} onClick={() => toggleWidth(w)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${targetWidths.includes(w) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                    ${w}
                  </button>
                ))}
              </div>
            </div>

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

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Strategies</label>
              <div className="flex flex-wrap gap-2">
                {(['bull-put', 'bear-call', 'iron-condor'] as StratType[]).map((s) => (
                  <button key={s} onClick={() => toggleStrategy(s)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${strategies.includes(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-100 text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                    {s === 'bull-put' ? 'Bull Put' : s === 'bear-call' ? 'Bear Call' : 'Iron Condor'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-5 pt-4 border-t border-gray-100">
            <button onClick={() => fetchAndScan(symbol)}
              disabled={loading || targetWidths.length === 0 || strategies.length === 0}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2">
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Loading chain…</>
              ) : '🔍 Refresh'}
            </button>
            {lastScanned && !loading && (
              <span className="text-xs text-gray-400">
                Last scanned at {lastScanned} · {scanResults.length} results · real chain data
                {scanResults.length > 0 && chainIV < 5 && (
                  <span className="ml-2 text-amber-500">· Markets closed — using last-trade prices</span>
                )}
              </span>
            )}
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
            <GlossaryRow term="Credit (real)" def="Bid/ask midpoint from the live Yahoo Finance options chain — what you&apos;d realistically collect." />
            <GlossaryRow term="Avg IV" def="Average implied volatility of the two legs — sourced directly from the options chain, not estimated." />
            <GlossaryRow term="Prob. of Success" def="Black-Scholes risk-neutral probability the spread expires worthless (i.e. you keep the full credit)." />
            <GlossaryRow term="Risk : Reward" def="How much you risk per $1 collected. 1:4 means risk $4 to collect $1. Lower number = more attractive." />
            <GlossaryRow term="Return on Risk" def="Credit ÷ Max Loss as a %. A 25% RoR spread collects $1 for every $4 of risk capital tied up." />
            <GlossaryRow term="PoP (B-S)" def="Same as Prob. of Success — displayed in the table using Black-Scholes d2 with the contract&apos;s real IV." />
            <GlossaryRow term="Exp. Value" def="(PoP × credit) − (loss prob × max loss). Positive EV = mathematical edge." />
            <GlossaryRow term="Θ / day" def="Net theta per contract per day — time decay working in your favour." />
            <GlossaryRow term="Breakeven" def="Stock price at expiry beyond which you start losing money." />
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          Options chain via Yahoo Finance (real bid/ask · real implied volatility). PoP via Black-Scholes using contract IV.
          For educational use only — always verify with your broker before trading.
        </p>
      </div>
    </Layout>
  );
}
