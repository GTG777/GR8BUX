import type { NextApiRequest, NextApiResponse } from 'next';

// Cache per symbol+expiration, refresh every 5 minutes during market hours
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

// Yahoo Finance now requires a session cookie + crumb for the options endpoint.
// We fetch one crumb per server instance and cache it for 6 hours.
const CRUMB_TTL = 6 * 60 * 60 * 1000;
const crumbStore = { crumb: '', cookie: '', ts: 0 };
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function getYahooCrumb(force = false): Promise<{ crumb: string; cookie: string }> {
  if (!force && crumbStore.crumb && Date.now() - crumbStore.ts < CRUMB_TTL) {
    return { crumb: crumbStore.crumb, cookie: crumbStore.cookie };
  }
  // Step 1 – get a Yahoo session cookie from the consent endpoint
  const fcRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  const rawCookie = fcRes.headers.get('set-cookie') ?? '';
  // Collect key=value pairs from each Set-Cookie segment; strip attributes
  const cookie = rawCookie
    .split(',')
    .map((seg) => seg.trim().split(';')[0])
    .filter(Boolean)
    .join('; ');

  // Step 2 – exchange the cookie for a crumb
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie },
  });
  const crumb = (await crumbRes.text()).trim();
  Object.assign(crumbStore, { crumb, cookie, ts: Date.now() });
  return { crumb, cookie };
}

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
    // Fetch (or reuse cached) crumb + session cookie required by Yahoo Finance options API
    let { crumb, cookie } = await getYahooCrumb();

    const yahooHeaders = () => ({ 'User-Agent': UA, Accept: 'application/json', Cookie: cookie });

    // Step 1: fetch available expirations (no date param = first expiry + list of all dates)
    const baseUrl = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
    const crumbParam = `crumb=${encodeURIComponent(crumb)}`;
    const firstUrl = dateParam ? `${baseUrl}?date=${dateParam}&${crumbParam}` : `${baseUrl}?${crumbParam}`;

    let firstRes = await fetch(firstUrl, { headers: yahooHeaders() });

    // If the crumb has expired, refresh once and retry
    if (firstRes.status === 401) {
      ({ crumb, cookie } = await getYahooCrumb(true));
      const retryUrl = dateParam ? `${baseUrl}?date=${dateParam}&crumb=${encodeURIComponent(crumb)}` : `${baseUrl}?crumb=${encodeURIComponent(crumb)}`;
      firstRes = await fetch(retryUrl, { headers: yahooHeaders() });
    }

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
      const url = `${baseUrl}?date=${ep}&crumb=${encodeURIComponent(crumb)}`;
      const r = await fetch(url, { headers: yahooHeaders() });
      if (!r.ok) return;
      const j = await r.json();
      const result = j?.optionChain?.result?.[0];
      if (!result) return;
      const exStr = epochToDate(ep);

      const parse = (raw: Record<string, unknown>[], type: 'call' | 'put') => {
        for (const c of raw) {
          const bid = (c.bid as number) ?? 0;
          const ask = (c.ask as number) ?? 0;
          const lastPrice = (c.lastPrice as number) ?? 0;
          // Use bid/ask mid during market hours; fall back to lastPrice when market is closed
          const mid = bid > 0 && ask > 0
            ? parseFloat(((bid + ask) / 2).toFixed(2))
            : lastPrice;
          const contract: OptionContract = {
            contractSymbol: c.contractSymbol as string,
            strike: c.strike as number,
            expiration: c.expiration as number,
            expirationStr: exStr,
            type,
            lastPrice,
            bid,
            ask,
            mid,
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
