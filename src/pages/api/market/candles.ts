import type { NextApiRequest, NextApiResponse } from 'next';

// In-memory cache — keep hot tickers fast
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// compact = 6 months (~125 trading days), full = 2 years (enough for EMA-200 + TSI warm-up)
const YAHOO_RANGE: Record<string, string> = {
  compact: '6mo',
  full: '2y',
};

// TradingView interval → Yahoo Finance interval + range
const TV_TO_YAHOO: Record<string, { yInterval: string; yRange: string; cacheTTL: number }> = {
  '1':   { yInterval: '1m',  yRange: '7d',   cacheTTL: 60_000        },
  '5':   { yInterval: '5m',  yRange: '60d',  cacheTTL: 5 * 60_000    },
  '15':  { yInterval: '15m', yRange: '60d',  cacheTTL: 5 * 60_000    },
  '60':  { yInterval: '60m', yRange: '730d', cacheTTL: 15 * 60_000   },
  '240': { yInterval: '60m', yRange: '730d', cacheTTL: 15 * 60_000   },
  'D':   { yInterval: '1d',  yRange: '2y',   cacheTTL: CACHE_TTL     },
  'W':   { yInterval: '1wk', yRange: '5y',   cacheTTL: CACHE_TTL     },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = (req.query.symbol as string)?.toUpperCase().trim();
  if (!symbol || !/^[A-Z]{1,10}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol.' });
  }

  // ── New path: TV interval param (used by Chart page TSI) ──
  const tvInterval = req.query.interval as string | undefined;
  if (tvInterval) {
    const mapping = TV_TO_YAHOO[tvInterval];
    if (!mapping) return res.status(400).json({ error: 'Unsupported interval' });

    const cacheKey = `candles:${symbol}:${tvInterval}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < mapping.cacheTTL) {
      return res.status(200).json(cached.data);
    }

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${mapping.yInterval}&range=${mapping.yRange}`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      if (!response.ok) return res.status(response.status).json({ error: `Yahoo Finance returned ${response.status}` });

      const json = await response.json();
      const result = json?.chart?.result?.[0];
      if (!result) return res.status(404).json({ error: `No candle data found for ${symbol}` });

      const timestamps: number[] = result.timestamp ?? [];
      const quote = result.indicators?.quote?.[0] ?? {};
      const isIntraday = mapping.yInterval !== '1d' && mapping.yInterval !== '1wk';
      const cstFmt = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Chicago',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      });

      const candles = timestamps
        .map((ts, i) => ({
          date: isIntraday
            ? cstFmt.format(new Date(ts * 1000)).replace(' ', 'T').slice(0, 16) // 'YYYY-MM-DDTHH:mm' in CST
            : new Date(ts * 1000).toISOString().slice(0, 10),
          open:   (quote.open?.[i]   ?? 0),
          high:   (quote.high?.[i]   ?? 0),
          low:    (quote.low?.[i]    ?? 0),
          close:  (quote.close?.[i]  ?? 0),
          volume: (quote.volume?.[i] ?? 0),
        }))
        .filter((c) => c.close > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (!candles.length) return res.status(404).json({ error: `No candle data found for ${symbol}` });

      const data = { symbol, candles };
      cache.set(cacheKey, { data, timestamp: Date.now() });
      return res.status(200).json(data);
    } catch (err) {
      console.error('Yahoo Finance candles error:', err);
      return res.status(500).json({ error: 'Failed to fetch candle data' });
    }
  }

  // ── Legacy path: range param ──
  const range = (req.query.range as string) || 'compact';
  if (!YAHOO_RANGE[range]) {
    return res.status(400).json({ error: 'Range must be "compact" or "full"' });
  }

  // Check cache
  const cacheKey = `candles:${symbol}:${range}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    const yahooRange = YAHOO_RANGE[range];
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${yahooRange}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance returned ${response.status}` });
    }

    const json = await response.json();
    const result = json?.chart?.result?.[0];

    if (!result) {
      return res.status(404).json({ error: `No candle data found for ${symbol}` });
    }

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const opens: number[] = quote.open ?? [];
    const highs: number[] = quote.high ?? [];
    const lows: number[] = quote.low ?? [];
    const closes: number[] = quote.close ?? [];
    const volumes: number[] = quote.volume ?? [];

    const candles = timestamps
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        open: opens[i] ?? 0,
        high: highs[i] ?? 0,
        low: lows[i] ?? 0,
        close: closes[i] ?? 0,
        volume: volumes[i] ?? 0,
      }))
      .filter((c) => c.close > 0) // drop any null bars
      .sort((a, b) => a.date.localeCompare(b.date));

    if (candles.length === 0) {
      return res.status(404).json({ error: `No candle data found for ${symbol}` });
    }

    const data = { symbol, candles };
    cache.set(cacheKey, { data, timestamp: Date.now() });

    return res.status(200).json(data);
  } catch (err) {
    console.error('Yahoo Finance candles error:', err);
    return res.status(500).json({ error: 'Failed to fetch candle data' });
  }
}
