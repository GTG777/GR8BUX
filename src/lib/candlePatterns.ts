/* ─────────────────────────────────────────────────────────────────
   Candlestick Pattern Recognition
   Works on any OHLCV candlestick array (daily, intraday, etc.)
   Returns an array of detected patterns on the most recent candles.
───────────────────────────────────────────────────────────────── */

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PatternSignal = 'bullish' | 'bearish' | 'neutral';
export type PatternStrength = 1 | 2 | 3; // 1=weak, 2=moderate, 3=strong

export interface CandlePattern {
  name: string;
  emoji: string;
  signal: PatternSignal;
  strength: PatternStrength;
  spanCandles: 1 | 2 | 3;
  description: string;
  tradingImplication: string;
}

/* ── Helpers ─────────────────────────────────────────────────────── */
const body  = (c: Candle) => Math.abs(c.close - c.open);
const range = (c: Candle) => c.high - c.low;
const upperShadow = (c: Candle) => c.high - Math.max(c.open, c.close);
const lowerShadow = (c: Candle) => Math.min(c.open, c.close) - c.low;
const isBull = (c: Candle) => c.close > c.open;
const isBear = (c: Candle) => c.close < c.open;
const bodyPct = (c: Candle) => range(c) > 0 ? body(c) / range(c) : 0;

/* ── Pattern detectors ───────────────────────────────────────────── */

function detectSingleCandle(c: Candle): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  const b  = body(c);
  const r  = range(c);
  const us = upperShadow(c);
  const ls = lowerShadow(c);

  if (r === 0) return patterns;

  // ── Doji ──────────────────────────────────────────────────────
  // Body < 10% of range, both shadows prominent
  if (bodyPct(c) < 0.1 && us > r * 0.15 && ls > r * 0.15) {
    patterns.push({
      name: 'Doji',
      emoji: '✚',
      signal: 'neutral',
      strength: 1,
      spanCandles: 1,
      description: `Open ≈ Close ($${c.open.toFixed(2)}). Indecision — buyers and sellers in balance.`,
      tradingImplication: 'Wait for confirmation candle in either direction before entering.',
    });
    return patterns; // Doji overrides other single-candle patterns
  }

  // ── Hammer (bullish reversal, needs prior downtrend context) ──
  // Small body near top, lower shadow ≥ 2× body, tiny upper shadow
  if (b > 0 && ls >= 2 * b && us <= b * 0.5 && bodyPct(c) < 0.4) {
    patterns.push({
      name: 'Hammer',
      emoji: '🔨',
      signal: 'bullish',
      strength: 2,
      spanCandles: 1,
      description: `Long lower shadow (${(ls / r * 100).toFixed(0)}% of range) rejected by buyers. Small body near the top.`,
      tradingImplication: 'Potential bottom reversal. Enter long above the high with stop below the hammer low.',
    });
  }

  // ── Inverted Hammer / Shooting Star ───────────────────────────
  // Small body near bottom, upper shadow ≥ 2× body
  if (b > 0 && us >= 2 * b && ls <= b * 0.5 && bodyPct(c) < 0.4) {
    if (isBull(c)) {
      patterns.push({
        name: 'Inverted Hammer',
        emoji: '🔻',
        signal: 'bullish',
        strength: 1,
        spanCandles: 1,
        description: `Long upper shadow rejected, but bullish close. Buyers attempted recovery.`,
        tradingImplication: 'Weak bullish reversal signal. Needs bullish confirmation next session.',
      });
    } else {
      patterns.push({
        name: 'Shooting Star',
        emoji: '🌠',
        signal: 'bearish',
        strength: 2,
        spanCandles: 1,
        description: `Long upper wick (${(us / r * 100).toFixed(0)}% of range) — buyers failed to hold gains, sellers reclaimed close.`,
        tradingImplication: 'Bearish reversal at resistance. Enter short below the low; stop above the wick high.',
      });
    }
  }

  // ── Bullish Marubozu ─────────────────────────────────────────
  // Open ≈ low, close ≈ high, tiny shadows
  if (isBull(c) && bodyPct(c) > 0.85 && us < r * 0.05 && ls < r * 0.05) {
    patterns.push({
      name: 'Bullish Marubozu',
      emoji: '🟩',
      signal: 'bullish',
      strength: 3,
      spanCandles: 1,
      description: `Strong bullish candle — opened at low, closed at high. No rejection wicks.`,
      tradingImplication: 'Strong momentum. Pullbacks to the open price are buy opportunities.',
    });
  }

  // ── Bearish Marubozu ─────────────────────────────────────────
  // Open ≈ high, close ≈ low, tiny shadows
  if (isBear(c) && bodyPct(c) > 0.85 && us < r * 0.05 && ls < r * 0.05) {
    patterns.push({
      name: 'Bearish Marubozu',
      emoji: '🟥',
      signal: 'bearish',
      strength: 3,
      spanCandles: 1,
      description: `Strong bearish candle — opened at high, closed at low. No buying wicks.`,
      tradingImplication: 'Strong selling pressure. Rallies to the open price are short opportunities.',
    });
  }

  // ── Spinning Top ────────────────────────────────────────────
  // Small body (10–35%), both shadows long
  if (bodyPct(c) > 0.1 && bodyPct(c) < 0.35 && us > r * 0.25 && ls > r * 0.25) {
    patterns.push({
      name: 'Spinning Top',
      emoji: '🌀',
      signal: 'neutral',
      strength: 1,
      spanCandles: 1,
      description: `Small body with long shadows on both sides — indecision / tug of war between bulls and bears.`,
      tradingImplication: 'Wait for next candle to determine direction. No immediate edge.',
    });
  }

  return patterns;
}

function detectTwoCandle(prev: Candle, curr: Candle): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  const pb = body(prev);
  const cb = body(curr);

  // ── Bullish Engulfing ─────────────────────────────────────────
  if (
    isBear(prev) && isBull(curr) &&
    curr.open  < prev.close &&
    curr.close > prev.open  &&
    cb > pb * 1.05
  ) {
    patterns.push({
      name: 'Bullish Engulfing',
      emoji: '🟢',
      signal: 'bullish',
      strength: 3,
      spanCandles: 2,
      description: `Bullish candle completely engulfs prior bearish candle body.`,
      tradingImplication: 'Strong reversal signal. Enter long above the engulfing candle high. Stop below the low.',
    });
  }

  // ── Bearish Engulfing ─────────────────────────────────────────
  if (
    isBull(prev) && isBear(curr) &&
    curr.open  > prev.close &&
    curr.close < prev.open  &&
    cb > pb * 1.05
  ) {
    patterns.push({
      name: 'Bearish Engulfing',
      emoji: '🔴',
      signal: 'bearish',
      strength: 3,
      spanCandles: 2,
      description: `Bearish candle completely engulfs prior bullish candle body.`,
      tradingImplication: 'Strong reversal signal. Enter short below the engulfing candle low. Stop above the high.',
    });
  }

  // ── Bullish Harami ────────────────────────────────────────────
  if (
    isBear(prev) && isBull(curr) &&
    curr.open  > prev.close &&
    curr.close < prev.open  &&
    cb < pb * 0.6
  ) {
    patterns.push({
      name: 'Bullish Harami',
      emoji: '🌱',
      signal: 'bullish',
      strength: 1,
      spanCandles: 2,
      description: `Small bullish candle contained inside prior large bearish candle — momentum slowing.`,
      tradingImplication: 'Weak reversal. Confirm with a bullish close above the harami high next session.',
    });
  }

  // ── Bearish Harami ────────────────────────────────────────────
  if (
    isBull(prev) && isBear(curr) &&
    curr.open  < prev.close &&
    curr.close > prev.open  &&
    cb < pb * 0.6
  ) {
    patterns.push({
      name: 'Bearish Harami',
      emoji: '🍂',
      signal: 'bearish',
      strength: 1,
      spanCandles: 2,
      description: `Small bearish candle contained inside prior large bullish candle — uptrend losing steam.`,
      tradingImplication: 'Weak reversal. Confirm with a bearish close below the harami low next session.',
    });
  }

  // ── Piercing Line ─────────────────────────────────────────────
  // Bullish: prior bearish, current opens below prev low, closes above midpoint of prev body
  const prevMidBear = (prev.open + prev.close) / 2;
  if (
    isBear(prev) && isBull(curr) &&
    curr.open < prev.low &&
    curr.close > prevMidBear && curr.close < prev.open &&
    pb > 0
  ) {
    patterns.push({
      name: 'Piercing Line',
      emoji: '🗡️',
      signal: 'bullish',
      strength: 2,
      spanCandles: 2,
      description: `Opens below prior low then closes above the midpoint of the bearish candle — buyers stepped in decisively.`,
      tradingImplication: 'Bullish reversal. Enter long on confirmation above the piercing candle high.',
    });
  }

  // ── Dark Cloud Cover ─────────────────────────────────────────
  // Bearish: prior bullish, current opens above prev high, closes below midpoint
  const prevMidBull = (prev.open + prev.close) / 2;
  if (
    isBull(prev) && isBear(curr) &&
    curr.open > prev.high &&
    curr.close < prevMidBull && curr.close > prev.open &&
    pb > 0
  ) {
    patterns.push({
      name: 'Dark Cloud Cover',
      emoji: '🌧️',
      signal: 'bearish',
      strength: 2,
      spanCandles: 2,
      description: `Opens above prior high then closes below the midpoint of the bullish candle — sellers overwhelmed buyers.`,
      tradingImplication: 'Bearish reversal. Enter short on break below the dark cloud candle low.',
    });
  }

  // ── Tweezer Top ──────────────────────────────────────────────
  if (
    isBull(prev) && isBear(curr) &&
    Math.abs(prev.high - curr.high) / Math.max(prev.high, curr.high) < 0.003
  ) {
    patterns.push({
      name: 'Tweezer Top',
      emoji: '📌',
      signal: 'bearish',
      strength: 2,
      spanCandles: 2,
      description: `Two candles with matching highs — double rejection at resistance level.`,
      tradingImplication: 'Resistance confirmed. Short below the common high; stop just above the wick.',
    });
  }

  // ── Tweezer Bottom ───────────────────────────────────────────
  if (
    isBear(prev) && isBull(curr) &&
    Math.abs(prev.low - curr.low) / Math.max(prev.low, curr.low) < 0.003
  ) {
    patterns.push({
      name: 'Tweezer Bottom',
      emoji: '📍',
      signal: 'bullish',
      strength: 2,
      spanCandles: 2,
      description: `Two candles with matching lows — double support test held by buyers.`,
      tradingImplication: 'Support confirmed. Long above the common low; stop just below the wick.',
    });
  }

  return patterns;
}

function detectThreeCandle(c1: Candle, c2: Candle, c3: Candle): CandlePattern[] {
  const patterns: CandlePattern[] = [];

  // ── Morning Star ─────────────────────────────────────────────
  const b1 = body(c1), b2 = body(c2), b3 = body(c3);
  if (
    isBear(c1) && b1 > 0 &&
    b2 < b1 * 0.4 &&                         // small middle candle
    isBull(c3) &&
    c3.close > (c1.open + c1.close) / 2 &&   // closes in upper half of c1 body
    c2.high < Math.min(c1.close, c3.open)     // gap condition (relaxed)
  ) {
    patterns.push({
      name: 'Morning Star',
      emoji: '🌅',
      signal: 'bullish',
      strength: 3,
      spanCandles: 3,
      description: `Classic 3-candle bottom reversal: bearish → small star → bullish recovery above midpoint.`,
      tradingImplication: 'High-reliability reversal. Enter long above the third candle high. Stop below the star candle low.',
    });
  }

  // ── Evening Star ─────────────────────────────────────────────
  if (
    isBull(c1) && b1 > 0 &&
    b2 < b1 * 0.4 &&                          // small middle candle
    isBear(c3) &&
    c3.close < (c1.open + c1.close) / 2 &&    // closes in lower half of c1 body
    c2.low > Math.max(c1.close, c3.open)       // gap condition (relaxed)
  ) {
    patterns.push({
      name: 'Evening Star',
      emoji: '🌇',
      signal: 'bearish',
      strength: 3,
      spanCandles: 3,
      description: `Classic 3-candle top reversal: bullish → small star → bearish decline below midpoint.`,
      tradingImplication: 'High-reliability reversal. Enter short below the third candle low. Stop above the star candle high.',
    });
  }

  // ── Three White Soldiers ───────────────────────────────────
  if (
    isBull(c1) && isBull(c2) && isBull(c3) &&
    c2.open > c1.open && c2.close > c1.close &&
    c3.open > c2.open && c3.close > c2.close &&
    bodyPct(c1) > 0.5 && bodyPct(c2) > 0.5 && bodyPct(c3) > 0.5
  ) {
    patterns.push({
      name: 'Three White Soldiers',
      emoji: '🪖',
      signal: 'bullish',
      strength: 3,
      spanCandles: 3,
      description: `Three consecutive strong bullish candles, each closing near its high with higher opens.`,
      tradingImplication: 'Powerful momentum signal. Consider entering on pullback to the third candle midpoint.',
    });
  }

  // ── Three Black Crows ────────────────────────────────────────
  if (
    isBear(c1) && isBear(c2) && isBear(c3) &&
    c2.open < c1.open && c2.close < c1.close &&
    c3.open < c2.open && c3.close < c2.close &&
    bodyPct(c1) > 0.5 && bodyPct(c2) > 0.5 && bodyPct(c3) > 0.5
  ) {
    patterns.push({
      name: 'Three Black Crows',
      emoji: '🐦‍⬛',
      signal: 'bearish',
      strength: 3,
      spanCandles: 3,
      description: `Three consecutive strong bearish candles, each closing near its low with lower opens.`,
      tradingImplication: 'Powerful selling pressure. Short on rally to the third candle midpoint.',
    });
  }

  // ── Three Inside Up ──────────────────────────────────────────
  // Bullish Harami (c1 bear, c2 bull inside) + confirmation (c3 bull above c2)
  if (
    isBear(c1) && isBull(c2) && isBull(c3) &&
    c2.open > c1.close && c2.close < c1.open && // c2 inside c1
    c3.close > c2.close                          // bullish confirmation
  ) {
    patterns.push({
      name: 'Three Inside Up',
      emoji: '📶',
      signal: 'bullish',
      strength: 2,
      spanCandles: 3,
      description: `Harami followed by bullish confirmation — reversal confirmed by third candle's higher close.`,
      tradingImplication: 'Confirmed bullish reversal. Enter long above the third candle with stop below the first candle low.',
    });
  }

  // ── Three Inside Down ─────────────────────────────────────────
  if (
    isBull(c1) && isBear(c2) && isBear(c3) &&
    c2.open < c1.close && c2.close > c1.open && // c2 inside c1
    c3.close < c2.close                          // bearish confirmation
  ) {
    patterns.push({
      name: 'Three Inside Down',
      emoji: '📉',
      signal: 'bearish',
      strength: 2,
      spanCandles: 3,
      description: `Bearish harami followed by bearish confirmation — downside reversal confirmed.`,
      tradingImplication: 'Confirmed bearish reversal. Enter short below the third candle with stop above the first candle high.',
    });
  }

  return patterns;
}

/* ── Main entry point ────────────────────────────────────────────── */
export function detectCandlePatterns(candles: Candle[]): CandlePattern[] {
  if (candles.length < 1) return [];

  const last  = candles[candles.length - 1];
  const prev1 = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  const found: CandlePattern[] = [];

  // Single-candle patterns on last candle
  found.push(...detectSingleCandle(last));

  // Two-candle patterns
  if (prev1) found.push(...detectTwoCandle(prev1, last));

  // Three-candle patterns
  if (prev1 && prev2) found.push(...detectThreeCandle(prev2, prev1, last));

  // Deduplicate: if a stronger multi-candle pattern is found, suppress weaker single/double
  const hasStrong3 = found.some((p) => p.spanCandles === 3 && p.strength === 3);
  const hasStrong2 = found.some((p) => p.spanCandles === 2 && p.strength >= 2);

  return found
    .filter((p) => {
      if (hasStrong3 && p.spanCandles === 1 && p.strength <= 1) return false;
      if (hasStrong2 && p.spanCandles === 1 && p.signal === 'neutral' && p.strength === 1) return false;
      return true;
    })
    .sort((a, b) => b.strength - a.strength || b.spanCandles - a.spanCandles);
}
