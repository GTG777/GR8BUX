/**
 * Technical Setups Detection Service
 * Identifies coiling stocks, consolidation patterns, and other technical setups
 * Includes Smart Money Concepts (SMC): Order Blocks, FVGs, BOS/CHoCH, Liquidity
 */
import { OrderBlock, FairValueGap, StructureBreak, LiquidityLevel, SMCAnalysis } from '@/types';

export interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalSetup {
  symbol: string;
  setupType: 'coiling' | 'consolidation' | 'breakout' | 'support_resistance' | 'trend';
  confidence: number; // 0-100
  description: string;
  formation: string[];
  entryPrice?: number;
  stopLoss?: number;
  targetPrice?: number;
  rsiValue?: number;
  volatility?: number;
}

class TechnicalService {
  /**
   * Find coiling stocks (tight range, low volatility before breakout)
   */
  detectCoiling(prices: PriceData[]): TechnicalSetup | null {
    if (prices.length < 20) return null;

    const recent = prices.slice(-20);

    // Calculate range
    const highs = recent.map((p) => p.high);
    const lows = recent.map((p) => p.low);
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const range = maxHigh - minLow;
    const rangePercent = (range / minLow) * 100;

    // Calculate volatility (standard deviation)
    const closes = recent.map((p) => p.close);
    const avgClose = closes.reduce((a, b) => a + b) / closes.length;
    const variance = closes.reduce((sum, price) => sum + Math.pow(price - avgClose, 2), 0) / closes.length;
    const volatility = Math.sqrt(variance);
    const volatilityPercent = (volatility / avgClose) * 100;

    // Coiling = tight range (< 3%) + low volatility (< 2%)
    if (rangePercent < 3 && volatilityPercent < 2) {
      const lastPrice = prices[prices.length - 1].close;
      const breakoutTarget = lastPrice + lastPrice * (rangePercent / 100);
      const stopLoss = minLow - (range * 0.1); // Stop below range with 10% cushion

      return {
        symbol: '',
        setupType: 'coiling',
        confidence: Math.min(95, 70 + (3 - rangePercent) * 10 + (2 - volatilityPercent) * 10),
        description: `Tight coiling pattern detected. Price consolidated in ${rangePercent.toFixed(2)}% range with ${volatilityPercent.toFixed(2)}% volatility.`,
        formation: [
          `20-day high-low range: ${range.toFixed(2)} (${rangePercent.toFixed(2)}%)`,
          `Volatility: ${volatilityPercent.toFixed(2)}%`,
          `Volume clues: Check for volume patterns`,
        ],
        entryPrice: lastPrice,
        stopLoss,
        targetPrice: breakoutTarget,
        volatility: volatilityPercent,
      };
    }

    return null;
  }

  /**
   * Detect consolidation patterns
   */
  detectConsolidation(prices: PriceData[]): TechnicalSetup | null {
    if (prices.length < 30) return null;

    const recent = prices.slice(-30);
    const closes = recent.map((p) => p.close);

    // Moving averages
    const ma10 = this.calculateMA(closes, 10);
    const ma20 = this.calculateMA(closes, 20);

    // Check if price is trading within MA bands
    const lastClose = closes[closes.length - 1];
    const highMA = Math.max(ma10, ma20);
    const lowMA = Math.min(ma10, ma20);
    const bandRange = highMA - lowMA;

    // Consolidation = price near both MAs with low range
    if (Math.abs(lastClose - ma10) < bandRange * 0.3 && Math.abs(lastClose - ma20) < bandRange * 0.3) {
      const consolidationStrength = 100 - (bandRange / lastClose) * 100;

      return {
        symbol: '',
        setupType: 'consolidation',
        confidence: Math.min(90, 50 + consolidationStrength),
        description: `Consolidation detected. Price trading between 10-day (${ma10.toFixed(2)}) and 20-day (${ma20.toFixed(2)}) moving averages.`,
        formation: [
          `MA10: ${ma10.toFixed(2)}`,
          `MA20: ${ma20.toFixed(2)}`,
          `Current Price: ${lastClose.toFixed(2)}`,
          `Consolidation Strength: ${consolidationStrength.toFixed(0)}%`,
        ],
        entryPrice: lastClose,
        targetPrice: Math.max(ma10, ma20) * 1.02, // 2% above higher MA
        stopLoss: Math.min(ma10, ma20) * 0.98, // 2% below lower MA
      };
    }

    return null;
  }

  /**
   * Detect support and resistance levels
   */
  detectSupportResistance(prices: PriceData[]): TechnicalSetup | null {
    if (prices.length < 50) return null;

    const recent = prices.slice(-50);
    const highs = recent.map((p) => p.high);
    const lows = recent.map((p) => p.low);
    const closes = recent.map((p) => p.close);

    // Find pivot points (local highs and lows)
    const pivotHigh = Math.max(...highs.slice(-20));
    const pivotLow = Math.min(...lows.slice(-20));
    const lastClose = closes[closes.length - 1];

    // Check if price is between support and resistance
    if (lastClose > pivotLow && lastClose < pivotHigh) {
      const range = pivotHigh - pivotLow;
      const positionPercent = ((lastClose - pivotLow) / range) * 100;

      return {
        symbol: '',
        setupType: 'support_resistance',
        confidence: positionPercent > 40 && positionPercent < 60 ? 85 : 70,
        description: `Price between support (${pivotLow.toFixed(2)}) and resistance (${pivotHigh.toFixed(2)}).`,
        formation: [
          `Resistance Level: ${pivotHigh.toFixed(2)}`,
          `Support Level: ${pivotLow.toFixed(2)}`,
          `Current Price: ${lastClose.toFixed(2)}`,
          `Position: ${positionPercent.toFixed(0)}% from support`,
        ],
        entryPrice: lastClose,
        targetPrice: pivotHigh,
        stopLoss: pivotLow * 0.99,
      };
    }

    return null;
  }

  /**
   * Detect uptrend or downtrend
   */
  detectTrend(prices: PriceData[]): TechnicalSetup | null {
    if (prices.length < 50) return null;

    const recent = prices.slice(-50);
    const closes = recent.map((p) => p.close);

    const ma20 = this.calculateMA(closes, 20);
    const ma50 = this.calculateMA(closes, 50);
    const lastClose = closes[closes.length - 1];

    // Uptrend: price > MA20 > MA50
    if (lastClose > ma20 && ma20 > ma50) {
      return {
        symbol: '',
        setupType: 'trend',
        confidence: 80,
        description: `Uptrend detected. Price trading above 20-day and 50-day moving averages.`,
        formation: [
          `Price: ${lastClose.toFixed(2)}`,
          `MA20: ${ma20.toFixed(2)}`,
          `MA50: ${ma50.toFixed(2)}`,
          `Trend Direction: BULLISH ↑`,
        ],
        entryPrice: lastClose,
        targetPrice: lastClose * 1.05, // 5% target
        stopLoss: ma20 * 0.98,
      };
    }

    // Downtrend: price < MA20 < MA50
    if (lastClose < ma20 && ma20 < ma50) {
      return {
        symbol: '',
        setupType: 'trend',
        confidence: 80,
        description: `Downtrend detected. Price trading below 20-day and 50-day moving averages.`,
        formation: [
          `Price: ${lastClose.toFixed(2)}`,
          `MA20: ${ma20.toFixed(2)}`,
          `MA50: ${ma50.toFixed(2)}`,
          `Trend Direction: BEARISH ↓`,
        ],
        entryPrice: lastClose,
        targetPrice: lastClose * 0.95, // 5% target
        stopLoss: ma20 * 1.02,
      };
    }

    return null;
  }

  /**
   * Analyze all setups for a symbol
   */
  analyzeSetups(symbol: string, prices: PriceData[]): TechnicalSetup[] {
    const setups: TechnicalSetup[] = [];

    const coiling = this.detectCoiling(prices);
    if (coiling) {
      coiling.symbol = symbol;
      setups.push(coiling);
    }

    const consolidation = this.detectConsolidation(prices);
    if (consolidation) {
      consolidation.symbol = symbol;
      setups.push(consolidation);
    }

    const supportResistance = this.detectSupportResistance(prices);
    if (supportResistance) {
      supportResistance.symbol = symbol;
      setups.push(supportResistance);
    }

    const trend = this.detectTrend(prices);
    if (trend) {
      trend.symbol = symbol;
      setups.push(trend);
    }

    return setups.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate moving average
   */
  private calculateMA(prices: number[], period: number): number {
    if (prices.length < period) return prices.reduce((a, b) => a + b) / prices.length;
    return prices.slice(-period).reduce((a, b) => a + b) / period;
  }

  /**
   * Calculate RSI (Relative Strength Index)
   */
  calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50; // Neutral RSI if not enough data

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    return rsi;
  }

  // ─── Smart Money Concepts ────────────────────────────────────────────────────

  /**
   * Detect Order Blocks (last candle before a significant impulse move)
   * Bullish OB: bearish candle followed by strong bullish move
   * Bearish OB: bullish candle followed by strong bearish move
   */
  detectOrderBlocks(prices: PriceData[]): OrderBlock[] {
    if (prices.length < 5) return [];

    const orderBlocks: OrderBlock[] = [];
    const impulseThreshold = 0.005; // 0.5% move to qualify as impulse
    const lastPrice = prices[prices.length - 1].close;

    for (let i = 1; i < prices.length - 2; i++) {
      const candle = prices[i];
      const next = prices[i + 1];
      const nextNext = prices[i + 2];

      // Bullish OB: bearish candle (close < open) before upward impulse
      const bullishImpulse = (nextNext.close - next.open) / next.open;
      if (candle.close < candle.open && bullishImpulse > impulseThreshold && next.close > candle.high) {
        const mitigated = lastPrice >= candle.low && lastPrice <= candle.high;
        orderBlocks.push({ type: 'bullish', high: candle.high, low: candle.low, date: candle.date, mitigated });
      }

      // Bearish OB: bullish candle (close > open) before downward impulse
      const bearishImpulse = (next.open - nextNext.close) / next.open;
      if (candle.close > candle.open && bearishImpulse > impulseThreshold && next.close < candle.low) {
        const mitigated = lastPrice >= candle.low && lastPrice <= candle.high;
        orderBlocks.push({ type: 'bearish', high: candle.high, low: candle.low, date: candle.date, mitigated });
      }
    }

    // Return most recent 5 unmitigated OBs
    return orderBlocks.filter((ob) => !ob.mitigated).slice(-5);
  }

  /**
   * Detect Fair Value Gaps (3-candle imbalance)
   * Bullish FVG: prev.high < next.low (gap up)
   * Bearish FVG: prev.low > next.high (gap down)
   */
  detectFairValueGaps(prices: PriceData[]): FairValueGap[] {
    if (prices.length < 3) return [];

    const fvgs: FairValueGap[] = [];
    const lastPrice = prices[prices.length - 1].close;

    for (let i = 1; i < prices.length - 1; i++) {
      const prev = prices[i - 1];
      const curr = prices[i];
      const next = prices[i + 1];

      // Bullish FVG: gap between prev candle high and next candle low
      if (prev.high < next.low) {
        const top = next.low;
        const bottom = prev.high;
        const filled = lastPrice <= top && lastPrice >= bottom;
        fvgs.push({ top, bottom, date: curr.date, filled, direction: 'bullish' });
      }

      // Bearish FVG: gap between next candle high and prev candle low
      if (prev.low > next.high) {
        const top = prev.low;
        const bottom = next.high;
        const filled = lastPrice <= top && lastPrice >= bottom;
        fvgs.push({ top, bottom, date: curr.date, filled, direction: 'bearish' });
      }
    }

    // Return most recent 5 unfilled FVGs
    return fvgs.filter((g) => !g.filled).slice(-5);
  }

  /**
   * Detect Break of Structure (BOS) and Change of Character (CHoCH)
   * BOS: continuation — price breaks in direction of prior trend
   * CHoCH: reversal — price breaks against prior trend
   */
  detectStructureBreaks(prices: PriceData[]): StructureBreak[] {
    if (prices.length < 10) return [];

    const breaks: StructureBreak[] = [];
    const lookback = 5;

    for (let i = lookback; i < prices.length; i++) {
      const window = prices.slice(i - lookback, i);
      const prevHigh = Math.max(...window.map((p) => p.high));
      const prevLow = Math.min(...window.map((p) => p.low));
      const curr = prices[i];

      // Determine prior trend direction from window
      const priorBullish = window[window.length - 1].close > window[0].close;

      if (priorBullish) {
        if (curr.high > prevHigh) {
          breaks.push({ type: 'BOS', direction: 'bullish', price: prevHigh, date: curr.date });
        } else if (curr.low < prevLow) {
          breaks.push({ type: 'CHoCH', direction: 'bearish', price: prevLow, date: curr.date });
        }
      } else {
        if (curr.low < prevLow) {
          breaks.push({ type: 'BOS', direction: 'bearish', price: prevLow, date: curr.date });
        } else if (curr.high > prevHigh) {
          breaks.push({ type: 'CHoCH', direction: 'bullish', price: prevHigh, date: curr.date });
        }
      }
    }

    return breaks.slice(-5);
  }

  /**
   * Detect Liquidity Levels (equal highs = buy-side, equal lows = sell-side)
   * These are stop-loss clusters that smart money targets before reversing
   */
  detectLiquidityLevels(prices: PriceData[]): LiquidityLevel[] {
    if (prices.length < 10) return [];

    const levels: LiquidityLevel[] = [];
    const tolerance = 0.002; // 0.2% tolerance for "equal" levels
    const lastPrice = prices[prices.length - 1].close;
    const recent = prices.slice(-30);

    for (let i = 0; i < recent.length - 1; i++) {
      for (let j = i + 2; j < recent.length; j++) {
        // Equal highs → buy-side liquidity sits above (shorts' stops)
        const highDiff = Math.abs(recent[i].high - recent[j].high) / recent[i].high;
        if (highDiff < tolerance) {
          const level = (recent[i].high + recent[j].high) / 2;
          levels.push({ price: level, type: 'buy-side', swept: lastPrice > level, date: recent[j].date });
          break;
        }

        // Equal lows → sell-side liquidity sits below (longs' stops)
        const lowDiff = Math.abs(recent[i].low - recent[j].low) / recent[i].low;
        if (lowDiff < tolerance) {
          const level = (recent[i].low + recent[j].low) / 2;
          levels.push({ price: level, type: 'sell-side', swept: lastPrice < level, date: recent[j].date });
          break;
        }
      }
    }

    // Deduplicate by price bucket and return unswept levels only
    const seen = new Set<number>();
    return levels
      .filter((l) => {
        if (l.swept) return false;
        const bucket = Math.round(l.price * 10) / 10;
        if (seen.has(bucket)) return false;
        seen.add(bucket);
        return true;
      })
      .slice(0, 6);
  }

  /**
   * Full SMC Analysis — runs all four SMC detectors and determines
   * overall market bias (trend + premium/discount positioning)
   */
  analyzeSMC(symbol: string, prices: PriceData[]): SMCAnalysis {
    const orderBlocks = this.detectOrderBlocks(prices);
    const fairValueGaps = this.detectFairValueGaps(prices);
    const structureBreaks = this.detectStructureBreaks(prices);
    const liquidityLevels = this.detectLiquidityLevels(prices);

    const lastPrice = prices[prices.length - 1].close;

    // Overall trend from recent structure breaks
    const recentBreaks = structureBreaks.slice(-4);
    const bullCount = recentBreaks.filter((b) => b.direction === 'bullish').length;
    const bearCount = recentBreaks.filter((b) => b.direction === 'bearish').length;
    const trend: 'bullish' | 'bearish' | 'ranging' =
      bullCount > bearCount ? 'bullish' : bearCount > bullCount ? 'bearish' : 'ranging';

    // Premium / Discount based on 50-candle range
    const lookback = prices.slice(-50);
    const rangeHigh = Math.max(...lookback.map((p) => p.high));
    const rangeLow = Math.min(...lookback.map((p) => p.low));
    const equilibrium = (rangeHigh + rangeLow) / 2;

    const premiumDiscount: 'premium' | 'discount' | 'equilibrium' =
      lastPrice > equilibrium * 1.003 ? 'premium' : lastPrice < equilibrium * 0.997 ? 'discount' : 'equilibrium';

    return {
      symbol,
      orderBlocks,
      fairValueGaps,
      structureBreaks,
      liquidityLevels,
      trend,
      premiumDiscount,
      currentPrice: lastPrice,
      rangeHigh,
      rangeLow,
      equilibrium,
    };
  }
}

export default new TechnicalService();
