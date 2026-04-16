import type { NextApiRequest, NextApiResponse } from 'next';
import { getOptionsChainPaged, getStockSnapshot, todayDateStr, type MassiveOptionContract } from '@/lib/massive';

// Cache per symbol+expiration, 5 min TTL
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export interface OptionContract {
  contractSymbol: string;
  strike: number;
  expiration: number;        // unix seconds
  expirationStr: string;     // YYYY-MM-DD
  type: 'call' | 'put';
  lastPrice: number;
  bid: number;
  ask: number;
  mid: number;               // (bid + ask) / 2
  impliedVolatility: number; // 0–1 fraction (e.g. 0.20 = 20%)
  delta: number | null;      // from Massive greeks
  openInterest: number;
  volume: number;
  inTheMoney: boolean;
  percentChange: number;
}

export interface OptionsChainResponse {
  symbol: string;
  underlyingPrice: number;
  expirations: string[];     // available YYYY-MM-DD dates (from fetched data)
  contracts: OptionContract[];
  fetchedAt: number;
}

function mapContract(raw: MassiveOptionContract, underlyingPrice: number): OptionContract {
  const { details, day, last_quote, greeks, implied_volatility, open_interest } = raw;
  const bid = last_quote?.bid ?? 0;
  const ask = last_quote?.ask ?? 0;
  const lastPrice = day?.close ?? last_trade_price(raw) ?? 0;
  const mid = bid > 0 && ask > 0
    ? parseFloat(((bid + ask) / 2).toFixed(2))
    : lastPrice;
  const expDate = details.expiration_date; // YYYY-MM-DD
  const expEpoch = Math.floor(new Date(expDate + 'T21:00:00Z').getTime() / 1000); // ~4pm ET

  const spotPrice = raw.underlying_asset?.price ?? underlyingPrice;
  const inTheMoney = details.contract_type === 'call'
    ? spotPrice > details.strike_price
    : spotPrice < details.strike_price;

  return {
    contractSymbol: details.ticker,
    strike: details.strike_price,
    expiration: expEpoch,
    expirationStr: expDate,
    type: details.contract_type,
    lastPrice: parseFloat(lastPrice.toFixed(2)),
    bid: parseFloat(bid.toFixed(2)),
    ask: parseFloat(ask.toFixed(2)),
    mid,
    impliedVolatility: implied_volatility ?? 0,
    delta: greeks?.delta ?? null,
    openInterest: open_interest ?? 0,
    volume: day?.volume ?? 0,
    inTheMoney,
    percentChange: day?.change_percent ?? 0,
  };
}

function last_trade_price(raw: MassiveOptionContract): number {
  return raw.last_trade?.price ?? 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const symbol = (req.query.symbol as string)?.toUpperCase().trim().replace(/[^A-Z0-9.-]/g, '');
  if (!symbol || !/^[A-Z][A-Z0-9.-]{0,10}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  // Optional: filter to a specific expiration date (YYYY-MM-DD)
  const dateParam = req.query.date as string | undefined;

  const cacheKey = `chain:${symbol}:${dateParam ?? 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  const today = todayDateStr();

  try {
    const fetchParams = dateParam
      ? { 'expiration_date.gte': dateParam, 'expiration_date.lte': dateParam, sort: 'strike_price' as const }
      : { 'expiration_date.gte': today, sort: 'expiration_date' as const };

    // For a specific date: paginate fully; otherwise cap at 6 expirations
    const { contracts: rawContracts, underlyingPrice: chainPrice } = await getOptionsChainPaged(
      symbol,
      fetchParams,
      /* maxPages */ dateParam ? 20 : 10,
      /* stopAtExpirations */ dateParam ? undefined : 6,
    );

    // Fallback: fetch spot price from stock snapshot if chain didn't include it
    let underlyingPrice = chainPrice;
    if (!underlyingPrice) {
      try {
        const snap = await getStockSnapshot(symbol);
        underlyingPrice = snap.day?.c ?? snap.prevDay?.c ?? 0;
      } catch {
        underlyingPrice = 0;
      }
    }

    if (!rawContracts.length) {
      return res.status(404).json({ error: `No options data found for ${symbol}` });
    }

    // Collect unique expirations in sorted order
    const expirationSet = new Set<string>();
    for (const c of rawContracts) expirationSet.add(c.details.expiration_date);
    const expirations = Array.from(expirationSet).sort();

    const contracts: OptionContract[] = rawContracts
      .map((c) => mapContract(c, underlyingPrice))
      .sort((a, b) =>
        a.expiration - b.expiration ||
        a.type.localeCompare(b.type) ||
        a.strike - b.strike,
      );

    const payload: OptionsChainResponse = {
      symbol,
      underlyingPrice,
      expirations,
      contracts,
      fetchedAt: Date.now(),
    };

    cache.set(cacheKey, { data: payload, timestamp: Date.now() });
    return res.status(200).json(payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: msg });
  }
}
