import type { NextApiRequest, NextApiResponse } from 'next';

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
    // 5-minute intraday bars for the last trading session
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance returned ${response.status}` });
    }

    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result) {
      return res.status(404).json({ error: `No intraday data for ${symbol}` });
    }

    const q = result.indicators?.quote?.[0] ?? {};
    const highs: (number | null)[]   = q.high   ?? [];
    const lows: (number | null)[]    = q.low    ?? [];
    const closes: (number | null)[]  = q.close  ?? [];
    const volumes: (number | null)[] = q.volume ?? [];

    // Build valid bars (Yahoo sometimes includes null entries for gaps)
    interface Bar { tp: number; vol: number; close: number }
    const bars: Bar[] = [];
    for (let i = 0; i < closes.length; i++) {
      const h = highs[i], l = lows[i], c = closes[i];
      if (!h || !l || !c) continue;
      bars.push({
        tp: (h + l + c) / 3,
        vol: volumes[i] ?? 0,
        close: c,
      });
    }

    if (bars.length === 0) {
      return res.status(404).json({ error: `No valid intraday bars for ${symbol}` });
    }

    // VWAP = Σ(TP × volume) / Σ(volume)
    const cumTPV = bars.reduce((s, b) => s + b.tp * b.vol, 0);
    const cumVol = bars.reduce((s, b) => s + b.vol, 0);
    // Fallback to simple average if no volume data (e.g. some ETFs on weekends)
    const vwap = cumVol > 0 ? cumTPV / cumVol : bars.reduce((s, b) => s + b.tp, 0) / bars.length;

    // Volume-weighted variance → standard deviation
    const cumVarTPV = bars.reduce((s, b) => s + b.vol * (b.tp - vwap) ** 2, 0);
    const variance = cumVol > 0 ? cumVarTPV / cumVol : 0;
    const sd = Math.sqrt(variance);

    const currentPrice = bars.at(-1)!.close;
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
      bars: bars.length,
      narrative,
    };

    cache.set(cacheKey, { data, timestamp: Date.now() });
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: 'Failed to compute VWAP' });
  }
}
