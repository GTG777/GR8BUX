import type { NextApiRequest, NextApiResponse } from 'next';

// In-memory cache — 5 min TTL for quotes
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = (req.query.symbol as string)?.toUpperCase().trim();
  if (!symbol || !/^[A-Z]{1,10}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol.' });
  }

  // Check cache
  const cacheKey = `quote:${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance returned ${response.status}` });
    }

    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result?.meta?.regularMarketPrice) {
      return res.status(404).json({ error: `No quote data found for ${symbol}` });
    }

    const meta = result.meta;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? 0;
    const price = meta.regularMarketPrice ?? 0;
    const change = price - prevClose;
    const changePercent = prevClose !== 0 ? ((change / prevClose) * 100).toFixed(2) + '%' : '0.00%';
    const lastTs: number = result.timestamp?.at(-1) ?? 0;

    const data = {
      symbol: meta.symbol ?? symbol,
      price,
      open: meta.regularMarketOpen ?? 0,
      high: meta.regularMarketDayHigh ?? 0,
      low: meta.regularMarketDayLow ?? 0,
      volume: meta.regularMarketVolume ?? 0,
      latestTradingDay: lastTs ? new Date(lastTs * 1000).toISOString().slice(0, 10) : '',
      previousClose: prevClose,
      change: parseFloat(change.toFixed(4)),
      changePercent,
    };

    cache.set(cacheKey, { data, timestamp: Date.now() });
    return res.status(200).json(data);
  } catch (err) {
    console.error('Yahoo Finance quote error:', err);
    return res.status(500).json({ error: 'Failed to fetch quote data' });
  }
}
