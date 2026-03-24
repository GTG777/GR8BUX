import type { NextApiRequest, NextApiResponse } from 'next';

// In-memory cache — Alpha Vantage free tier is 25 req/day
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes (historical data doesn't change fast)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = (req.query.symbol as string)?.toUpperCase().trim();
  if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol. Use 1-5 uppercase letters.' });
  }

  const range = (req.query.range as string) || 'compact'; // compact = ~100 days, full = 20+ years
  if (range !== 'compact' && range !== 'full') {
    return res.status(400).json({ error: 'Range must be "compact" or "full"' });
  }

  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Alpha Vantage API key not configured' });
  }

  // Check cache
  const cacheKey = `candles:${symbol}:${range}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=${range}&apikey=${apiKey}`;
    const response = await fetch(url);
    const json = await response.json();

    // Alpha Vantage rate limit message
    if (json['Note'] || json['Information']) {
      return res.status(429).json({ error: 'API rate limit reached. Try again later.' });
    }

    const timeSeries = json['Time Series (Daily)'];
    if (!timeSeries) {
      return res.status(404).json({ error: `No candle data found for ${symbol}` });
    }

    // Convert to array sorted by date ascending
    const candles = Object.entries(timeSeries)
      .map(([date, values]: [string, any]) => ({
        date,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'], 10),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const data = {
      symbol,
      candles,
    };

    // Cache the result
    cache.set(cacheKey, { data, timestamp: Date.now() });

    return res.status(200).json(data);
  } catch (err) {
    console.error('Alpha Vantage candles error:', err);
    return res.status(500).json({ error: 'Failed to fetch candle data' });
  }
}
