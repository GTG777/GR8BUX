import type { NextApiRequest, NextApiResponse } from 'next';

// Cache per symbol+expiration, refresh every 5 minutes during market hours
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export interface OptionContract {
  contractSymbol: string;
  strike: number;
  expiration: number;       // unix seconds
  expirationStr: string;    // YYYY-MM-DD
  type: 'call' | 'put';
  lastPrice: number;
  bid: number;
  ask: number;
  mid: number;              // (bid + ask) / 2
  impliedVolatility: number; // 0–1 fraction (e.g. 0.20 = 20%)
  delta: number | null;     // not provided by Yahoo — computed client-side if needed
  openInterest: number;
  volume: number;
  inTheMoney: boolean;
  percentChange: number;
}

export interface OptionsChainResponse {
  symbol: string;
  underlyingPrice: number;
  expirations: string[];     // all available YYYY-MM-DD dates
  contracts: OptionContract[];
  fetchedAt: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const symbol = (req.query.symbol as string)?.toUpperCase().trim();
  if (!symbol || !/^[A-Z]{1,10}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  // Optional: fetch a specific expiration epoch (Yahoo date param)
  const dateParam = req.query.date as string | undefined;

  const cacheKey = `chain:${symbol}:${dateParam ?? 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    // Step 1: fetch available expirations (no date param = first expiry + list of all dates)
    const baseUrl = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
    const firstUrl = dateParam ? `${baseUrl}?date=${dateParam}` : baseUrl;

    const firstRes = await fetch(firstUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!firstRes.ok) {
      return res.status(firstRes.status).json({ error: `Yahoo Finance returned ${firstRes.status}` });
    }

    const firstJson = await firstRes.json();
    const optResult = firstJson?.optionChain?.result?.[0];
    if (!optResult) {
      return res.status(404).json({ error: `No options data found for ${symbol}` });
    }

    const underlyingPrice: number = optResult.quote?.regularMarketPrice ?? 0;
    const allExpirationEpochs: number[] = optResult.expirationDates ?? [];

    // Convert epoch seconds → YYYY-MM-DD
    const epochToDate = (ep: number) => new Date(ep * 1000).toISOString().slice(0, 10);
    const expirations = allExpirationEpochs.map(epochToDate);

    // Step 2: fetch up to the next 6 expirations to give the screener enough range
    // (Yahoo returns one expiration per call — we batch them)
    const today = Math.floor(Date.now() / 1000);
    const futureEpochs = allExpirationEpochs
      .filter((ep) => ep > today - 86400) // include today's expiry if any
      .slice(0, 6);                         // cap at 6 to stay fast

    const contractsMap = new Map<string, OptionContract>();

    const fetchExpiry = async (ep: number) => {
      const url = `${baseUrl}?date=${ep}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      });
      if (!r.ok) return;
      const j = await r.json();
      const result = j?.optionChain?.result?.[0];
      if (!result) return;
      const exStr = epochToDate(ep);

      const parse = (raw: Record<string, unknown>[], type: 'call' | 'put') => {
        for (const c of raw) {
          const bid = (c.bid as number) ?? 0;
          const ask = (c.ask as number) ?? 0;
          const contract: OptionContract = {
            contractSymbol: c.contractSymbol as string,
            strike: c.strike as number,
            expiration: c.expiration as number,
            expirationStr: exStr,
            type,
            lastPrice: (c.lastPrice as number) ?? 0,
            bid,
            ask,
            mid: bid > 0 && ask > 0 ? parseFloat(((bid + ask) / 2).toFixed(2)) : (c.lastPrice as number) ?? 0,
            impliedVolatility: (c.impliedVolatility as number) ?? 0,
            delta: null,
            openInterest: (c.openInterest as number) ?? 0,
            volume: (c.volume as number) ?? 0,
            inTheMoney: (c.inTheMoney as boolean) ?? false,
            percentChange: (c.percentChange as number) ?? 0,
          };
          contractsMap.set(contract.contractSymbol, contract);
        }
      };

      parse((result.options?.[0]?.calls ?? []) as Record<string, unknown>[], 'call');
      parse((result.options?.[0]?.puts ?? []) as Record<string, unknown>[], 'put');
    };

    // Fetch all target expirations in parallel
    await Promise.all(futureEpochs.map(fetchExpiry));

    const contracts = Array.from(contractsMap.values()).sort(
      (a, b) => a.expiration - b.expiration || a.type.localeCompare(b.type) || a.strike - b.strike,
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
