import type { NextApiRequest, NextApiResponse } from 'next';

// Detect coiling pattern: tight range + decreasing volatility
interface CoilingDetection {
  isCoiling: boolean;
  volatility: number;
  rangePercent: number;
  strength: number; // 0-1 scale
}

function detectCoiling(candles: Array<{ high: number; low: number; close: number }>): CoilingDetection {
  if (candles.length < 20) {
    return { isCoiling: false, volatility: 0, rangePercent: 0, strength: 0 };
  }

  // Get recent 20 candles
  const recent = candles.slice(-20);

  // Calculate daily ranges (as % of close)
  const ranges = recent.map(c => {
    const range = (c.high - c.low) / c.close;
    return range * 100; // Convert to percentage
  });

  // Calculate volatility (standard deviation of ranges)
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const variance = ranges.reduce((sum, r) => sum + Math.pow(r - avgRange, 2), 0) / ranges.length;
  const volatility = Math.sqrt(variance);

  // Check if range is tightening (last 5 days avg < first 15 days avg)
  const firstHalf = ranges.slice(0, 10);
  const secondHalf = ranges.slice(-10);
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  // Coiling detected when:
  // 1. Recent ranges are tighter than historical
  // 2. Volatility is low (< 1.5%)
  // 3. Average daily range is small (< 2%)
  const isTightening = secondAvg < firstAvg * 0.8; // 20% tighter
  const isLowVolatility = volatility < 1.5;
  const isTinyRange = avgRange < 2.0;

  const isCoiling = (isTightening && isLowVolatility) || isTinyRange;

  // Calculate strength (0-1)
  const tighteningScore = isTightening ? Math.min(1, (firstAvg - secondAvg) / firstAvg) : 0;
  const volatilityScore = Math.max(0, (1.5 - volatility) / 1.5);
  const strength = (tighteningScore + volatilityScore) / 2;

  return {
    isCoiling,
    volatility: parseFloat(volatility.toFixed(2)),
    rangePercent: parseFloat(avgRange.toFixed(2)),
    strength: parseFloat(strength.toFixed(2)),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { candles } = req.body;

    if (!Array.isArray(candles) || candles.length === 0) {
      return res.status(400).json({ error: 'candles array is required' });
    }

    const detection = detectCoiling(candles);

    return res.status(200).json(detection);
  } catch (err) {
    console.error('Coiling detection error:', err);
    return res.status(500).json({ error: 'Failed to detect coiling' });
  }
}
