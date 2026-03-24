/**
 * Technical Setups Detection Service
 * Identifies coiling stocks, consolidation patterns, and other technical setups
 */

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
}

export default new TechnicalService();
