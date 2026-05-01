/* ─────────────────────────────────────────────────────────────────
   Smart Money Concepts (SMC) — Enhanced LuxAlgo-style indicator
   Pure client-side calculations. No API calls needed.

   Two-tier structure (mirrors LuxAlgo):
     • Internal (lookback = 5)  — real-time, fine-grained
     • Swing    (lookback = 25) — macro structure

   Detects:
     • Swing Highs / Lows with HH / HL / LH / LL labels
     • Break of Structure (BOS) — trend continuation   (both tiers)
     • Change of Character (CHoCH) — reversal warning  (both tiers)
     • Order Blocks (OB) — with ATR volatility filter  (both tiers)
     • Fair Value Gaps (FVG) — price imbalances
     • Equal Highs / Lows (EQH / EQL) — liquidity zones
     • Strong / Weak High / Low — trailing swing extremes
     • Premium / Discount / Equilibrium zones
───────────────────────────────────────────────────────────────── */

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SwingPoint {
  index: number;
  date: string;
  price: number;
  type: 'high' | 'low';
  /** which detection tier produced this swing */
  tier: 'internal' | 'swing';
  /** HH/LH for highs, HL/LL for lows; H/L for the very first of each type */
  label: 'HH' | 'LH' | 'HL' | 'LL' | 'H' | 'L';
}

export interface StructureEvent {
  index: number;
  date: string;
  price: number;
  type: 'BOS' | 'CHoCH';
  direction: 'bullish' | 'bearish';
  tier: 'internal' | 'swing';
}

export interface OrderBlock {
  index: number;
  date: string;
  top: number;
  bottom: number;
  type: 'bullish' | 'bearish';
  broken: boolean;
  tier: 'internal' | 'swing';
}

export interface FairValueGap {
  index: number;
  date: string;
  top: number;
  bottom: number;
  type: 'bullish' | 'bearish';
  filled: boolean;
}

/** Equal Highs / Equal Lows — two consecutive swing highs/lows within ATR threshold */
export interface EqualLevel {
  index: number;
  date: string;
  price: number;
  prevIndex: number;
  prevDate: string;
  type: 'EQH' | 'EQL';
}

/** Most recent macro swing high and low with Strong/Weak designation */
export interface TrailingExtreme {
  high: number;
  highDate: string;
  highIndex: number;
  low: number;
  lowDate: string;
  lowIndex: number;
  /** Strong High = in downtrend (acts as resistance) */
  strongHigh: boolean;
  /** Strong Low = in uptrend (acts as support) */
  strongLow: boolean;
}

export interface PremiumDiscountZone {
  high: number;
  low: number;
  midpoint: number;
  zone: 'premium' | 'discount' | 'equilibrium';
  currentPrice: number;
  premiumPct: number;
}

export interface SMCData {
  /** Macro swing tier (lookback = 25) */
  swings: SwingPoint[];
  structure: StructureEvent[];
  orderBlocks: OrderBlock[];
  /** Fine-grained internal tier (lookback = 5) */
  internalSwings: SwingPoint[];
  internalStructure: StructureEvent[];
  internalOrderBlocks: OrderBlock[];
  /** Shared across tiers */
  fvgs: FairValueGap[];
  equalLevels: EqualLevel[];
  trailingExtreme: TrailingExtreme | null;
  pdZone: PremiumDiscountZone | null;
  trend: 'bullish' | 'bearish' | 'ranging';
  internalTrend: 'bullish' | 'bearish' | 'ranging';
}

/* ─────────────────────────────────────────────
   Constants
───────────────────────────────────────────── */
const INTERNAL_LOOKBACK = 5;
const SWING_LOOKBACK    = 25;
const RECENT_WINDOW     = 200;
const EQL_THRESHOLD     = 0.2;  // fraction of ATR(14) for equal high/low detection
const ATR_PERIOD        = 14;

/* ─────────────────────────────────────────────
   ATR — Wilder's smoothing
───────────────────────────────────────────── */
function calcATR(candles: Candle[]): number[] {
  const result = new Array<number>(candles.length).fill(0);
  if (candles.length < ATR_PERIOD + 1) return result;

  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }

  let atr = trs.slice(1, ATR_PERIOD + 1).reduce((a, b) => a + b, 0) / ATR_PERIOD;
  result[ATR_PERIOD] = atr;
  for (let i = ATR_PERIOD + 1; i < candles.length; i++) {
    atr = (atr * (ATR_PERIOD - 1) + trs[i]) / ATR_PERIOD;
    result[i] = atr;
  }
  return result;
}

/* ─────────────────────────────────────────────
   Swing High / Low Detection with HH/HL/LH/LL labels
───────────────────────────────────────────── */
function detectSwings(
  candles: Candle[],
  lookback: number,
  tier: 'internal' | 'swing',
): SwingPoint[] {
  const swings: SwingPoint[] = [];
  let lastHigh: SwingPoint | null = null;
  let lastLow:  SwingPoint | null = null;

  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isSwingHigh = true, isSwingLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= c.high || candles[i + j].high >= c.high) isSwingHigh = false;
      if (candles[i - j].low  <= c.low  || candles[i + j].low  <= c.low)  isSwingLow  = false;
      if (!isSwingHigh && !isSwingLow) break;
    }

    if (isSwingHigh) {
      const label: SwingPoint['label'] = lastHigh === null ? 'H' : c.high > lastHigh.price ? 'HH' : 'LH';
      const sp: SwingPoint = { index: i, date: c.date, price: c.high, type: 'high', tier, label };
      swings.push(sp);
      lastHigh = sp;
    }
    if (isSwingLow) {
      const label: SwingPoint['label'] = lastLow === null ? 'L' : c.low < lastLow.price ? 'LL' : 'HL';
      const sp: SwingPoint = { index: i, date: c.date, price: c.low, type: 'low', tier, label };
      swings.push(sp);
      lastLow = sp;
    }
  }

  return swings.sort((a, b) => a.index - b.index);
}

/* ─────────────────────────────────────────────
   BOS / CHoCH Detection
───────────────────────────────────────────── */
function detectStructure(swings: SwingPoint[], tier: 'internal' | 'swing'): StructureEvent[] {
  const events: StructureEvent[] = [];
  if (swings.length < 4) return events;

  let trend: 'up' | 'down' | null = null;
  let lastHigh: SwingPoint | null = null;
  let lastLow:  SwingPoint | null = null;

  for (const sw of swings) {
    if (sw.type === 'high') {
      if (lastHigh !== null) {
        if (trend !== null) {
          events.push({
            index: sw.index, date: sw.date, price: sw.price, tier,
            type:      sw.price > lastHigh.price ? (trend === 'down' ? 'CHoCH' : 'BOS')
                                                 : (trend === 'up'   ? 'CHoCH' : 'BOS'),
            direction: sw.price > lastHigh.price ? 'bullish' : 'bearish',
          });
        }
        trend = sw.price > lastHigh.price ? 'up' : 'down';
      }
      lastHigh = sw;
    } else {
      if (lastLow !== null) {
        if (trend !== null) {
          events.push({
            index: sw.index, date: sw.date, price: sw.price, tier,
            type:      sw.price < lastLow.price ? (trend === 'up'   ? 'CHoCH' : 'BOS')
                                                : (trend === 'down' ? 'CHoCH' : 'BOS'),
            direction: sw.price < lastLow.price ? 'bearish' : 'bullish',
          });
        }
        trend = sw.price < lastLow.price ? 'down' : 'up';
      }
      lastLow = sw;
    }
  }

  return events;
}

/* ─────────────────────────────────────────────
   Order Block Detection — ATR-filtered
   Bullish OB: lowest-parsed-low bearish candle before bullish break
   Bearish OB: highest-parsed-high bullish candle before bearish break
───────────────────────────────────────────── */
function detectOrderBlocks(
  candles: Candle[],
  structure: StructureEvent[],
  atr: number[],
  tier: 'internal' | 'swing',
): OrderBlock[] {
  const obs: OrderBlock[] = [];
  const seenIdx = new Set<number>();

  for (const ev of structure) {
    const searchBack = Math.min(ev.index, 30);

    if (ev.direction === 'bullish') {
      // Find the bearish candle with the lowest ATR-parsed low in the lookback window
      let bestIdx = -1, bestVal = Infinity;
      for (let i = ev.index - 1; i >= ev.index - searchBack; i--) {
        if (i < 0 || seenIdx.has(i)) continue;
        const c = candles[i];
        if (c.close >= c.open) continue; // must be a bearish candle
        const isVolatile   = atr[i] > 0 && (c.high - c.low) >= 2 * atr[i];
        const parsedLow    = isVolatile ? c.high : c.low;
        if (parsedLow < bestVal) { bestVal = parsedLow; bestIdx = i; }
      }
      if (bestIdx >= 0) {
        const c      = candles[bestIdx];
        const broken = candles.slice(ev.index + 1).some(fc => fc.close < c.low);
        obs.push({ index: bestIdx, date: c.date, top: c.open, bottom: c.low, type: 'bullish', broken, tier });
        seenIdx.add(bestIdx);
      }
    } else {
      // Find the bullish candle with the highest ATR-parsed high in the lookback window
      let bestIdx = -1, bestVal = -Infinity;
      for (let i = ev.index - 1; i >= ev.index - searchBack; i--) {
        if (i < 0 || seenIdx.has(i)) continue;
        const c = candles[i];
        if (c.close <= c.open) continue; // must be a bullish candle
        const isVolatile   = atr[i] > 0 && (c.high - c.low) >= 2 * atr[i];
        const parsedHigh   = isVolatile ? c.low : c.high;
        if (parsedHigh > bestVal) { bestVal = parsedHigh; bestIdx = i; }
      }
      if (bestIdx >= 0) {
        const c      = candles[bestIdx];
        const broken = candles.slice(ev.index + 1).some(fc => fc.close > c.high);
        obs.push({ index: bestIdx, date: c.date, top: c.high, bottom: c.close, type: 'bearish', broken, tier });
        seenIdx.add(bestIdx);
      }
    }
  }

  return obs;
}

/* ─────────────────────────────────────────────
   Fair Value Gaps
───────────────────────────────────────────── */
function detectFVGs(candles: Candle[]): FairValueGap[] {
  const fvgs: FairValueGap[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1], curr = candles[i], next = candles[i + 1];
    if (next.low > prev.high) {
      const top = next.low, bottom = prev.high;
      const filled = candles.slice(i + 2).some(c => c.low <= (top + bottom) / 2);
      fvgs.push({ index: i, date: curr.date, top, bottom, type: 'bullish', filled });
    }
    if (next.high < prev.low) {
      const top = prev.low, bottom = next.high;
      const filled = candles.slice(i + 2).some(c => c.high >= (top + bottom) / 2);
      fvgs.push({ index: i, date: curr.date, top, bottom, type: 'bearish', filled });
    }
  }
  return fvgs;
}

/* ─────────────────────────────────────────────
   Equal Highs / Equal Lows
   Two consecutive swing highs within EQL_THRESHOLD * ATR = EQH
───────────────────────────────────────────── */
function detectEqualLevels(swings: SwingPoint[], atr: number[]): EqualLevel[] {
  const levels: EqualLevel[] = [];

  const highs = swings.filter(s => s.type === 'high');
  for (let i = 1; i < highs.length; i++) {
    const prev = highs[i - 1], curr = highs[i];
    const threshold = (atr[curr.index] ?? 0) * EQL_THRESHOLD;
    if (threshold > 0 && Math.abs(curr.price - prev.price) < threshold) {
      levels.push({
        index: curr.index, date: curr.date,
        price: (curr.price + prev.price) / 2,
        prevIndex: prev.index, prevDate: prev.date,
        type: 'EQH',
      });
    }
  }

  const lows = swings.filter(s => s.type === 'low');
  for (let i = 1; i < lows.length; i++) {
    const prev = lows[i - 1], curr = lows[i];
    const threshold = (atr[curr.index] ?? 0) * EQL_THRESHOLD;
    if (threshold > 0 && Math.abs(curr.price - prev.price) < threshold) {
      levels.push({
        index: curr.index, date: curr.date,
        price: (curr.price + prev.price) / 2,
        prevIndex: prev.index, prevDate: prev.date,
        type: 'EQL',
      });
    }
  }

  return levels.sort((a, b) => a.index - b.index);
}

/* ─────────────────────────────────────────────
   Trailing Extremes — Strong / Weak High / Low
   Most recent macro swing high and low.
   Strong High = in downtrend (resistance holding)
   Strong Low  = in uptrend  (support holding)
───────────────────────────────────────────── */
function calcTrailingExtreme(
  swings: SwingPoint[],
  trend: 'bullish' | 'bearish' | 'ranging',
): TrailingExtreme | null {
  const lastHigh = [...swings].reverse().find(s => s.type === 'high');
  const lastLow  = [...swings].reverse().find(s => s.type === 'low');
  if (!lastHigh || !lastLow) return null;

  return {
    high:      lastHigh.price,
    highDate:  lastHigh.date,
    highIndex: lastHigh.index,
    low:       lastLow.price,
    lowDate:   lastLow.date,
    lowIndex:  lastLow.index,
    strongHigh: trend === 'bearish',
    strongLow:  trend === 'bullish',
  };
}

/* ─────────────────────────────────────────────
   Premium / Discount Zone
───────────────────────────────────────────── */
function calcPremiumDiscount(candles: Candle[]): PremiumDiscountZone | null {
  if (candles.length < 20) return null;
  const window = candles.slice(-100);
  const high   = Math.max(...window.map(c => c.high));
  const low    = Math.min(...window.map(c => c.low));
  const range  = high - low;
  if (range === 0) return null;

  const midpoint     = (high + low) / 2;
  const currentPrice = candles[candles.length - 1].close;
  const posInRange   = (currentPrice - low) / range;

  const zone: PremiumDiscountZone['zone'] =
    Math.abs(currentPrice - midpoint) / range < 0.025 ? 'equilibrium'
    : currentPrice > midpoint ? 'premium' : 'discount';

  return { high, low, midpoint, zone, currentPrice, premiumPct: Math.round(posInRange * 100) };
}

/* ─────────────────────────────────────────────
   Trend inference
───────────────────────────────────────────── */
function inferTrend(structure: StructureEvent[]): 'bullish' | 'bearish' | 'ranging' {
  if (!structure.length) return 'ranging';
  const recent = structure.slice(-3);
  const bull   = recent.filter(e => e.direction === 'bullish').length;
  const bear   = recent.filter(e => e.direction === 'bearish').length;
  if (bull > bear) return 'bullish';
  if (bear > bull) return 'bearish';
  return 'ranging';
}

/* ─────────────────────────────────────────────
   Main Export
───────────────────────────────────────────── */
export function calcSMC(candles: Candle[]): SMCData {
  const empty: SMCData = {
    swings: [], structure: [], orderBlocks: [],
    internalSwings: [], internalStructure: [], internalOrderBlocks: [],
    fvgs: [], equalLevels: [], trailingExtreme: null, pdZone: null,
    trend: 'ranging', internalTrend: 'ranging',
  };
  if (candles.length < 20) return empty;

  const atr = calcATR(candles);

  // ── Swing tier (macro) ─────────────────────────────────────────
  const swings      = detectSwings(candles, SWING_LOOKBACK, 'swing');
  const structure   = detectStructure(swings, 'swing');
  const orderBlocks = detectOrderBlocks(candles, structure, atr, 'swing');
  const trend       = inferTrend(structure);

  // ── Internal tier (micro) ──────────────────────────────────────
  const internalSwings      = detectSwings(candles, INTERNAL_LOOKBACK, 'internal');
  const internalStructure   = detectStructure(internalSwings, 'internal');
  const internalOrderBlocks = detectOrderBlocks(candles, internalStructure, atr, 'internal');
  const internalTrend       = inferTrend(internalStructure);

  // ── Shared ─────────────────────────────────────────────────────
  const fvgs            = detectFVGs(candles);
  const equalLevels     = detectEqualLevels(swings, atr);
  const trailingExtreme = calcTrailingExtreme(swings, trend);
  const pdZone          = calcPremiumDiscount(candles);

  const cutoff = candles.length - RECENT_WINDOW;

  return {
    swings:              swings.filter(s  => s.index  >= cutoff),
    structure:           structure.filter(e => e.index >= cutoff),
    orderBlocks:         orderBlocks.filter(ob => !ob.broken && ob.index >= cutoff).slice(-6),
    internalSwings:      internalSwings.filter(s  => s.index  >= cutoff),
    internalStructure:   internalStructure.filter(e => e.index >= cutoff),
    internalOrderBlocks: internalOrderBlocks.filter(ob => !ob.broken && ob.index >= cutoff).slice(-8),
    fvgs:                fvgs.filter(f => !f.filled && f.index >= cutoff).slice(-8),
    equalLevels:         equalLevels.filter(e => e.index >= cutoff),
    trailingExtreme,
    pdZone,
    trend,
    internalTrend,
  };
}
