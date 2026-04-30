/**
 * GET /api/market/top-performers?sortBy=ret1y&limit=30
 *
 * Fetches ~1Y of daily candles for a broad universe of popular stocks,
 * computes 1M / 3M / 6M / 1Y price returns, ranks them, and returns
 * the list sorted by the chosen column.
 *
 * Results are cached 4 hours in-process (expensive to compute).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getAggBars, daysAgoDateStr, todayDateStr } from '@/lib/massive';

// ── In-process cache ──────────────────────────────────────────────
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
let cache: { rows: PerfRow[]; ts: number } | null = null;

// ── Types ─────────────────────────────────────────────────────────
export interface PerfRow {
  rank: number;
  symbol: string;
  name: string;
  price: number;
  ret1m: number;
  ret3m: number;
  ret6m: number;
  ret1y: number;
}

// ── Universe ──────────────────────────────────────────────────────
const UNIVERSE: { symbol: string; name: string }[] = [
  { symbol: 'AAPL',  name: 'Apple' },
  { symbol: 'MSFT',  name: 'Microsoft' },
  { symbol: 'NVDA',  name: 'Nvidia' },
  { symbol: 'GOOGL', name: 'Alphabet A' },
  { symbol: 'GOOG',  name: 'Alphabet C' },
  { symbol: 'AMZN',  name: 'Amazon' },
  { symbol: 'META',  name: 'Meta Platforms' },
  { symbol: 'TSLA',  name: 'Tesla' },
  { symbol: 'LLY',   name: 'Eli Lilly' },
  { symbol: 'JPM',   name: 'JPMorgan Chase' },
  { symbol: 'V',     name: 'Visa' },
  { symbol: 'XOM',   name: 'Exxon Mobil' },
  { symbol: 'UNH',   name: 'UnitedHealth' },
  { symbol: 'JNJ',   name: 'J&J' },
  { symbol: 'MA',    name: 'Mastercard' },
  { symbol: 'AVGO',  name: 'Broadcom' },
  { symbol: 'COST',  name: 'Costco' },
  { symbol: 'HD',    name: 'Home Depot' },
  { symbol: 'PG',    name: 'Procter & Gamble' },
  { symbol: 'ABBV',  name: 'AbbVie' },
  { symbol: 'MRK',   name: 'Merck' },
  { symbol: 'CVX',   name: 'Chevron' },
  { symbol: 'BAC',   name: 'Bank of America' },
  { symbol: 'KO',    name: 'Coca-Cola' },
  { symbol: 'WMT',   name: 'Walmart' },
  { symbol: 'AMD',   name: 'AMD' },
  { symbol: 'INTC',  name: 'Intel' },
  { symbol: 'MU',    name: 'Micron Technology' },
  { symbol: 'QCOM',  name: 'Qualcomm' },
  { symbol: 'AMAT',  name: 'Applied Materials' },
  { symbol: 'LRCX',  name: 'Lam Research' },
  { symbol: 'KLAC',  name: 'KLA Corp' },
  { symbol: 'MRVL',  name: 'Marvell Tech' },
  { symbol: 'ANET',  name: 'Arista Networks' },
  { symbol: 'CRM',   name: 'Salesforce' },
  { symbol: 'ORCL',  name: 'Oracle' },
  { symbol: 'ADBE',  name: 'Adobe' },
  { symbol: 'NFLX',  name: 'Netflix' },
  { symbol: 'DIS',   name: 'Disney' },
  { symbol: 'SBUX',  name: 'Starbucks' },
  { symbol: 'NKE',   name: 'Nike' },
  { symbol: 'MCD',   name: "McDonald's" },
  { symbol: 'GS',    name: 'Goldman Sachs' },
  { symbol: 'MS',    name: 'Morgan Stanley' },
  { symbol: 'WFC',   name: 'Wells Fargo' },
  { symbol: 'AXP',   name: 'American Express' },
  { symbol: 'PYPL',  name: 'PayPal' },
  { symbol: 'COIN',  name: 'Coinbase' },
  { symbol: 'RIOT',  name: 'Riot Platforms' },
  { symbol: 'ARM',   name: 'Arm Holdings' },
  { symbol: 'RKLB',  name: 'Rocket Lab' },
  { symbol: 'PLTR',  name: 'Palantir' },
  { symbol: 'DELL',  name: 'Dell Technologies' },
  { symbol: 'IBM',   name: 'IBM' },
  { symbol: 'TSM',   name: 'TSMC' },
  { symbol: 'ASML',  name: 'ASML Holding' },
  { symbol: 'SMCI',  name: 'Super Micro' },
  { symbol: 'CAT',   name: 'Caterpillar' },
  { symbol: 'DE',    name: 'Deere & Co' },
  { symbol: 'BA',    name: 'Boeing' },
  { symbol: 'LMT',   name: 'Lockheed Martin' },
  { symbol: 'GEV',   name: 'GE Vernova' },
  { symbol: 'GE',    name: 'GE Aerospace' },
  { symbol: 'OXY',   name: 'Occidental' },
  { symbol: 'SLB',   name: 'SLB' },
  { symbol: 'T',     name: 'AT&T' },
  { symbol: 'VZ',    name: 'Verizon' },
  { symbol: 'TMUS',  name: 'T-Mobile' },
  { symbol: 'ALB',   name: 'Albemarle' },
  { symbol: 'ETSY',  name: 'Etsy' },
  { symbol: 'ADI',   name: 'Analog Devices' },
  { symbol: 'NOK',   name: 'Nokia' },
  { symbol: 'FCEL',  name: 'FuelCell Energy' },
  { symbol: 'BB',    name: 'BlackBerry' },
  { symbol: 'STM',   name: 'STMicroelectronics' },
  { symbol: 'ALAB',  name: 'Astera Labs' },
  { symbol: 'LUMN',  name: 'Lumen Tech' },
  { symbol: 'MSTR',  name: 'MicroStrategy' },
  { symbol: 'CRWD',  name: 'CrowdStrike' },
  { symbol: 'PANW',  name: 'Palo Alto Networks' },
  { symbol: 'ZS',    name: 'Zscaler' },
  { symbol: 'SNOW',  name: 'Snowflake' },
  { symbol: 'DDOG',  name: 'Datadog' },
  { symbol: 'APP',   name: 'Applovin' },
  { symbol: 'UBER',  name: 'Uber' },
  { symbol: 'LYFT',  name: 'Lyft' },
  { symbol: 'SPOT',  name: 'Spotify' },
  { symbol: 'ABNB',  name: 'Airbnb' },
  { symbol: 'SQ',    name: 'Block' },
  { symbol: 'SHOP',  name: 'Shopify' },
  { symbol: 'TTD',   name: 'The Trade Desk' },
];

// ── Helpers ───────────────────────────────────────────────────────
function retPct(closes: number[], barsBack: number): number {
  if (closes.length < barsBack + 1) return 0;
  const past = closes[closes.length - 1 - barsBack];
  const now  = closes[closes.length - 1];
  if (!past || past === 0) return 0;
  return parseFloat(((now / past - 1) * 100).toFixed(1));
}

// Run promises in batches to avoid hammering the upstream API
async function batchAll<T>(
  items: (() => Promise<T>)[],
  batchSize = 10,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = await Promise.all(items.slice(i, i + batchSize).map(fn => fn()));
    results.push(...chunk);
  }
  return results;
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const sortBy = (req.query.sortBy as string) ?? 'ret1y';
  const limit  = Math.min(parseInt((req.query.limit as string) ?? '30', 10), UNIVERSE.length);

  // Serve from cache if fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return res.status(200).json({ success: true, rows: sortAndLimit(cache.rows, sortBy, limit), cachedAt: new Date(cache.ts).toISOString() });
  }

  const from = daysAgoDateStr(400); // ~1.1 years of trading days
  const to   = todayDateStr();

  try {
    const fetchers = UNIVERSE.map(({ symbol, name }) => async (): Promise<PerfRow | null> => {
      try {
        const bars = await getAggBars(symbol, 1, 'day', from, to, { limit: 400 });
        if (bars.length < 30) return null; // not enough data

        const closes = bars.map(b => b.c);
        const price  = closes[closes.length - 1];

        return {
          rank:  0,
          symbol,
          name,
          price,
          ret1m: retPct(closes, 21),
          ret3m: retPct(closes, 63),
          ret6m: retPct(closes, 126),
          ret1y: retPct(closes, Math.min(252, closes.length - 1)),
        };
      } catch {
        return null;
      }
    });

    const rawRows = await batchAll(fetchers, 10);
    const rows = rawRows.filter((r): r is PerfRow => r !== null);

    // Rank by 1Y return descending (permanent rank, independent of view sort)
    rows.sort((a, b) => b.ret1y - a.ret1y);
    rows.forEach((r, i) => { r.rank = i + 1; });

    // Store in cache
    cache = { rows, ts: Date.now() };

    return res.status(200).json({ success: true, rows: sortAndLimit(rows, sortBy, limit), cachedAt: new Date(cache.ts).toISOString() });
  } catch (err) {
    console.error('[top-performers]', err);
    return res.status(500).json({ success: false, error: String(err) });
  }
}

function sortAndLimit(rows: PerfRow[], sortBy: string, limit: number): PerfRow[] {
  const validKeys = new Set<string>(['ret1y', 'ret6m', 'ret3m', 'ret1m', 'price', 'rank']);
  const key = validKeys.has(sortBy) ? sortBy : 'ret1y';
  const sorted = [...rows].sort((a, b) => {
    const av = a[key as keyof PerfRow] as number;
    const bv = b[key as keyof PerfRow] as number;
    return key === 'rank' ? av - bv : bv - av;
  });
  return sorted.slice(0, limit);
}
