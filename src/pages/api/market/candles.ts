import type { NextApiRequest, NextApiResponse } from 'next';
import { getAggBars, daysAgoDateStr, todayDateStr, type MassiveTimespan } from '@/lib/massive';

// In-memory cache — keep hot tickers fast
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// compact = 6 months (~125 trading days), full = 2 years (enough for EMA-200 + TSI warm-up)
const RANGE_DAYS: Record<string, number> = {
  compact: 182,  // ~6 months
  full: 730,     // 2 years
};

// TradingView interval → Massive aggregate params
const TV_TO_MASSIVE: Record<string, {
  multiplier: number;
  timespan: MassiveTimespan;
  fromDays: number;
  cacheTTL: number;
}> = {
  '1':   { multiplier: 1,  timespan: 'minute', fromDays: 7,    cacheTTL: 60_000       },
  '5':   { multiplier: 5,  timespan: 'minute', fromDays: 60,   cacheTTL: 5 * 60_000   },
  '15':  { multiplier: 15, timespan: 'minute', fromDays: 60,   cacheTTL: 5 * 60_000   },
  '60':  { multiplier: 1,  timespan: 'hour',   fromDays: 120,  cacheTTL: 15 * 60_000  },
  // 4H: fetch 1H bars from API and aggregate 4:1 server-side (more reliable than multiplier:4)
  '240': { multiplier: 1,  timespan: 'hour',   fromDays: 365,  cacheTTL: 15 * 60_000  },
  'D':   { multiplier: 1,  timespan: 'day',    fromDays: 730,  cacheTTL: CACHE_TTL    },
  'W':   { multiplier: 1,  timespan: 'week',   fromDays: 1825, cacheTTL: CACHE_TTL    },
};

/* ────────────────────────────────────────────────────────────────
   Aggregate 1H candles into 4H candles (4 bars per session group)
   Groups by the CST 4H session bucket: 08:00, 12:00, 16:00, 20:00
──────────────────────────────────────────────────────────────── */
interface Candle1H { date: string; open: number; high: number; low: number; close: number; volume: number; }
function aggregateTo4H(candles1H: Candle1H[]): Candle1H[] {
  const buckets = new Map<string, Candle1H[]>();
  for (const c of candles1H) {
    // date is 'YYYY-MM-DDTHH:mm' in CST
    const hour = parseInt(c.date.slice(11, 13), 10);
    const bucket = hour < 12 ? '08' : hour < 16 ? '12' : hour < 20 ? '16' : '20';
    const key = c.date.slice(0, 10) + 'T' + bucket + ':00';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }
  const result: Candle1H[] = [];
  for (const [key, bars] of buckets) {
    if (bars.length === 0) continue;
    result.push({
      date:   key,
      open:   bars[0].open,
      high:   Math.max(...bars.map(b => b.high)),
      low:    Math.min(...bars.map(b => b.low)),
      close:  bars[bars.length - 1].close,
      volume: bars.reduce((s, b) => s + b.volume, 0),
    });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = (req.query.symbol as string)?.toUpperCase().trim();
  if (!symbol || !/^[A-Z]{1,10}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol.' });
  }

  const today = todayDateStr();

  // CST formatter for intraday bar timestamps (Massive returns ms UTC)
  const cstFmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  // ── New path: TV interval param (used by Chart page TSI) ──
  const tvInterval = req.query.interval as string | undefined;
  if (tvInterval) {
    const mapping = TV_TO_MASSIVE[tvInterval];
    if (!mapping) return res.status(400).json({ error: 'Unsupported interval' });

    const cacheKey = `candles:${symbol}:${tvInterval}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < mapping.cacheTTL) {
      return res.status(200).json(cached.data);
    }

    try {
      const from = daysAgoDateStr(mapping.fromDays);
      const isIntraday = mapping.timespan === 'minute' || mapping.timespan === 'hour';
      const bars = await getAggBars(symbol, mapping.multiplier, mapping.timespan, from, today, { limit: 50000 });

      if (!bars.length) return res.status(404).json({ error: `No candle data found for ${symbol}` });

      const candles = bars
        .map((bar) => ({
          date: isIntraday
            ? cstFmt.format(new Date(bar.t)).replace(' ', 'T').slice(0, 16) // 'YYYY-MM-DDTHH:mm' in CST
            : new Date(bar.t).toISOString().slice(0, 10),
          open:   bar.o,
          high:   bar.h,
          low:    bar.l,
          close:  bar.c,
          volume: bar.v,
        }))
        .filter((c) => c.close > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (!candles.length) return res.status(404).json({ error: `No candle data found for ${symbol}` });

      const data = { symbol, candles: tvInterval === '240' ? aggregateTo4H(candles) : candles };
      cache.set(cacheKey, { data, timestamp: Date.now() });
      return res.status(200).json(data);
    } catch (err) {
      console.error('Massive candles error:', err);
      return res.status(500).json({ error: 'Failed to fetch candle data' });
    }
  }

  // ── Legacy path: range param ──
  const range = (req.query.range as string) || 'compact';
  if (!RANGE_DAYS[range]) {
    return res.status(400).json({ error: 'Range must be "compact" or "full"' });
  }

  const cacheKey = `candles:${symbol}:${range}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    const from = daysAgoDateStr(RANGE_DAYS[range]);
    const bars = await getAggBars(symbol, 1, 'day', from, today, { limit: 5000 });

    if (!bars.length) {
      return res.status(404).json({ error: `No candle data found for ${symbol}` });
    }

    const candles = bars
      .map((bar) => ({
        date:   new Date(bar.t).toISOString().slice(0, 10),
        open:   bar.o,
        high:   bar.h,
        low:    bar.l,
        close:  bar.c,
        volume: bar.v,
      }))
      .filter((c) => c.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!candles.length) {
      return res.status(404).json({ error: `No candle data found for ${symbol}` });
    }

    const data = { symbol, candles };
    cache.set(cacheKey, { data, timestamp: Date.now() });
    return res.status(200).json(data);
  } catch (err) {
    console.error('Massive candles error:', err);
    return res.status(500).json({ error: 'Failed to fetch candle data' });
  }
}
