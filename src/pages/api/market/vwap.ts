import type { NextApiRequest, NextApiResponse } from 'next';
import { getAggBars, todayDateStr } from '@/lib/massive';

// Short cache — intraday data changes frequently
const cache = new Map<string, { data: VWAPData; timestamp: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

export interface VWAPData {
  vwap: number;
  sd: number;
  band1Upper: number;
  band1Lower: number;
  band2Upper: number;
  band2Lower: number;
  currentPrice: number;
  distancePct: number;          // signed %; positive = above VWAP
  bias: 'bullish' | 'bearish' | 'neutral';
  location: 'above2' | 'above1' | 'near' | 'below1' | 'below2';
  bars: number;                 // number of 5-min bars used
  narrative: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = (req.query.symbol as string)?.toUpperCase().trim();
  if (!symbol || !/^[A-Z]{1,10}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol.' });
  }

  const cacheKey = `vwap:${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    // Fetch 5-minute intraday bars for the current trading day from Massive
    const today = todayDateStr();
    const bars = await getAggBars(symbol, 5, 'minute', today, today, { limit: 1000 });

    if (!bars.length) {
      return res.status(404).json({ error: `No intraday data for ${symbol}` });
    }

    // Build valid bars (Massive bars are already clean — no nulls like Yahoo)
    interface Bar { tp: number; vol: number; close: number }
    const validBars: Bar[] = bars
      .filter((b) => b.h && b.l && b.c)
      .map((b) => ({
        tp: (b.h + b.l + b.c) / 3,
        vol: b.v ?? 0,
        close: b.c,
      }));

    if (!validBars.length) {
      return res.status(404).json({ error: `No valid intraday bars for ${symbol}` });
    }

    // VWAP = Σ(TP × volume) / Σ(volume)
    const cumTPV = validBars.reduce((s, b) => s + b.tp * b.vol, 0);
    const cumVol = validBars.reduce((s, b) => s + b.vol, 0);
    // Fallback to simple average if no volume data (e.g. some ETFs on weekends)
    const vwap = cumVol > 0 ? cumTPV / cumVol : validBars.reduce((s, b) => s + b.tp, 0) / validBars.length;

    // Volume-weighted variance → standard deviation
    const cumVarTPV = validBars.reduce((s, b) => s + b.vol * (b.tp - vwap) ** 2, 0);
    const variance = cumVol > 0 ? cumVarTPV / cumVol : 0;
    const sd = Math.sqrt(variance);

    const currentPrice = validBars.at(-1)!.close;
    const distancePct  = parseFloat(((currentPrice - vwap) / vwap * 100).toFixed(2));
    const bias: VWAPData['bias'] = distancePct > 0.3 ? 'bullish' : distancePct < -0.3 ? 'bearish' : 'neutral';

    const band1Upper = parseFloat((vwap + sd).toFixed(2));
    const band1Lower = parseFloat((vwap - sd).toFixed(2));
    const band2Upper = parseFloat((vwap + 2 * sd).toFixed(2));
    const band2Lower = parseFloat((vwap - 2 * sd).toFixed(2));

    const location: VWAPData['location'] =
      currentPrice > band2Upper ? 'above2' :
      currentPrice > band1Upper ? 'above1' :
      currentPrice < band2Lower ? 'below2' :
      currentPrice < band1Lower ? 'below1' : 'near';

    const locText =
      location === 'above2' ? `price is >2σ above VWAP — intraday overbought` :
      location === 'above1' ? `price is between 1σ–2σ above VWAP — extended bullish` :
      location === 'near'   ? `price is hugging VWAP — equilibrium zone` :
      location === 'below1' ? `price is between 1σ–2σ below VWAP — extended bearish` :
                              `price is >2σ below VWAP — intraday oversold`;

    const narrative = `VWAP for today = $${vwap.toFixed(2)}. At $${currentPrice.toFixed(2)}, ${locText} (${distancePct >= 0 ? '+' : ''}${distancePct}%). ` +
      `SD bands: $${band1Lower.toFixed(2)}–$${band1Upper.toFixed(2)} (1σ) · $${band2Lower.toFixed(2)}–$${band2Upper.toFixed(2)} (2σ).`;

    const data: VWAPData = {
      vwap: parseFloat(vwap.toFixed(2)),
      sd: parseFloat(sd.toFixed(2)),
      band1Upper, band1Lower, band2Upper, band2Lower,
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      distancePct, bias, location,
      bars: validBars.length,
      narrative,
    };

    cache.set(cacheKey, { data, timestamp: Date.now() });
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: 'Failed to compute VWAP' });
  }
}
