/**
 * GET /api/market/options-screener?preset=All+Stars
 *
 * Scans a preset list of symbols, fetches candles + options chain,
 * computes: HV20, avgIV, IVR proxy, IV-HV spread, GEX regime, max pain.
 * Results cached 15 minutes in-process.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getAggBars, getOptionsChainPaged, daysAgoDateStr, todayDateStr } from '@/lib/massive';

// ── Cache ──────────────────────────────────────────────────────────
const cache = new Map<string, { rows: OptionsScreenerRow[]; ts: number }>();
const TTL = 15 * 60 * 1000;

// ── Types ──────────────────────────────────────────────────────────
export interface OptionsScreenerRow {
  symbol: string;
  price: number | null;
  hv20: number | null;
  avgIV: number | null;
  ivr: number | null;          // 0–100 proxy from chain IV range
  ivHvSpread: number | null;   // avgIV − hv20 (positive = IV expensive)
  gexPositive: boolean | null; // true = volatility dampener
  maxPainPct: number | null;   // % from price to max pain strike
  nearestExpiry: string | null;
  topOIStrike: number | null;
  setupType: 'sell-premium' | 'buy-options' | 'neutral' | null;
  grade: 'A' | 'B' | 'C' | null;
}

// ── Presets ────────────────────────────────────────────────────────
export const OPTIONS_PRESETS: Record<string, string[]> = {
  'All Stars': ['SPY','QQQ','AAPL','NVDA','TSLA','MSFT','META','AMZN','GOOGL','NFLX','AMD','COIN','PLTR','IWM','GLD'],
  'Tech':      ['AAPL','NVDA','MSFT','AMD','INTC','QCOM','AVGO','MU','ARM','SMCI'],
  'Mega Cap':  ['AAPL','MSFT','AMZN','GOOGL','META','TSLA','NVDA','JPM','LLY','V'],
  'ETFs':      ['SPY','QQQ','IWM','GLD','TLT','XLE','XLF','XLK','ARKK','SOXL'],
  'High Beta': ['TSLA','COIN','MSTR','PLTR','SOFI','HOOD','RIVN','NIO','GME','AMC'],
};

// ── Math ───────────────────────────────────────────────────────────
function calcHV(closes: number[], period = 20): number {
  if (closes.length < period + 1) return 0;
  const sl = closes.slice(-(period + 1));
  const rets = sl.slice(1).map((c, i) => Math.log(c / sl[i]));
  const mean = rets.reduce((a, b) => a + b) / rets.length;
  const v = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return parseFloat((Math.sqrt(v) * Math.sqrt(252) * 100).toFixed(1));
}

// ── Per-symbol processor ───────────────────────────────────────────
async function processSymbol(symbol: string, from: string, to: string): Promise<OptionsScreenerRow> {
  const base: OptionsScreenerRow = {
    symbol, price: null, hv20: null, avgIV: null, ivr: null,
    ivHvSpread: null, gexPositive: null, maxPainPct: null,
    nearestExpiry: null, topOIStrike: null, setupType: null, grade: null,
  };

  try {
    const [barsSettled, chainSettled] = await Promise.allSettled([
      getAggBars(symbol, 1, 'day', from, to, { limit: 300 }),
      getOptionsChainPaged(
        symbol,
        { 'expiration_date.gte': to, sort: 'expiration_date' },
        /* maxPages */ 3,
        /* stopAtExpirations */ 2,
      ),
    ]);

    // HV20 from candles
    if (barsSettled.status === 'fulfilled' && barsSettled.value.length >= 22) {
      const closes = barsSettled.value.map((b) => b.c);
      base.price = closes[closes.length - 1];
      base.hv20 = calcHV(closes);
    }

    // Options analytics from chain
    if (chainSettled.status === 'fulfilled') {
      const { contracts, underlyingPrice } = chainSettled.value;
      if (!base.price && underlyingPrice > 0) base.price = underlyingPrice;
      const spotPrice = base.price ?? underlyingPrice;

      if (contracts.length >= 4 && spotPrice > 0) {
        // Nearest expiry
        const expiries = [...new Set(contracts.map((c) => c.details.expiration_date))].sort();
        base.nearestExpiry = expiries[0] ?? null;

        // avgIV from nearest expiry (all contracts with valid IV)
        const nearestContracts = contracts.filter(
          (c) => c.details.expiration_date === expiries[0] && (c.implied_volatility ?? 0) > 0.01,
        );
        if (nearestContracts.length >= 4) {
          const ivs = nearestContracts.map((c) => (c.implied_volatility ?? 0) * 100);
          const mn = Math.min(...ivs), mx = Math.max(...ivs);
          const avg = ivs.reduce((a, b) => a + b, 0) / ivs.length;
          base.avgIV = parseFloat(avg.toFixed(1));
          base.ivr = mx > mn ? parseFloat(((avg - mn) / (mx - mn) * 100).toFixed(1)) : 50;
          base.ivHvSpread = base.hv20 !== null ? parseFloat((avg - base.hv20).toFixed(1)) : null;
        }

        // Max pain across all loaded contracts
        const strikes = [...new Set(contracts.map((c) => c.details.strike_price))].sort((a, b) => a - b);
        if (strikes.length > 0) {
          let minPain = Infinity;
          let maxPainStrike = strikes[Math.floor(strikes.length / 2)];
          for (const s of strikes) {
            let pain = 0;
            for (const c of contracts) {
              const oi = c.open_interest ?? 0;
              if (c.details.contract_type === 'call' && c.details.strike_price < s) pain += (s - c.details.strike_price) * oi * 100;
              if (c.details.contract_type === 'put'  && c.details.strike_price > s) pain += (c.details.strike_price - s) * oi * 100;
            }
            if (pain < minPain) { minPain = pain; maxPainStrike = s; }
          }
          base.maxPainPct = parseFloat(((maxPainStrike - spotPrice) / spotPrice * 100).toFixed(2));
        }

        // GEX regime
        let totalGex = 0;
        for (const c of contracts) {
          const gamma = c.greeks?.gamma ?? 0;
          const oi = c.open_interest ?? 0;
          const sign = c.details.contract_type === 'call' ? 1 : -1;
          totalGex += sign * gamma * oi * 100 * spotPrice;
        }
        base.gexPositive = totalGex >= 0;

        // Top OI strike (proxy for key level)
        const oiByStrike = new Map<number, number>();
        for (const c of contracts) {
          const k = c.details.strike_price;
          oiByStrike.set(k, (oiByStrike.get(k) ?? 0) + (c.open_interest ?? 0));
        }
        let topOI = 0, topStrike = 0;
        oiByStrike.forEach((oi, strike) => { if (oi > topOI) { topOI = oi; topStrike = strike; } });
        base.topOIStrike = topStrike || null;

        // Grade + setup type
        const ivr = base.ivr ?? 50;
        const spread = base.ivHvSpread ?? 0;
        if (ivr >= 65 && spread >= 5) {
          base.setupType = 'sell-premium';
          base.grade = ivr >= 80 ? 'A' : 'B';
        } else if (ivr <= 30 && spread <= 2) {
          base.setupType = 'buy-options';
          base.grade = ivr <= 20 ? 'A' : 'B';
        } else {
          base.setupType = 'neutral';
          base.grade = 'C';
        }
      }
    }

    return base;
  } catch {
    return base;
  }
}

// ── Concurrency limiter ────────────────────────────────────────────
async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency = 5): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.all(chunk.map(fn));
    results.push(...settled);
  }
  return results;
}

// ── Handler ────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const preset = ((req.query.preset as string) ?? 'All Stars').replace(/\+/g, ' ');
  const symbols = OPTIONS_PRESETS[preset] ?? OPTIONS_PRESETS['All Stars'];
  const cacheKey = `${preset}:${symbols.join(',')}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) {
    return res.status(200).json({ success: true, rows: cached.rows });
  }

  const from = daysAgoDateStr(150);
  const to = todayDateStr();

  const rows = await pMap(symbols, (s) => processSymbol(s, from, to), 5);
  cache.set(cacheKey, { rows, ts: Date.now() });

  return res.status(200).json({ success: true, rows });
}
