/* ─────────────────────────────────────────────────────────────────
   Smart Money Concepts (SMC) — Lux Algo style indicator
   Pure client-side calculations. No API calls needed.

   Detects:
     • Swing Highs / Lows
     • Break of Structure (BOS) — trend continuation
     • Change of Character (CHoCH) — potential reversal
     • Order Blocks (OB) — last opposing candle before a structure break
     • Fair Value Gaps (FVG) — price imbalances
     • Premium / Discount zones — above/below 50% of the swing range
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
}

export interface StructureEvent {
  index: number;
  date: string;
  price: number;
  /** BOS = trend continuation; CHoCH = first break against trend (reversal warning) */
  type: 'BOS' | 'CHoCH';
  direction: 'bullish' | 'bearish';
}

export interface OrderBlock {
  index: number;
  date: string;
  top: number;
  bottom: number;
  /** bullish OB = last bear candle before a bullish break; bearish OB = vice versa */
  type: 'bullish' | 'bearish';
  broken: boolean;
}

export interface FairValueGap {
  index: number;
  date: string;
  top: number;
  bottom: number;
  type: 'bullish' | 'bearish';
  filled: boolean;
}

export interface PremiumDiscountZone {
  high: number;
  low: number;
  midpoint: number;
  /** current price zone */
  zone: 'premium' | 'discount' | 'equilibrium';
  currentPrice: number;
  premiumPct: number;  // how far into premium/discount (0-100)
}

export interface SMCData {
  swings: SwingPoint[];
  structure: StructureEvent[];
  orderBlocks: OrderBlock[];
  fvgs: FairValueGap[];
  pdZone: PremiumDiscountZone | null;
  trend: 'bullish' | 'bearish' | 'ranging';
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
const SWING_LOOKBACK = 5;
// How many candles to look back for visual clarity
const RECENT_WINDOW = 150;

/* ─────────────────────────────────────────────
   Swing High / Low Detection
   A swing high: candle[i].high is strictly greater than
   the SWING_LOOKBACK bars on each side.
───────────────────────────────────────────── */
function detectSwings(candles: Candle[]): SwingPoint[] {
  const swings: SwingPoint[] = [];
  const lb = SWING_LOOKBACK;

  for (let i = lb; i < candles.length - lb; i++) {
    const c = candles[i];

    let isSwingHigh = true;
    let isSwingLow  = true;

    for (let j = 1; j <= lb; j++) {
      if (candles[i - j].high >= c.high || candles[i + j].high >= c.high) isSwingHigh = false;
      if (candles[i - j].low  <= c.low  || candles[i + j].low  <= c.low)  isSwingLow  = false;
      if (!isSwingHigh && !isSwingLow) break;
    }

    if (isSwingHigh) swings.push({ index: i, date: c.date, price: c.high, type: 'high' });
    if (isSwingLow)  swings.push({ index: i, date: c.date, price: c.low,  type: 'low'  });
  }

  return swings.sort((a, b) => a.index - b.index);
}

/* ─────────────────────────────────────────────
   BOS / CHoCH Detection
   Walk through alternating swing highs and lows.
   - BOS = break in the direction of the current trend
   - CHoCH = first break AGAINST the current trend (reversal warning)
───────────────────────────────────────────── */
function detectStructure(swings: SwingPoint[]): StructureEvent[] {
  const events: StructureEvent[] = [];
  if (swings.length < 4) return events;

  let trend: 'up' | 'down' | null = null;
  let lastHigh: SwingPoint | null = null;
  let lastLow:  SwingPoint | null = null;

  for (const swing of swings) {
    if (swing.type === 'high') {
      if (lastHigh !== null) {
        if (swing.price > lastHigh.price) {
          // Higher High
          if (trend === 'down') {
            // Was downtrend, now HH → CHoCH bullish
            events.push({ index: swing.index, date: swing.date, price: swing.price, type: 'CHoCH', direction: 'bullish' });
          } else {
            // Continuing uptrend or first signal
            if (trend === 'up') {
              events.push({ index: swing.index, date: swing.date, price: swing.price, type: 'BOS', direction: 'bullish' });
            }
          }
          trend = 'up';
        } else {
          // Lower High
          if (trend === 'up') {
            // Was uptrend, now LH → CHoCH bearish
            events.push({ index: swing.index, date: swing.date, price: swing.price, type: 'CHoCH', direction: 'bearish' });
          } else {
            if (trend === 'down') {
              events.push({ index: swing.index, date: swing.date, price: swing.price, type: 'BOS', direction: 'bearish' });
            }
          }
          trend = 'down';
        }
      }
      lastHigh = swing;

    } else {
      // swing.type === 'low'
      if (lastLow !== null) {
        if (swing.price < lastLow.price) {
          // Lower Low
          if (trend === 'up') {
            events.push({ index: swing.index, date: swing.date, price: swing.price, type: 'CHoCH', direction: 'bearish' });
          } else {
            if (trend === 'down') {
              events.push({ index: swing.index, date: swing.date, price: swing.price, type: 'BOS', direction: 'bearish' });
            }
          }
          trend = 'down';
        } else {
          // Higher Low
          if (trend === 'down') {
            events.push({ index: swing.index, date: swing.date, price: swing.price, type: 'CHoCH', direction: 'bullish' });
          } else {
            if (trend === 'up') {
              events.push({ index: swing.index, date: swing.date, price: swing.price, type: 'BOS', direction: 'bullish' });
            }
          }
          trend = 'up';
        }
      }
      lastLow = swing;
    }
  }

  return events;
}

/* ─────────────────────────────────────────────
   Order Block Detection
   Bullish OB = last bearish candle before a bullish BOS/CHoCH
   Bearish OB = last bullish candle before a bearish BOS/CHoCH
───────────────────────────────────────────── */
function detectOrderBlocks(candles: Candle[], structure: StructureEvent[]): OrderBlock[] {
  const obs: OrderBlock[] = [];
  const seenIdx = new Set<number>();

  for (const ev of structure) {
    if (ev.direction === 'bullish') {
      // Find last bearish candle before this event index
      for (let i = ev.index - 1; i >= Math.max(0, ev.index - 25); i--) {
        const c = candles[i];
        if (c.close < c.open && !seenIdx.has(i)) {
          const broken = candles.slice(ev.index + 1).some(fc => fc.close < c.low);
          obs.push({ index: i, date: c.date, top: c.open, bottom: c.low, type: 'bullish', broken });
          seenIdx.add(i);
          break;
        }
      }
    } else {
      // Find last bullish candle before this event index
      for (let i = ev.index - 1; i >= Math.max(0, ev.index - 25); i--) {
        const c = candles[i];
        if (c.close > c.open && !seenIdx.has(i)) {
          const broken = candles.slice(ev.index + 1).some(fc => fc.close > c.high);
          obs.push({ index: i, date: c.date, top: c.high, bottom: c.close, type: 'bearish', broken });
          seenIdx.add(i);
          break;
        }
      }
    }
  }

  return obs;
}

/* ─────────────────────────────────────────────
   Fair Value Gap (FVG) Detection
   Bullish FVG: candle[i+1].low > candle[i-1].high  (up-gap imbalance)
   Bearish FVG: candle[i+1].high < candle[i-1].low  (down-gap imbalance)
   A FVG is "filled" when price retraces to the 50% level of the gap.
───────────────────────────────────────────── */
function detectFVGs(candles: Candle[]): FairValueGap[] {
  const fvgs: FairValueGap[] = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];

    // Bullish FVG
    if (next.low > prev.high) {
      const top    = next.low;
      const bottom = prev.high;
      const mid    = (top + bottom) / 2;
      const filled = candles.slice(i + 2).some(c => c.low <= mid);
      fvgs.push({ index: i, date: curr.date, top, bottom, type: 'bullish', filled });
    }

    // Bearish FVG
    if (next.high < prev.low) {
      const top    = prev.low;
      const bottom = next.high;
      const mid    = (top + bottom) / 2;
      const filled = candles.slice(i + 2).some(c => c.high >= mid);
      fvgs.push({ index: i, date: curr.date, top, bottom, type: 'bearish', filled });
    }
  }

  return fvgs;
}

/* ─────────────────────────────────────────────
   Premium / Discount Zone
   Uses the last N candles' swing range.
   Above 50% (midpoint) = Premium (overvalued, bias sell)
   Below 50% = Discount (undervalued, bias buy)
   Within ±2.5% of midpoint = Equilibrium
───────────────────────────────────────────── */
function calcPremiumDiscount(candles: Candle[]): PremiumDiscountZone | null {
  if (candles.length < 20) return null;

  const window = candles.slice(-100);
  const high = Math.max(...window.map(c => c.high));
  const low  = Math.min(...window.map(c => c.low));
  const range = high - low;
  if (range === 0) return null;

  const midpoint     = (high + low) / 2;
  const currentPrice = candles[candles.length - 1].close;
  const posInRange   = (currentPrice - low) / range; // 0 = at low, 1 = at high

  let zone: 'premium' | 'discount' | 'equilibrium';
  if (Math.abs(currentPrice - midpoint) / range < 0.025) {
    zone = 'equilibrium';
  } else if (currentPrice > midpoint) {
    zone = 'premium';
  } else {
    zone = 'discount';
  }

  const premiumPct = Math.round(posInRange * 100);

  return { high, low, midpoint, zone, currentPrice, premiumPct };
}

/* ─────────────────────────────────────────────
   Trend inference from structure events
───────────────────────────────────────────── */
function inferTrend(structure: StructureEvent[]): 'bullish' | 'bearish' | 'ranging' {
  if (structure.length === 0) return 'ranging';
  // Look at last 3 structure events
  const recent = structure.slice(-3);
  const bullish = recent.filter(e => e.direction === 'bullish').length;
  const bearish = recent.filter(e => e.direction === 'bearish').length;
  if (bullish > bearish) return 'bullish';
  if (bearish > bullish) return 'bearish';
  return 'ranging';
}

/* ─────────────────────────────────────────────
   Main export
───────────────────────────────────────────── */
export function calcSMC(candles: Candle[]): SMCData {
  if (candles.length < 20) {
    return { swings: [], structure: [], orderBlocks: [], fvgs: [], pdZone: null, trend: 'ranging' };
  }

  const allSwings    = detectSwings(candles);
  const allStructure = detectStructure(allSwings);
  const allOBs       = detectOrderBlocks(candles, allStructure);
  const allFVGs      = detectFVGs(candles);
  const pdZone       = calcPremiumDiscount(candles);
  const trend        = inferTrend(allStructure);

  const cutoff = candles.length - RECENT_WINDOW;

  return {
    swings:      allSwings.filter(s  => s.index  >= cutoff),
    structure:   allStructure.filter(e => e.index >= cutoff),
    // Only show active (unbroken) OBs within the visible window
    orderBlocks: allOBs.filter(ob => !ob.broken && ob.index >= cutoff).slice(-6),
    // Only show unfilled FVGs within window, most recent first
    fvgs:        allFVGs.filter(f  => !f.filled && f.index >= cutoff).slice(-8),
    pdZone,
    trend,
  };
}
