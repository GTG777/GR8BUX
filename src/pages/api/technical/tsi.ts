import type { NextApiRequest, NextApiResponse } from 'next';

// True Strength Index (TSI) calculation
// TSI measures the rate of change of momentum on a 0-100 scale
function calculateTSI(closes: number[], firstSmoothLength: number = 25, secondSmoothLength: number = 13): number {
  if (closes.length < firstSmoothLength + secondSmoothLength) {
    return 0; // Not enough data
  }

  // Step 1: Calculate momentum (price changes)
  const momentum: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    momentum.push(closes[i] - closes[i - 1]);
  }

  // Step 2: First EMA of momentum
  const firstEMA = calculateEMA(momentum, firstSmoothLength);
  if (firstEMA.length === 0) return 0;

  // Step 3: Second EMA of first EMA
  const secondEMA = calculateEMA(firstEMA, secondSmoothLength);
  if (secondEMA.length === 0) return 0;

  // Step 4: First EMA of absolute momentum
  const absMomentum = momentum.map(m => Math.abs(m));
  const firstEMAAbs = calculateEMA(absMomentum, firstSmoothLength);
  if (firstEMAAbs.length === 0) return 0;

  // Step 5: Second EMA of absolute momentum
  const secondEMAAbs = calculateEMA(firstEMAAbs, secondSmoothLength);
  if (secondEMAAbs.length === 0) return 0;

  // Step 6: TSI = 100 * (Double Smoothed Momentum / Double Smoothed Absolute Momentum)
  const lastValue = secondEMA[secondEMA.length - 1];
  const lastAbsValue = secondEMAAbs[secondEMAAbs.length - 1];

  if (lastAbsValue === 0) return 0;
  return (100 * lastValue) / lastAbsValue;
}

function calculateEMA(data: number[], period: number): number[] {
  if (data.length < period) return [];

  const result: number[] = [];
  const multiplier = 2 / (period + 1);

  // First EMA is SMA
  let sma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(sma);

  // Calculate rest of EMAs
  for (let i = period; i < data.length; i++) {
    sma = (data[i] - sma) * multiplier + sma;
    result.push(sma);
  }

  return result;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { closes } = req.body;

    if (!Array.isArray(closes) || closes.length === 0) {
      return res.status(400).json({ error: 'closes array is required with at least 40 data points' });
    }

    const tsi = calculateTSI(closes);

    return res.status(200).json({ tsi: parseFloat(tsi.toFixed(2)) });
  } catch (err) {
    console.error('TSI calculation error:', err);
    return res.status(500).json({ error: 'Failed to calculate TSI' });
  }
}
