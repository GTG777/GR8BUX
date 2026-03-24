import type { NextApiRequest, NextApiResponse } from 'next';

// In-memory cache to stay within Alpha Vantage free tier limits (25 req/day)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = (req.query.symbol as string)?.toUpperCase().trim();
  if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol. Use 1-5 uppercase letters.' });
  }

  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Alpha Vantage API key not configured' });
  }

  // Check cache
  const cacheKey = `quote:${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const response = await fetch(url);
    const json = await response.json();

    // Alpha Vantage rate limit message
    if (json['Note'] || json['Information']) {
      return res.status(429).json({ error: 'API rate limit reached. Try again later.' });
    }

    const quote = json['Global Quote'];
    if (!quote || !quote['05. price']) {
      return res.status(404).json({ error: `No quote data found for ${symbol}` });
    }

    const data = {
      symbol: quote['01. symbol'],
      price: parseFloat(quote['05. price']),
      open: parseFloat(quote['02. open']),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      volume: parseInt(quote['06. volume'], 10),
      latestTradingDay: quote['07. latest trading day'],
      previousClose: parseFloat(quote['08. previous close']),
      change: parseFloat(quote['09. change']),
      changePercent: quote['10. change percent'],
    };

    // Cache the result
    cache.set(cacheKey, { data, timestamp: Date.now() });

    return res.status(200).json(data);
  } catch (err) {
    console.error('Alpha Vantage quote error:', err);
    return res.status(500).json({ error: 'Failed to fetch quote data' });
  }
}
