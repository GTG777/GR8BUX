import type { NextApiRequest, NextApiResponse } from 'next';
import { getStockSnapshot } from '@/lib/massive';

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
    const snap = await getStockSnapshot(symbol);

    // day.c can be 0 (falsy) on weekends/after-hours when no trades have occurred today.
    // Fall back to prevDay.c so we always return the last known price.
    const price = snap?.day?.c || snap?.prevDay?.c;
    if (!snap || !price) {
      return res.status(404).json({ error: `No quote data found for ${symbol}` });
    }

    const prevClose = snap.prevDay?.c ?? 0;
    const change = snap.todaysChange ?? (prevClose !== 0 ? price - prevClose : 0);
    const changePct = snap.todaysChangePerc ?? (prevClose !== 0 ? (change / prevClose) * 100 : 0);
    // updated is nanoseconds → convert to ms
    const updatedMs = snap.updated ? Math.floor(snap.updated / 1_000_000) : Date.now();
    const isMarketHours = !!(snap?.day?.c);

    const data = {
      symbol: snap.ticker ?? symbol,
      price,
      open: snap.day?.o ?? snap.prevDay?.o ?? 0,
      high: snap.day?.h ?? snap.prevDay?.h ?? 0,
      low: snap.day?.l ?? snap.prevDay?.l ?? 0,
      volume: snap.day?.v ?? snap.prevDay?.v ?? 0,
      latestTradingDay: new Date(updatedMs).toISOString().slice(0, 10),
      previousClose: prevClose,
      change: parseFloat(change.toFixed(4)),
      changePercent: changePct.toFixed(2) + '%',
      marketOpen: isMarketHours,
    };

    cache.set(cacheKey, { data, timestamp: Date.now() });
    return res.status(200).json(data);
  } catch (err) {
    console.error('Massive quote error:', err);
    return res.status(500).json({ error: 'Failed to fetch quote data' });
  }
}
