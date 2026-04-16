/**
 * /api/options/leaps-chain?symbol=AAPL
 *
 * Fetches LEAPS expirations (>= 12 months from today) via Massive.com,
 * uses Massive's native greeks, and computes HV20 + RSI-14 from aggregate bars.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getOptionsChainPaged, getAggBars, daysAgoDateStr, todayDateStr, type MassiveOptionContract } from '@/lib/massive';
import { calculateCallGreeks, calculatePutGreeks } from '@/lib/greeks';

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 min

export interface LeapsContract {
  contractSymbol: string;
  strike: number;
  expiration: number;        // unix seconds
  expirationStr: string;     // YYYY-MM-DD
  daysToExpiry: number;
  type: 'call' | 'put';
  lastPrice: number;
  bid: number;
  ask: number;
  mid: number;
  impliedVolatility: number; // percentage (e.g. 30.5 = 30.5%)
  delta: number;
  theta: number;             // $/contract/day (theta_per_share × 100)
  gamma: number;
  vega: number;              // $/contract/1% vol change (vega_per_share × 100)
  openInterest: number;
  volume: number;
  inTheMoney: boolean;
  // Derived
  breakeven: number;         // strike + mid (calls) or strike - mid (puts)
  costVs100Shares: number;   // (mid × 100) / (spot × 100) × 100  — % of capital vs owning shares
  annualizedTheta: number;   // |theta| × 365 / (mid × 100) × 100 — annualized decay %
}

export interface LeapsChainResponse {
  symbol: string;
  underlyingPrice: number;
  hv20: number | null;
  rsi: number | null;
  leapsExpirations: string[];
  contracts: LeapsContract[];
  fetchedAt: number;
  upstreamError?: string;
}

const RISK_FREE_RATE = 0.045;
const todayMs = () => Date.now();

/** Compute HV20 and RSI-14 from an array of closing prices. */
function computeHvRsi(closes: number[]): { hv20: number | null; rsi: number | null } {
  const valid = closes.filter(Boolean);
  let hv20: number | null = null;
  if (valid.length >= 22) {
    const slice = valid.slice(-21);
    const returns = slice.slice(1).map((c, i) => Math.log(c / slice[i]));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    hv20 = parseFloat((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(1));
  }
  let rsi: number | null = null;
  if (valid.length >= 15) {
    const last15 = valid.slice(-15);
    const changes = last15.slice(1).map((c, i) => c - last15[i]);
    const avgGain = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / 14;
    const avgLoss = changes.filter(c => c < 0).map(c => Math.abs(c)).reduce((a, b) => a + b, 0) / 14;
    rsi = avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1));
  }
  return { hv20, rsi };
}

/** Map a Massive option contract to LeapsContract. Falls back to BS greeks if Massive didn't return them. */
function mapLeapsContract(
  raw: MassiveOptionContract,
  underlyingPrice: number,
  todayEpochSec: number,
): LeapsContract | null {
  const { details, day, last_quote, greeks, implied_volatility, open_interest } = raw;
  const bid = last_quote?.bid ?? 0;
  const ask = last_quote?.ask ?? 0;
  const lastPrice = day?.close ?? raw.last_trade?.price ?? 0;
  const mid = bid > 0 && ask > 0
    ? parseFloat(((bid + ask) / 2).toFixed(2))
    : lastPrice;

  // Massive implied_volatility is a 0–1 fraction
  const iv = implied_volatility ?? 0;
  if (iv <= 0 || mid <= 0) return null;

  const expDate = details.expiration_date; // YYYY-MM-DD
  const expEpochSec = Math.floor(new Date(expDate + 'T21:00:00Z').getTime() / 1000);
  const daysToExpiry = Math.max(1, Math.round((expEpochSec - todayEpochSec) / 86400));
  const T = daysToExpiry / 365;
  const strike = details.strike_price;
  const type = details.contract_type;
  const spot = raw.underlying_asset?.price ?? underlyingPrice;

  // Use Massive greeks if available; fall back to Black-Scholes
  let delta: number, theta: number, gamma: number, vega: number;
  if (greeks) {
    delta = greeks.delta;
    theta = greeks.theta * 100;  // per contract per day
    gamma = greeks.gamma;
    vega  = greeks.vega  * 100;  // per contract per 1% vol move
  } else {
    const g = type === 'call'
      ? calculateCallGreeks({ spotPrice: spot, strikePrice: strike, timeToExpiration: T, volatility: iv, riskFreeRate: RISK_FREE_RATE })
      : calculatePutGreeks ({ spotPrice: spot, strikePrice: strike, timeToExpiration: T, volatility: iv, riskFreeRate: RISK_FREE_RATE });
    delta = g.delta ?? 0;
    theta = (g.theta ?? 0) * 100;
    gamma = g.gamma ?? 0;
    vega  = (g.vega  ?? 0) * 100;
  }

  const inTheMoney = type === 'call' ? spot > strike : spot < strike;

  return {
    contractSymbol: details.ticker,
    strike,
    expiration: expEpochSec,
    expirationStr: expDate,
    daysToExpiry,
    type,
    lastPrice: parseFloat(lastPrice.toFixed(2)),
    bid: parseFloat(bid.toFixed(2)),
    ask: parseFloat(ask.toFixed(2)),
    mid,
    impliedVolatility: parseFloat((iv * 100).toFixed(1)),
    delta: parseFloat(delta.toFixed(3)),
    theta: parseFloat(theta.toFixed(2)),
    gamma: parseFloat(gamma.toFixed(5)),
    vega:  parseFloat(vega.toFixed(2)),
    openInterest: open_interest ?? 0,
    volume: day?.volume ?? 0,
    inTheMoney,
    breakeven: parseFloat((type === 'call' ? strike + mid : strike - mid).toFixed(2)),
    costVs100Shares: spot > 0 ? parseFloat(((mid * 100) / (spot * 100) * 100).toFixed(1)) : 0,
    annualizedTheta: mid > 0 ? parseFloat((Math.abs(theta) * 365 / (mid * 100) * 100).toFixed(1)) : 0,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const symbol = (req.query.symbol as string)?.toUpperCase().trim().replace(/[^A-Z0-9.-]/g, '');
  if (!symbol || !/^[A-Z][A-Z0-9.-]{0,10}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  const cacheKey = `leaps:${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  const today = todayDateStr();
  const todayEpochSec = Math.floor(todayMs() / 1000);
  const twelveMonthsDate = new Date();
  twelveMonthsDate.setFullYear(twelveMonthsDate.getFullYear() + 1);
  const leapsFromDate = twelveMonthsDate.toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    // ── 1. Fetch LEAPS contracts (expiry >= 12 months out) from Massive ──
    const chainPromise = getOptionsChainPaged(symbol, {
      'expiration_date.gte': leapsFromDate,
      sort: 'expiration_date',
      order: 'asc',
      limit: 250,
    });

    // ── 2. Fetch daily candles for HV20 + RSI-14 (3 months, 90 days) ──
    const hvRsiPromise = (async (): Promise<{ hv20: number | null; rsi: number | null }> => {
      try {
        const from = daysAgoDateStr(90);
        const bars = await getAggBars(symbol, 1, 'day', from, today, { limit: 100 });
        const closes = bars.map((b) => b.c).filter(Boolean);
        return computeHvRsi(closes);
      } catch {
        return { hv20: null, rsi: null };
      }
    })();

    // Run both in parallel
    const [{ contracts: rawContracts, underlyingPrice }, { hv20, rsi }] = await Promise.all([
      chainPromise,
      hvRsiPromise,
    ]);

    if (!rawContracts.length) {
      const payload: LeapsChainResponse = {
        symbol, underlyingPrice: 0, hv20: null, rsi: null,
        leapsExpirations: [], contracts: [], fetchedAt: Date.now(),
        upstreamError: `No LEAPS options data found for ${symbol}`,
      };
      cache.set(cacheKey, { data: payload, timestamp: Date.now() });
      return res.status(200).json(payload);
    }

    // ── 3. Map contracts ──────────────────────────────────────────────
    const contractsMap = new Map<string, LeapsContract>();
    for (const raw of rawContracts) {
      const contract = mapLeapsContract(raw, underlyingPrice, todayEpochSec);
      if (contract) contractsMap.set(contract.contractSymbol, contract);
    }

    const contracts = Array.from(contractsMap.values()).sort(
      (a, b) => a.expiration - b.expiration || a.type.localeCompare(b.type) || a.strike - b.strike,
    );

    // Collect unique LEAPS expiration dates
    const leapsExpirationSet = new Set<string>();
    for (const c of contracts) leapsExpirationSet.add(c.expirationStr);
    const leapsExpirations = Array.from(leapsExpirationSet).sort();

    const payload: LeapsChainResponse = {
      symbol,
      underlyingPrice,
      hv20,
      rsi,
      leapsExpirations,
      contracts,
      fetchedAt: Date.now(),
    };

    cache.set(cacheKey, { data: payload, timestamp: Date.now() });
    return res.status(200).json(payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const payload: LeapsChainResponse = {
      symbol, underlyingPrice: 0, hv20: null, rsi: null,
      leapsExpirations: [], contracts: [], fetchedAt: Date.now(),
      upstreamError: `Massive upstream error: ${msg}`,
    };
    cache.set(cacheKey, { data: payload, timestamp: Date.now() });
    return res.status(200).json(payload);
  }
}