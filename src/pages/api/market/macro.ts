import type { NextApiRequest, NextApiResponse } from 'next';
import { getMultipleStockSnapshots } from '@/lib/massive';

// Cache for 10 minutes — macro data doesn't change by the second
const cache = new Map<string, { data: MacroData; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000;

/* ── Symbols to fetch ──────────────────────────────────────────────────────── */
// Yahoo Finance (unofficial, free, no key needed) — v8 chart endpoint:
//   ^VIX = CBOE Volatility Index
//   ^TNX = 10-year Treasury yield (returns actual %, e.g. 4.35)
//   ^IRX = 13-week T-bill yield (2Y proxy, returns actual %, e.g. 4.02)
// Massive ETFs (paid plan, but ETF snapshots work fine):
//   GLD = Gold ETF  |  USO = Oil ETF  |  UUP = USD Bull ETF
//   TLT = 20yr Bond ETF  |  SPY = S&P 500 ETF
const YAHOO_INDEX_SYMBOLS = ['^VIX', '^TNX', '^IRX'];
const ETF_TICKERS = ['GLD', 'USO', 'UUP', 'TLT', 'SPY'];

/* ── Yahoo Finance chart fetcher (no auth required) ─────────────────────────── */
interface YahooQuoteResult {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketPreviousClose?: number;
}

async function fetchYahooQuotes(symbols: string[]): Promise<Map<string, YahooQuoteResult>> {
  const map = new Map<string, YahooQuoteResult>();
  // Fetch each symbol via the v8 chart endpoint in parallel (no cookies/crumb required)
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const encoded = encodeURIComponent(sym);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GR8BUX/1.0)' },
        });
        if (!res.ok) return;
        const json = await res.json() as {
          chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number } }> };
        };
        const meta = json?.chart?.result?.[0]?.meta;
        if (!meta) return;
        const price = meta.regularMarketPrice ?? 0;
        const prevClose = meta.chartPreviousClose ?? price;
        const change = parseFloat((price - prevClose).toFixed(4));
        const changePct = prevClose ? parseFloat(((change / prevClose) * 100).toFixed(2)) : 0;
        map.set(sym, {
          symbol: sym,
          regularMarketPrice: price,
          regularMarketChange: change,
          regularMarketChangePercent: changePct,
          regularMarketPreviousClose: prevClose,
        });
      } catch {
        // Non-fatal — symbol will fall back to ZERO_QUOTE
      }
    }),
  );
  return map;
}

/* ── Types ───────────────────────────────────────────────────────────────────── */
export interface MacroQuote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePct: number;
}

export interface MacroData {
  vix: MacroQuote;
  t10y: MacroQuote;   // 10-year yield %
  t2y: MacroQuote;    // 2-year yield % (13wk T-bill proxy, IRX)
  yieldSpread: number; // 10y - 2y in basis points
  yieldCurveRegime: 'normal' | 'flat' | 'inverted';
  gold: MacroQuote;
  oil: MacroQuote;
  dollar: MacroQuote;
  bonds: MacroQuote;
  spy: MacroQuote;
  vixRegime: 'low' | 'normal' | 'elevated' | 'extreme';
  riskRegime: 'risk-on' | 'risk-off' | 'neutral';
  fetchedAt: number;
  marketOpen: boolean; // false on weekends/after-hours (day.c === 0, using prevDay prices)
}

const ZERO_QUOTE = { price: 0, change: 0, changePct: 0 };

function vixRegime(vix: number): MacroData['vixRegime'] {
  if (vix < 15) return 'low';
  if (vix < 20) return 'normal';
  if (vix < 30) return 'elevated';
  return 'extreme';
}

function riskRegime(vix: number, bondChangePct: number, dollarChangePct: number): MacroData['riskRegime'] {
  const bearish = (vix > 25 ? 1 : 0) + (bondChangePct > 0.5 ? 1 : 0) + (dollarChangePct > 0.5 ? 1 : 0);
  const bullish  = (vix < 18 ? 1 : 0) + (bondChangePct < -0.5 ? 1 : 0) + (dollarChangePct < -0.5 ? 1 : 0);
  if (bearish >= 2) return 'risk-off';
  if (bullish >= 2) return 'risk-on';
  return 'neutral';
}

/* ── Handler ─────────────────────────────────────────────────────────────────── */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Serve from cache if still fresh
  const cached = cache.get('macro');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    // Fetch Yahoo indices and Massive ETFs in parallel
    const [yahooSnaps, etfSnaps] = await Promise.all([
      fetchYahooQuotes(YAHOO_INDEX_SYMBOLS).catch(() => new Map<string, YahooQuoteResult>()),
      getMultipleStockSnapshots(ETF_TICKERS),
    ]);

    // Helper: build MacroQuote from Yahoo Finance result
    // Yahoo v8 chart returns TNX/IRX as actual % values (e.g. 4.35 = 4.35%)
    const yahooQ = (symbol: string, label: string): MacroQuote => {
      const q = yahooSnaps.get(symbol);
      if (!q || !q.regularMarketPrice) return { symbol, label, ...ZERO_QUOTE };
      return {
        symbol,
        label,
        price: parseFloat(q.regularMarketPrice.toFixed(4)),
        change: parseFloat((q.regularMarketChange ?? 0).toFixed(4)),
        changePct: parseFloat((q.regularMarketChangePercent ?? 0).toFixed(2)),
      };
    };

    // Helper: build MacroQuote from Massive ETF snapshot
    // On weekends day.c === 0 (falsy) — fall back to prevDay.c
    const etfQ = (ticker: string, label: string): MacroQuote => {
      const snap = etfSnaps.get(ticker);
      if (!snap) return { symbol: ticker, label, ...ZERO_QUOTE };
      const price     = snap.day?.c || snap.prevDay?.c || 0;
      const prevClose = snap.prevDay?.c || price;
      const change    = price && prevClose ? parseFloat((price - prevClose).toFixed(4)) : (snap.todaysChange ?? 0);
      const changePct = price && prevClose ? parseFloat(((change / prevClose) * 100).toFixed(2)) : (snap.todaysChangePerc ?? 0);
      return { symbol: ticker, label, price: parseFloat(price.toFixed(4)), change: parseFloat(change.toFixed(4)), changePct: parseFloat(changePct.toFixed(2)) };
    };

    const vixQ    = yahooQ('^VIX', 'VIX');
    const t10y    = yahooQ('^TNX', '10Y Yield');
    const t2y     = yahooQ('^IRX', '2Y Yield');
    const goldQ   = etfQ('GLD', 'Gold (GLD)');
    const oilQ    = etfQ('USO', 'Oil (USO)');
    const dollarQ = etfQ('UUP', 'Dollar (UUP)');
    const bondsQ  = etfQ('TLT', 'Bonds (TLT)');
    const spyQ    = etfQ('SPY', 'SPY');

    // Yahoo returns TNX/IRX as actual % values (e.g. 4.246 = 4.246%) — no conversion needed
    const t10yPct = t10y.price;
    const t2yPct  = t2y.price;

    const spreadBps = parseFloat(((t10yPct - t2yPct) * 100).toFixed(1));
    const yieldCurveRegime: MacroData['yieldCurveRegime'] =
      spreadBps > 25 ? 'normal' : spreadBps > -10 ? 'flat' : 'inverted';

    const data: MacroData = {
      vix: vixQ,
      t10y,
      t2y,
      yieldSpread: spreadBps,
      yieldCurveRegime,
      gold: goldQ,
      oil: oilQ,
      dollar: dollarQ,
      bonds: bondsQ,
      spy: spyQ,
      vixRegime: vixRegime(vixQ.price),
      riskRegime: riskRegime(vixQ.price, bondsQ.changePct, dollarQ.changePct),
      fetchedAt: Date.now(),
      marketOpen: !!(spyQ.change !== 0 || spyQ.changePct !== 0),
    };

    cache.set('macro', { data, timestamp: Date.now() });
    return res.status(200).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: msg });
  }
}
