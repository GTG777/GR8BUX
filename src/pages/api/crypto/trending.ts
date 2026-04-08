import type { NextApiRequest, NextApiResponse } from 'next';

const cache = new Map<string, { data: CryptoTrendingData; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/* ── Exported types ─────────────────────────────────────────────── */
export interface TrendingCoin {
  rank: number;
  cgId: string;
  symbol: string;
  name: string;
  thumb: string;
  price: number;
  change24h: number;
  marketCapRank: number | null;
  coinbaseListed: boolean;
}

export interface CryptoNewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number; // unix timestamp
  imageUrl: string;
  categories: string;
}

export interface CryptoTrendingData {
  coins: TrendingCoin[];
  news: CryptoNewsItem[];
  fetchedAt: string;
}

/* ── Main handler ───────────────────────────────────────────────── */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get('trending');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    /* ── 1. CoinGecko trending + Coinbase products (parallel) ── */
    const [trendingRes, coinbaseRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/search/trending', { signal: AbortSignal.timeout(8000) }),
      fetch('https://api.exchange.coinbase.com/products', { signal: AbortSignal.timeout(6000) }),
    ]);

    if (!trendingRes.ok) {
      return res.status(502).json({ error: `CoinGecko trending unavailable (${trendingRes.status})` });
    }

    const trendingJson = await trendingRes.json();

    /* ── 2. Build set of Coinbase USD-listed symbols ── */
    const coinbaseSymbols = new Set<string>();
    if (coinbaseRes.ok) {
      const products: Array<{ base_currency: string; quote_currency: string; status: string }> =
        await coinbaseRes.json();
      for (const p of products) {
        if (p.quote_currency === 'USD' && p.status === 'online') {
          coinbaseSymbols.add(p.base_currency.toUpperCase());
        }
      }
    }

    /* ── 3. Parse trending coins ── */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawCoins: any[] = trendingJson?.coins ?? [];
    const coins: TrendingCoin[] = rawCoins.slice(0, 10).map((entry, i) => {
      const item = entry.item ?? {};
      const symbol = (item.symbol ?? '').toUpperCase();
      const rawPrice = item.data?.price;
      const price =
        typeof rawPrice === 'number' ? rawPrice :
        typeof rawPrice === 'string' ? parseFloat(rawPrice.replace(/[^0-9.]/g, '')) : 0;
      const change24h = item.data?.price_change_percentage_24h?.usd ?? 0;

      return {
        rank: i + 1,
        cgId:          item.id ?? '',
        symbol,
        name:          item.name ?? '',
        thumb:         item.thumb ?? '',
        price,
        change24h,
        marketCapRank: item.market_cap_rank ?? null,
        coinbaseListed: coinbaseSymbols.has(symbol),
      };
    });

    /* ── 4. Fetch CryptoCompare news for trending symbols ── */
    const symbols = coins.map((c) => c.symbol).slice(0, 8).join(',');
    let news: CryptoNewsItem[] = [];
    try {
      const newsRes = await fetch(
        `https://min-api.cryptocompare.com/data/v2/news/?categories=${encodeURIComponent(symbols)}&lang=EN&sortOrder=latest&limit=20`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (newsRes.ok) {
        const newsJson = await newsRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        news = (newsJson?.Data ?? []).slice(0, 20).map((n: any) => ({
          id:          String(n.id),
          title:       n.title ?? '',
          url:         n.url ?? '',
          source:      n.source_info?.name ?? n.source ?? '',
          publishedAt: n.published_on ?? 0,
          imageUrl:    n.imageurl ?? '',
          categories:  n.categories ?? '',
        }));
      }
    } catch { /* news is non-fatal */ }

    const data: CryptoTrendingData = { coins, news, fetchedAt: new Date().toISOString() };
    cache.set('trending', { data, timestamp: Date.now() });
    return res.status(200).json(data);
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Trending fetch failed' });
  }
}
