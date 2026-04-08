import type { NextApiRequest, NextApiResponse } from 'next';

const cache = new Map<string, { data: CryptoOverview; timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute — crypto prices move fast

/* ── Exported types ─────────────────────────────────────────────── */
export interface CryptoTicker {
  symbol: string;        // "BTC"
  name: string;          // "Bitcoin"
  price: number;
  change24h: number;     // percent
  volume24h: number;     // USD
  high24h: number;
  low24h: number;
  trend: 'up' | 'down' | 'sideways';
  trendLabel: string;    // "Above EMA20", "Below EMA20", "Near EMA20"
  fundingRate: number | null;  // annualised %, null if no futures data
  fundingLabel: string;
}

export interface FearGreed {
  value: number;   // 0–100
  label: string;   // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
}

export interface CryptoOverview {
  tickers: CryptoTicker[];
  fearGreed: FearGreed;
  btcDominance: number | null;  // percent e.g. 54.2
  marketSignal: 'risk-on' | 'risk-off' | 'neutral';
  signalVerdict: string;
  fetchedAt: string;
}

/* ── Helpers ────────────────────────────────────────────────────── */
interface BinanceKline {
  close: number;
}

function calcEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function fgLabel(v: number): string {
  if (v <= 25) return 'Extreme Fear';
  if (v <= 45) return 'Fear';
  if (v <= 55) return 'Neutral';
  if (v <= 75) return 'Greed';
  return 'Extreme Greed';
}

const COINS: Array<{ symbol: string; binancePair: string; futuresPair: string; name: string }> = [
  { symbol: 'BTC',  binancePair: 'BTCUSDT',  futuresPair: 'BTCUSDT',  name: 'Bitcoin'  },
  { symbol: 'ETH',  binancePair: 'ETHUSDT',  futuresPair: 'ETHUSDT',  name: 'Ethereum' },
  { symbol: 'SOL',  binancePair: 'SOLUSDT',  futuresPair: 'SOLUSDT',  name: 'Solana'   },
  { symbol: 'BNB',  binancePair: 'BNBUSDT',  futuresPair: 'BNBUSDT',  name: 'BNB'      },
];

/* ── Main handler ───────────────────────────────────────────────── */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get('crypto');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    /* ── 1. Binance 24hr ticker for all coins ── */
    const pairsParam = encodeURIComponent(
      JSON.stringify(COINS.map((c) => c.binancePair))
    );
    const [tickerRes, fgRes, dominanceRes] = await Promise.all([
      fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${pairsParam}`,
        { signal: AbortSignal.timeout(8000) }),
      fetch('https://api.alternative.me/fng/?limit=1',
        { signal: AbortSignal.timeout(6000) }),
      fetch('https://api.coingecko.com/api/v3/global',
        { signal: AbortSignal.timeout(8000) }),
    ]);

    if (!tickerRes.ok) {
      return res.status(502).json({ error: 'Binance API unavailable' });
    }

    const tickerJson: Array<{
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
      quoteVolume: string;
      highPrice: string;
      lowPrice: string;
    }> = await tickerRes.json();

    /* ── 2. Fear & Greed ── */
    let fearGreed: FearGreed = { value: 50, label: 'Neutral' };
    if (fgRes.ok) {
      const fgJson = await fgRes.json();
      const v = parseInt(fgJson?.data?.[0]?.value ?? '50', 10);
      fearGreed = { value: v, label: fgLabel(v) };
    }

    /* ── 3. BTC dominance ── */
    let btcDominance: number | null = null;
    if (dominanceRes.ok) {
      const domJson = await dominanceRes.json();
      btcDominance = domJson?.data?.market_cap_percentage?.btc ?? null;
      if (btcDominance) btcDominance = Math.round(btcDominance * 10) / 10;
    }

    /* ── 4. BTC klines for EMA20 trend ── */
    const klinesMap = new Map<string, number[]>(); // pair -> closes
    await Promise.all(
      COINS.map(async (coin) => {
        try {
          const r = await fetch(
            `https://api.binance.com/api/v3/klines?symbol=${coin.binancePair}&interval=1d&limit=21`,
            { signal: AbortSignal.timeout(6000) }
          );
          if (!r.ok) return;
          const klines: string[][] = await r.json();
          klinesMap.set(coin.binancePair, klines.map((k) => parseFloat(k[4]))); // index 4 = close
        } catch {
          // non-fatal
        }
      })
    );

    /* ── 5. Funding rates (Binance futures premiumIndex) ── */
    const fundingMap = new Map<string, number | null>();
    await Promise.all(
      COINS.map(async (coin) => {
        try {
          const r = await fetch(
            `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${coin.futuresPair}`,
            { signal: AbortSignal.timeout(6000) }
          );
          if (!r.ok) { fundingMap.set(coin.futuresPair, null); return; }
          const data: { lastFundingRate: string } = await r.json();
          // 8-hour rate → annualised %: rate * 3 * 365 * 100
          const rate8h = parseFloat(data.lastFundingRate);
          fundingMap.set(coin.futuresPair, Math.round(rate8h * 3 * 365 * 10000) / 100);
        } catch {
          fundingMap.set(coin.futuresPair, null);
        }
      })
    );

    /* ── 6. Build ticker objects ── */
    const tickers: CryptoTicker[] = [];
    for (const coin of COINS) {
      const raw = tickerJson.find((t) => t.symbol === coin.binancePair);
      if (!raw) continue;

      const price     = parseFloat(raw.lastPrice);
      const change24h = parseFloat(raw.priceChangePercent);
      const closes    = klinesMap.get(coin.binancePair) ?? [];
      const ema20     = closes.length >= 20 ? calcEMA(closes, 20) : 0;

      let trend: CryptoTicker['trend'] = 'sideways';
      let trendLabel = 'Near EMA20';
      if (ema20 > 0) {
        const distPct = ((price - ema20) / ema20) * 100;
        if (distPct > 1.5)       { trend = 'up';       trendLabel = `Above EMA20 (+${distPct.toFixed(1)}%)`; }
        else if (distPct < -1.5) { trend = 'down';     trendLabel = `Below EMA20 (${distPct.toFixed(1)}%)`; }
        else                     { trend = 'sideways'; trendLabel = `Near EMA20 (${distPct > 0 ? '+' : ''}${distPct.toFixed(1)}%)`; }
      }

      const fundingRate  = fundingMap.get(coin.futuresPair) ?? null;
      let   fundingLabel = '—';
      if (fundingRate !== null) {
        if (fundingRate > 50)       fundingLabel = `+${fundingRate.toFixed(1)}% — Longs overloaded`;
        else if (fundingRate > 10)  fundingLabel = `+${fundingRate.toFixed(1)}% — Longs dominant`;
        else if (fundingRate > 0)   fundingLabel = `+${fundingRate.toFixed(1)}% — Balanced/Long`;
        else if (fundingRate > -10) fundingLabel = `${fundingRate.toFixed(1)}% — Balanced/Short`;
        else                        fundingLabel = `${fundingRate.toFixed(1)}% — Shorts dominant`;
      }

      tickers.push({
        symbol: coin.symbol,
        name: coin.name,
        price,
        change24h,
        volume24h: parseFloat(raw.quoteVolume),
        high24h: parseFloat(raw.highPrice),
        low24h: parseFloat(raw.lowPrice),
        trend,
        trendLabel,
        fundingRate,
        fundingLabel,
      });
    }

    /* ── 7. Market signal ── */
    const btc = tickers.find((t) => t.symbol === 'BTC');
    const fgValue = fearGreed.value;

    let marketSignal: CryptoOverview['marketSignal'] = 'neutral';
    let signalVerdict = 'Mixed crypto signals — no strong directional bias.';

    if (btc) {
      const btcBullish = btc.trend === 'up';
      const btcBearish = btc.trend === 'down';
      const fgBullish  = fgValue > 55;
      const fgBearish  = fgValue < 45;
      const bullPoints = (btcBullish ? 1 : 0) + (fgBullish ? 1 : 0);
      const bearPoints = (btcBearish ? 1 : 0) + (fgBearish ? 1 : 0);

      if (bullPoints >= 2) {
        marketSignal = 'risk-on';
        signalVerdict = `BTC trending above EMA20 with ${fearGreed.label.toLowerCase()} sentiment — risk-on environment favoring equities and growth assets.`;
      } else if (bearPoints >= 2) {
        marketSignal = 'risk-off';
        signalVerdict = `BTC trending below EMA20 with ${fearGreed.label.toLowerCase()} sentiment — risk-off environment; consider defensive positioning.`;
      } else if (btcBullish && fgBearish) {
        signalVerdict = 'BTC recovering but sentiment still fearful — potential early risk-on switch. Watch for follow-through.';
      } else if (btcBearish && fgBullish) {
        signalVerdict = 'BTC under pressure despite greedy sentiment — complacency risk. Tighten stops on growth exposure.';
      }
    }

    const overview: CryptoOverview = {
      tickers,
      fearGreed,
      btcDominance,
      marketSignal,
      signalVerdict,
      fetchedAt: new Date().toISOString(),
    };

    cache.set('crypto', { data: overview, timestamp: Date.now() });
    return res.status(200).json(overview);
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Crypto fetch failed' });
  }
}
