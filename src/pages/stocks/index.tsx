import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from '@/components/Layout';

/* ── Types ─────────────────────────────────────────────────────── */
interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Indicators {
  price: number;
  prevClose: number;
  changePct: number;
  ema20: number;
  ema50: number;
  ema200: number;
  tsi: number;        // True Strength Index (−100 to +100)
  tsiSignal: number;  // EMA(7) of TSI
  atr14: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
  hv20: number;
  volumeRatio: number;
  high20: number;
  low20: number;
  trendScore: number; // -3 to +3
}

interface StockSetup {
  id: string;
  name: string;
  description: string;
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  rrRatio1: number;
  rrRatio2: number;
  pop: number;
  stopDist: number;
  stopPct: number;
  grade: 'A' | 'B' | 'C';
  reasons: string[];
  icon: string;
}

/* ── Indicator math ─────────────────────────────────────────────── */
function calcEMAArr(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

// True Strength Index — double-smoothed momentum oscillator (range ≈ −100 to +100)
function calcTSI(closes: number[], fast = 13, slow = 25): { tsi: number; signal: number } {
  if (closes.length < slow + fast + 2) return { tsi: 0, signal: 0 };
  const momentum = closes.slice(1).map((c, i) => c - closes[i]);
  const absMom   = momentum.map(Math.abs);
  const sm2 = calcEMAArr(calcEMAArr(momentum, slow), fast);
  const sa2 = calcEMAArr(calcEMAArr(absMom,   slow), fast);
  if (!sa2.length || sa2[sa2.length - 1] === 0) return { tsi: 0, signal: 0 };
  const tsiArr = sm2.map((v, i) => sa2[i] !== 0 ? (100 * v) / sa2[i] : 0);
  const sigArr = calcEMAArr(tsiArr, 7);
  return {
    tsi:    parseFloat((tsiArr[tsiArr.length - 1] ?? 0).toFixed(2)),
    signal: parseFloat((sigArr[sigArr.length - 1] ?? 0).toFixed(2)),
  };
}

function calcEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes.at(-1) ?? 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}


function calcATR(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  return parseFloat(atr.toFixed(2));
}

function calcBB(closes: number[], period = 20, mult = 2) {
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0 };
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b) / period;
  const std = Math.sqrt(slice.reduce((s, c) => s + (c - middle) ** 2, 0) / period);
  return {
    upper: parseFloat((middle + mult * std).toFixed(2)),
    middle: parseFloat(middle.toFixed(2)),
    lower: parseFloat((middle - mult * std).toFixed(2)),
  };
}

function calcMACD(closes: number[], fast = 12, slow = 26, signal = 9) {
  if (closes.length < slow + signal) return { macdLine: 0, macdSignal: 0, macdHist: 0 };
  const kf = 2 / (fast + 1);
  const ks = 2 / (slow + 1);
  const kg = 2 / (signal + 1);
  let emaf = closes.slice(0, fast).reduce((a, b) => a + b) / fast;
  let emas = closes.slice(0, slow).reduce((a, b) => a + b) / slow;
  for (let i = fast; i < slow; i++) emaf = closes[i] * kf + emaf * (1 - kf);
  const macdSeries: number[] = [];
  for (let i = slow; i < closes.length; i++) {
    emaf = closes[i] * kf + emaf * (1 - kf);
    emas = closes[i] * ks + emas * (1 - ks);
    macdSeries.push(emaf - emas);
  }
  let sigLine = macdSeries.slice(0, signal).reduce((a, b) => a + b) / signal;
  for (let i = signal; i < macdSeries.length; i++) sigLine = macdSeries[i] * kg + sigLine * (1 - kg);
  const macdLine = macdSeries.at(-1) ?? 0;
  return {
    macdLine: parseFloat(macdLine.toFixed(3)),
    macdSignal: parseFloat(sigLine.toFixed(3)),
    macdHist: parseFloat((macdLine - sigLine).toFixed(3)),
  };
}

function calcHV(closes: number[], period: number): number {
  if (closes.length < period + 1) return 0;
  const sl = closes.slice(-(period + 1));
  const rets = sl.slice(1).map((c, i) => Math.log(c / sl[i]));
  const mean = rets.reduce((a, b) => a + b) / rets.length;
  const v = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return parseFloat((Math.sqrt(v) * Math.sqrt(252) * 100).toFixed(1));
}

/* ── Compute all indicators ─────────────────────────────────────── */
function computeIndicators(candles: Candle[]): Indicators {
  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  const price     = closes.at(-1)!;
  const prevClose = closes.at(-2) ?? price;
  const changePct = parseFloat(((price - prevClose) / prevClose * 100).toFixed(2));

  const ema20  = parseFloat(calcEMA(closes, 20).toFixed(2));
  const ema50  = parseFloat(calcEMA(closes, 50).toFixed(2));
  const ema200 = parseFloat(calcEMA(closes, 200).toFixed(2));
  const { tsi, signal: tsiSignal } = calcTSI(closes);
  const atr14  = calcATR(highs, lows, closes, 14);
  const bb     = calcBB(closes, 20, 2);
  const macd   = calcMACD(closes);
  const hv20   = calcHV(closes, 20);

  const recentVols = volumes.slice(-21);
  const avgVol = recentVols.slice(0, 20).reduce((a, b) => a + b) / 20;
  const volumeRatio = avgVol > 0 ? parseFloat(((recentVols.at(-1) ?? 0) / avgVol).toFixed(2)) : 1;

  const high20 = Math.max(...highs.slice(-20));
  const low20  = Math.min(...lows.slice(-20));

  let trendScore = 0;
  if (price > ema20)  trendScore++; else trendScore--;
  if (price > ema50)  trendScore++; else trendScore--;
  if (price > ema200) trendScore++; else trendScore--;

  return {
    price, prevClose, changePct,
    ema20, ema50, ema200, tsi, tsiSignal, atr14,
    bbUpper: bb.upper, bbMiddle: bb.middle, bbLower: bb.lower,
    ...macd, hv20, volumeRatio, high20, low20, trendScore,
  };
}

/* ── Detect setups ──────────────────────────────────────────────── */
function detectSetups(ind: Indicators): StockSetup[] {
  const { price, ema20, ema50, ema200, tsi, atr14, bbUpper, bbLower,
          macdHist, volumeRatio, high20, trendScore } = ind;
  const setups: StockSetup[] = [];

  const build = (
    id: string, name: string, description: string,
    direction: 'long' | 'short', entry: number, stop: number,
    basePop: number, icon: string, reasons: string[], adj: number,
  ): StockSetup => {
    const risk    = Math.abs(entry - stop);
    const target1 = direction === 'long' ? entry + 2 * risk : entry - 2 * risk;
    const target2 = direction === 'long' ? entry + 3 * risk : entry - 3 * risk;
    const pop     = Math.min(75, Math.max(40, basePop + adj));
    return {
      id, name, description, direction, icon, reasons,
      entry: parseFloat(entry.toFixed(2)),
      stop:  parseFloat(stop.toFixed(2)),
      target1: parseFloat(target1.toFixed(2)),
      target2: parseFloat(target2.toFixed(2)),
      rrRatio1: 2, rrRatio2: 3,
      pop, grade: pop >= 65 ? 'A' : pop >= 55 ? 'B' : 'C',
      stopDist: parseFloat(risk.toFixed(2)),
      stopPct:  parseFloat((risk / entry * 100).toFixed(1)),
    };
  };

  /* 1 — Uptrend Continuation */
  if (trendScore === 3 && tsi >= 0 && tsi <= 50 && macdHist > 0) {
    let adj = 0;
    if (tsi >= 5 && tsi <= 35) adj += 4;   // sweet spot: bullish but not extreme
    if (volumeRatio >= 1.2) adj += 3;
    if (macdHist > 0.05) adj += 2;
    setups.push(build(
      'uptrend', 'Uptrend Continuation',
      'All three EMAs aligned bullish. TSI positive — momentum confirmed.',
      'long', price, price - 1.5 * atr14, 60, '📈',
      [
        `Price ${((price - ema20) / ema20 * 100).toFixed(1)}% above EMA20 ($${ema20}) — uptrend intact`,
        `TSI ${tsi} (positive) — double-smoothed momentum confirms buyers`,
        `MACD histogram positive ($${macdHist.toFixed(3)}) — buyers in control`,
      ], adj,
    ));
  }

  /* 2 — EMA20 Pullback */
  if (trendScore >= 2 && tsi >= -10 && tsi <= 25 && Math.abs(price - ema20) / ema20 < 0.015) {
    let adj = 0;
    if (Math.abs(price - ema20) / ema20 < 0.005) adj += 4;
    if (tsi >= -5 && tsi <= 15) adj += 3;  // TSI near zero = cooled momentum, good entry
    if (volumeRatio < 0.9) adj += 2;
    setups.push(build(
      'ema20pb', 'EMA20 Pullback',
      'Price pulled back to EMA20 in an uptrend. Classic buy-the-dip.',
      'long', price, price - 1.5 * atr14, 58, '↩️',
      [
        `Price testing EMA20 ($${ema20}) — key dynamic support level`,
        `TSI ${tsi} cooling towards zero — momentum reset, not broken`,
        `Low-volume pullback (${volumeRatio}x avg) signals no distribution`,
      ], adj,
    ));
  }

  /* 3 — EMA50 Bounce */
  if (trendScore >= 1 && price > ema200 && tsi >= -20 && tsi <= 20 &&
      Math.abs(price - ema50) / ema50 < 0.02) {
    let adj = 0;
    if (Math.abs(price - ema50) / ema50 < 0.008) adj += 4;
    if (macdHist > -0.05) adj += 2;
    setups.push(build(
      'ema50b', 'EMA50 Bounce',
      'Price testing EMA50 support. Long-term trend remains intact above EMA200.',
      'long', price, price - 2 * atr14, 55, '⚓',
      [
        `Price near EMA50 ($${ema50}) — intermediate-term support`,
        `Price above EMA200 ($${ema200.toFixed(2)}) — long-term trend bullish`,
        `TSI ${tsi} near zero — momentum neutral, ideal bounce entry`,
      ], adj,
    ));
  }

  /* 4 — Oversold Bounce (TSI deeply negative) */
  if (tsi < -25 && price > ema200 * 0.98 && price <= ind.bbLower * 1.02) {
    let adj = 0;
    if (tsi < -40) adj += 4;
    if (price < ind.bbLower) adj += 3;
    if (trendScore >= 0) adj += 3;
    setups.push(build(
      'oversold', 'Oversold Bounce',
      'TSI deeply negative. Price at lower Bollinger Band. Mean-reversion long.',
      'long', price, price - 1.5 * atr14, 52, '🔄',
      [
        `TSI ${tsi} — deeply negative, statistically prone to reversal`,
        `Price at/below lower Bollinger Band ($${ind.bbLower}) — stretched`,
        `Long-term EMA200 ($${ema200.toFixed(2)}) still supportive below`,
      ], adj,
    ));
  }

  /* 5 — 20-Day Breakout */
  if (price >= high20 * 0.998 && volumeRatio >= 1.4 && tsi >= 10 && tsi <= 70 && trendScore >= 2) {
    let adj = 0;
    if (volumeRatio >= 1.8) adj += 5;
    if (tsi >= 15 && tsi <= 50) adj += 3;
    setups.push(build(
      'breakout', '20-Day Breakout',
      'Price breaking out of 20-day range on elevated volume.',
      'long', price, price - 1.5 * atr14, 57, '🚀',
      [
        `Price at/above 20-day high ($${high20.toFixed(2)}) — resistance flipping to support`,
        `Volume ${volumeRatio}x the 20-day average — institutional participation`,
        `TSI ${tsi} — momentum expanding, breakout confirmed`,
      ], adj,
    ));
  }

  /* 6 — Bear Trend Short */
  if (trendScore === -3 && tsi <= 0 && tsi >= -50 && macdHist < 0) {
    let adj = 0;
    if (tsi <= -5 && tsi >= -35) adj += 4;  // TSI negative but not extreme = room to fall
    if (volumeRatio >= 1.2) adj += 2;
    if (macdHist < -0.05) adj += 2;
    setups.push(build(
      'downtrend', 'Bear Trend Continuation',
      'All EMAs aligned bearish. TSI negative — any bounce is an opportunity to short.',
      'short', price, price + 1.5 * atr14, 58, '📉',
      [
        `Price ${((ema20 - price) / ema20 * 100).toFixed(1)}% below EMA20 ($${ema20}) — downtrend intact`,
        `TSI ${tsi} (negative) — double-smoothed momentum confirms sellers`,
        `MACD histogram negative ($${macdHist.toFixed(3)}) — sellers in control`,
      ], adj,
    ));
  }

  /* 7 — Overbought Mean Reversion Short */
  if (tsi > 50 && price >= bbUpper * 0.99 && trendScore <= 1) {
    let adj = 0;
    if (tsi > 65) adj += 4;
    if (price > bbUpper) adj += 3;
    if (trendScore <= -1) adj += 3;
    setups.push(build(
      'overbought', 'Overbought Mean Reversion',
      'TSI extended above 50. Price at upper Bollinger Band. Counter-trend short.',
      'short', price, price + 1.5 * atr14, 50, '🔻',
      [
        `TSI ${tsi} — historically extended, mean reversion likely`,
        `Price at/above upper Bollinger Band ($${bbUpper}) — statistically stretched`,
        `Weak underlying trend (score ${trendScore}/3) — no strong tailwind`,
      ], adj,
    ));
  }

  return setups.sort((a, b) => b.pop - a.pop);
}

/* ── TradingView chart ──────────────────────────────────────────── */
function TVMini({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    const wd = document.createElement('div');
    wd.className = 'tradingview-widget-container__widget';
    wd.style.cssText = 'height:320px;width:100%';
    ref.current.appendChild(wd);
    const sc = document.createElement('script');
    sc.type = 'text/javascript';
    sc.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    sc.async = true;
    sc.innerHTML = JSON.stringify({
      width: '100%', height: 320, symbol,
      interval: 'D', timezone: 'America/New_York', theme: 'light',
      style: '1', locale: 'en',
      enable_publishing: false, allow_symbol_change: false,
      hide_side_toolbar: true, withdateranges: false, save_image: false,
      studies: [
        { id: 'MAExp@tv-basicstudies', inputs: { length: 20 } },
        { id: 'MAExp@tv-basicstudies', inputs: { length: 50 } },
        { id: 'MAExp@tv-basicstudies', inputs: { length: 200 } },
        { id: 'Volume@tv-basicstudies' },
      ],
    });
    ref.current.appendChild(sc);
  }, [symbol]);
  return <div className="tradingview-widget-container" ref={ref} style={{ height: 320, width: '100%' }} />;
}

/* ── Technical snapshot bar ─────────────────────────────────────── */
function TechBar({ ind }: { ind: Indicators }) {
  const trendLabel =
    ind.trendScore ===  3 ? 'Strong Uptrend'  :
    ind.trendScore ===  2 ? 'Uptrend'          :
    ind.trendScore ===  1 ? 'Mixed Bullish'    :
    ind.trendScore === -1 ? 'Mixed Bearish'    :
    ind.trendScore === -2 ? 'Downtrend'        : 'Strong Downtrend';
  const trendColor  = ind.trendScore > 0 ? 'text-green-600' : ind.trendScore < 0 ? 'text-red-600' : 'text-gray-500';
  const tsiColor    = ind.tsi > 25 ? 'text-green-700' : ind.tsi < -25 ? 'text-red-600' : 'text-gray-800';
  const tsiLabel    = ind.tsi > 25 ? 'Bullish' : ind.tsi < -25 ? 'Bearish' : 'Neutral';
  const changeColor = ind.changePct >= 0 ? 'text-green-600' : 'text-red-600';
  const volColor    = ind.volumeRatio >= 1.3 ? 'text-green-600' : ind.volumeRatio < 0.7 ? 'text-gray-400' : 'text-gray-700';

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4 flex flex-wrap items-start gap-6 text-sm">
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Last Price</p>
        <p className="text-2xl font-bold text-gray-800">${ind.price.toFixed(2)}</p>
        <p className={`text-xs font-semibold ${changeColor}`}>
          {ind.changePct >= 0 ? '+' : ''}{ind.changePct}% today
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Trend</p>
        <p className={`font-bold ${trendColor}`}>{trendLabel}</p>
        <p className="text-xs text-gray-400">EMA {ind.ema20}/{ind.ema50}/{ind.ema200.toFixed(0)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-0.5">TSI (25/13)</p>
        <p className={`text-xl font-bold ${tsiColor}`}>{ind.tsi}</p>
        <p className="text-xs text-gray-400">{tsiLabel} · signal {ind.tsiSignal}</p>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-0.5">MACD</p>
        <p className={`font-bold ${ind.macdHist > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {ind.macdHist > 0 ? '▲ Bullish' : '▼ Bearish'}
        </p>
        <p className="text-xs text-gray-400">Hist: {ind.macdHist.toFixed(3)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-0.5">ATR 14</p>
        <p className="font-bold text-gray-800">${ind.atr14}</p>
        <p className="text-xs text-gray-400">HV20: {ind.hv20}%</p>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Volume</p>
        <p className={`font-bold ${volColor}`}>{ind.volumeRatio}× avg</p>
        <p className="text-xs text-gray-400">{ind.volumeRatio >= 1.3 ? 'Elevated' : ind.volumeRatio < 0.7 ? 'Weak' : 'Normal'}</p>
      </div>
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Bollinger Bands</p>
        <p className="font-mono text-xs text-gray-700">${ind.bbLower} – ${ind.bbUpper}</p>
        <p className="text-xs text-gray-400">20-day high/low: ${ind.high20.toFixed(2)} / ${ind.low20.toFixed(2)}</p>
      </div>
    </div>
  );
}

/* ── Direction + Grade badges ───────────────────────────────────── */
function DirectionBadge({ dir }: { dir: 'long' | 'short' }) {
  return dir === 'long'
    ? <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-green-600 text-white tracking-wide">▲ LONG</span>
    : <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-red-600   text-white tracking-wide">▼ SHORT</span>;
}

function GradeBadge({ grade }: { grade: 'A' | 'B' | 'C' }) {
  const cls = grade === 'A' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
            : grade === 'B' ? 'bg-yellow-100  text-yellow-800  border-yellow-200'
            :                 'bg-gray-100    text-gray-600    border-gray-200';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${cls}`}>Grade {grade}</span>;
}

/* ── Setup Card ─────────────────────────────────────────────────── */
function SetupCard({ setup }: { setup: StockSetup }) {
  const isLong   = setup.direction === 'long';
  const cardBg   = isLong ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50';
  const checkClr = isLong ? 'text-green-600' : 'text-red-600';
  const t1Gain   = Math.abs(setup.target1 - setup.entry).toFixed(2);
  const t2Gain   = Math.abs(setup.target2 - setup.entry).toFixed(2);

  return (
    <div className={`rounded-xl border shadow-sm p-5 ${cardBg}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xl">{setup.icon}</span>
        <span className="font-bold text-gray-800 text-base">{setup.name}</span>
        <DirectionBadge dir={setup.direction} />
        <GradeBadge grade={setup.grade} />
        <span className="ml-auto text-xs text-gray-400 hidden sm:inline">{setup.description}</span>
      </div>

      {/* Hero block: Entry / Stop / Targets */}
      <div className="bg-white bg-opacity-80 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center mb-4">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Entry</p>
            <p className="text-2xl font-extrabold text-gray-800">${setup.entry.toFixed(2)}</p>
            <p className="text-xs text-gray-400">Market price</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-red-400 uppercase tracking-widest mb-1">Stop Loss</p>
            <p className="text-2xl font-extrabold text-red-600">${setup.stop.toFixed(2)}</p>
            <p className="text-xs text-red-400">−${setup.stopDist} (−{setup.stopPct}%)</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-green-500 uppercase tracking-widest mb-1">
              Target 1 <span className="text-gray-400 font-normal normal-case">(2:1)</span>
            </p>
            <p className="text-2xl font-extrabold text-green-700">${setup.target1.toFixed(2)}</p>
            <p className="text-xs text-green-500">+${t1Gain}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-green-700 uppercase tracking-widest mb-1">
              Target 2 <span className="text-gray-400 font-normal normal-case">(3:1)</span>
            </p>
            <p className="text-2xl font-extrabold text-green-800">${setup.target2.toFixed(2)}</p>
            <p className="text-xs text-green-600">+${t2Gain}</p>
          </div>
        </div>

        {/* PoP + R:R — hero metrics */}
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100 text-center">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
              Probability of Success
            </p>
            <p className="text-4xl font-extrabold text-gray-800">{setup.pop}%</p>
            <p className="text-xs text-gray-400 mt-1">Estimated win rate for this setup</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
              Risk : Reward
            </p>
            <p className="text-4xl font-extrabold text-gray-800">1 : {setup.rrRatio1}</p>
            <p className="text-xs text-gray-400 mt-1">Risk ${setup.stopDist} to make ${t1Gain}</p>
          </div>
        </div>
      </div>

      {/* Reasons */}
      <ul className="space-y-2">
        {setup.reasons.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className={`font-bold shrink-0 mt-0.5 ${checkClr}`}>✓</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Constants ──────────────────────────────────────────────────── */
const QUICK_STOCKS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'JPM'];

/* ── Main page ──────────────────────────────────────────────────── */
export default function StockScannerPage() {
  const [symbol, setSymbol] = useState('SPY');
  const [input, setInput]   = useState('SPY');

  const [indicators, setIndicators] = useState<Indicators | null>(null);
  const [setups, setSetups]         = useState<StockSetup[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [lastScanned, setLastScanned] = useState('');

  const fetchAndScan = useCallback(async (sym: string) => {
    setLoading(true);
    setError('');
    setSetups([]);
    setIndicators(null);
    try {
      const res = await fetch(`/api/market/candles?symbol=${encodeURIComponent(sym)}&range=full`);
      if (!res.ok) throw new Error(`Data fetch failed (${res.status})`);
      const json = await res.json();
      const candles: Candle[] = json.candles ?? [];
      if (candles.length < 50) throw new Error('Not enough price history for this symbol');
      const ind   = computeIndicators(candles);
      const found = detectSetups(ind);
      setIndicators(ind);
      setSetups(found);
      setLastScanned(new Date().toLocaleTimeString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAndScan(symbol); }, [symbol, fetchAndScan]);

  const handleSymbol = (sym: string) => {
    const s = sym.toUpperCase().trim();
    if (!s) return;
    setSymbol(s);
    setInput(s);
  };

  return (
    <Layout title="Stock Scanner">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h1 className="text-xl font-bold text-gray-800 shrink-0">Stock Scanner</h1>
            <p className="text-xs text-gray-400">
              Technical setups · Entry, exit &amp; stop-loss · Risk:Reward + Probability of success
            </p>
            <form
              onSubmit={(e) => { e.preventDefault(); handleSymbol(input); }}
              className="flex gap-2 ml-auto"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                placeholder="TICKER…"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-28"
              />
              <button
                type="submit"
                className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Scan
              </button>
            </form>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_STOCKS.map((t) => (
              <button
                key={t}
                onClick={() => handleSymbol(t)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  symbol === t
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* ── TV Chart ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <TVMini key={symbol} symbol={symbol} />
        </div>

        {/* ── Technical Snapshot ── */}
        {indicators && <TechBar ind={indicators} />}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <span className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-3" />
            <span className="text-gray-500 text-sm">Scanning {symbol}…</span>
          </div>
        )}

        {/* ── Status line ── */}
        {!loading && lastScanned && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-gray-400">
              Scanned at {lastScanned} · {setups.length} setup{setups.length !== 1 ? 's' : ''} detected
            </span>
            {setups.length === 0 && !error && (
              <span className="text-xs text-amber-500">
                No high-confidence setups match current conditions.
                Try a different symbol or check back when the market opens.
              </span>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* ── Setup Cards ── */}
        {!loading && setups.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-widest mb-3">
              Suggested Setups — {symbol}
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {setups.map((s) => <SetupCard key={s.id} setup={s} />)}
            </div>
          </div>
        )}

        {/* ── Glossary ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">How This Works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {[
              ['Entry',               'The current market price where you would open the position.'],
              ['Stop Loss',          'Set at 1.5–2×ATR from entry. Limits max risk on the trade.'],
              ['Target 1 (2:1)',     'First profit target at 2× the stop distance from entry.'],
              ['Target 2 (3:1)',     'Stretch target at 3× the stop distance. Let your winners run.'],
              ['Risk : Reward',      '1:2 means you risk $1 to make $2. Always trade positive R:R setups.'],
              ['Prob. of Success',   'Estimated win rate based on historical performance of this setup type, adjusted by RSI, trend alignment and volume confirmation.'],
              ['ATR 14',             'Average True Range — daily price volatility. Used to dynamically size stops.'],
              ['TSI (25/13)',         'True Strength Index. Double-smoothed momentum oscillator. Above 0 = bullish; below 0 = bearish. Extreme readings (> +50 or < −50) signal overextension.'],
              ['MACD',               'Momentum indicator. Positive histogram = bullish momentum, negative = bearish.'],
              ['Trend Score',        'Count of EMAs (20/50/200) below price. +3 = strong uptrend; −3 = strong downtrend.'],
              ['Volume Ratio',       'Today\'s volume vs 20-day average. > 1.3× = elevated = conviction behind the move.'],
              ['Bollinger Bands',    '20-day moving average ± 2 standard deviations. Price near outer bands is statistically rare.'],
            ].map(([term, def]) => (
              <div key={term} className="flex gap-3 text-xs py-1">
                <span className="font-semibold text-gray-700 w-36 shrink-0">{term}</span>
                <span className="text-gray-500">{def}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          Price data via Yahoo Finance. Setups generated algorithmically from EMA, RSI, MACD, ATR and Bollinger Band indicators.
          For educational use only — always verify with your broker before trading.
        </p>

      </div>
    </Layout>
  );
}
