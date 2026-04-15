/**
 * /api/options/leaps-chain?symbol=AAPL
 *
 * Fetches only LEAPS expirations (>= 12 months from today), computes BS delta & theta
 * for every contract, and returns them alongside underlying price and HV20.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { calculateCallGreeks, calculatePutGreeks } from '@/lib/greeks';

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 min — LEAPS don't move that fast

const CRUMB_TTL = 6 * 60 * 60 * 1000;
const crumbStore = { crumb: '', cookie: '', ts: 0 };
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

function extractCookieHeader(headers: Headers): string {
  const h = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [];
  if (setCookies.length > 0) {
    return setCookies
      .map((line) => line.split(';')[0]?.trim())
      .filter(Boolean)
      .join('; ');
  }

  const raw = headers.get('set-cookie') ?? '';
  const attrNames = new Set(['path', 'expires', 'max-age', 'domain', 'samesite', 'secure', 'httponly', 'priority']);
  const pairs = raw.match(/(^|,\s*)([^=;,\s]+)=([^;,\s]+)/g) ?? [];
  return pairs
    .map((p) => p.replace(/^,\s*/, ''))
    .filter((p) => {
      const key = p.split('=')[0]?.toLowerCase();
      return !!key && !attrNames.has(key);
    })
    .join('; ');
}

function withCrumb(url: string, crumb: string): string {
  if (!crumb) return url;
  const glue = url.includes('?') ? '&' : '?';
  return `${url}${glue}crumb=${encodeURIComponent(crumb)}`;
}

async function fetchYahooJson(path: string, cookie: string, crumb: string): Promise<{ ok: boolean; status: number; json?: any; lastError?: string }> {
  const headers = { 'User-Agent': UA, Accept: 'application/json', Cookie: cookie };
  let lastStatus = 500;

  for (const host of YAHOO_HOSTS) {
    const url = withCrumb(`https://${host}${path}`, crumb);
    try {
      const r = await fetch(url, { headers });
      lastStatus = r.status;
      if (!r.ok) continue;
      const json = await r.json();
      return { ok: true, status: r.status, json };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'fetch failed';
      return { ok: false, status: 502, lastError: msg };
    }
  }

  return { ok: false, status: lastStatus };
}

async function getYahooCrumb(force = false): Promise<{ crumb: string; cookie: string }> {
  if (!force && crumbStore.crumb && Date.now() - crumbStore.ts < CRUMB_TTL) {
    return { crumb: crumbStore.crumb, cookie: crumbStore.cookie };
  }
  const fcRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  const cookie = extractCookieHeader(fcRes.headers);
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie },
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.includes('<')) {
    return { crumb: '', cookie };
  }
  Object.assign(crumbStore, { crumb, cookie, ts: Date.now() });
  return { crumb, cookie };
}

export interface LeapsContract {
  contractSymbol: string;
  strike: number;
  expiration: number;         // unix seconds
  expirationStr: string;      // YYYY-MM-DD
  daysToExpiry: number;
  type: 'call' | 'put';
  lastPrice: number;
  bid: number;
  ask: number;
  mid: number;
  impliedVolatility: number;  // 0–1 fraction
  delta: number;
  theta: number;              // per day, in dollars per share
  gamma: number;
  vega: number;
  openInterest: number;
  volume: number;
  inTheMoney: boolean;
  // Derived
  breakeven: number;          // strike + mid (calls) or strike - mid (puts)
  costVs100Shares: number;    // mid * 100 / (spot * 100) → how much capital vs owning shares
  annualizedTheta: number;    // theta * 365 as % of premium — decay speed
}

export interface LeapsChainResponse {
  symbol: string;
  underlyingPrice: number;
  hv20: number | null;
  leapsExpirations: string[];
  contracts: LeapsContract[];
  fetchedAt: number;
  upstreamError?: string;
}

const epochToDate = (ep: number) => new Date(ep * 1000).toISOString().slice(0, 10);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const symbol = (req.query.symbol as string)?.toUpperCase().trim();
  if (!symbol || !/^[A-Z]{1,10}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  const cacheKey = `leaps:${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  const twelveMonthsFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;
  const todayEpoch = Math.floor(Date.now() / 1000);

  try {
    let { crumb, cookie } = await getYahooCrumb();
    const symbolPath = `/v7/finance/options/${encodeURIComponent(symbol)}`;

    // ── 1. Get all available expirations ──────────────────────────────
    let first = await fetchYahooJson(symbolPath, cookie, crumb);
    if (first.status === 401) {
      ({ crumb, cookie } = await getYahooCrumb(true));
      first = await fetchYahooJson(symbolPath, cookie, crumb);
    }
    if (!first.ok) {
      const details = first.lastError ? `: ${first.lastError}` : '';
      const payload: LeapsChainResponse = {
        symbol,
        underlyingPrice: 0,
        hv20: null,
        leapsExpirations: [],
        contracts: [],
        fetchedAt: Date.now(),
        upstreamError: `Yahoo Finance upstream failed (${first.status})${details}`,
      };
      cache.set(cacheKey, { data: payload, timestamp: Date.now() });
      return res.status(200).json(payload);
    }

    const firstJson = first.json;
    const optResult = firstJson?.optionChain?.result?.[0];
    if (!optResult) return res.status(404).json({ error: `No options data for ${symbol}` });

    const underlyingPrice: number = optResult.quote?.regularMarketPrice ?? 0;
    const allEpochs: number[] = (optResult.expirationDates ?? []) as number[];

    // Filter to LEAPS only: >= 12 months out
    const leapsEpochs = allEpochs.filter((ep) => ep * 1000 >= twelveMonthsFromNow);
    if (leapsEpochs.length === 0) {
      return res.status(200).json({
        symbol, underlyingPrice, hv20: null,
        leapsExpirations: [], contracts: [], fetchedAt: Date.now(),
      });
    }

    // ── 2. Fetch HV20 from daily candles (parallel with chain fetch) ──
    const hvPromise = (async () => {
      try {
        const quote = await fetchYahooJson(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`, cookie, crumb);
        if (!quote.ok || !quote.json) return null;
        const j = quote.json;
        const closes: number[] = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
        if (closes.length < 22) return null;
        const slice = closes.filter(Boolean).slice(-21);
        const returns = slice.slice(1).map((c, i) => Math.log(c / slice[i]));
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
        return parseFloat((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(1));
      } catch { return null; }
    })();

    // ── 3. Fetch contracts for each LEAPS expiry ──────────────────────
    const contractsMap = new Map<string, LeapsContract>();
    const rate = 0.045;

    const fetchExpiry = async (ep: number) => {
      const quote = await fetchYahooJson(`${symbolPath}?date=${ep}`, cookie, crumb);
      if (!quote.ok || !quote.json) return;
      const j = quote.json;
      const result = j?.optionChain?.result?.[0];
      if (!result) return;
      const exStr = epochToDate(ep);
      const daysToExpiry = Math.max(1, Math.round((ep - todayEpoch) / 86400));
      const T = daysToExpiry / 365;

      const parse = (raw: Record<string, unknown>[], type: 'call' | 'put') => {
        for (const c of raw) {
          const bid = (c.bid as number) ?? 0;
          const ask = (c.ask as number) ?? 0;
          const lastPrice = (c.lastPrice as number) ?? 0;
          const mid = bid > 0 && ask > 0 ? parseFloat(((bid + ask) / 2).toFixed(2)) : lastPrice;
          const iv = (c.impliedVolatility as number) ?? 0;
          if (iv <= 0 || mid <= 0) continue;

          // Compute BS greeks
          const g = type === 'call'
            ? calculateCallGreeks({ spotPrice: underlyingPrice, strikePrice: c.strike as number, timeToExpiration: T, volatility: iv, riskFreeRate: rate })
            : calculatePutGreeks({ spotPrice: underlyingPrice, strikePrice: c.strike as number, timeToExpiration: T, volatility: iv, riskFreeRate: rate });

          const delta = g.delta ?? 0;
          const thetaPerDay = (g.theta ?? 0) * 100; // per contract per day, $ terms per share * 100
          const strike = c.strike as number;

          const contract: LeapsContract = {
            contractSymbol: c.contractSymbol as string,
            strike,
            expiration: ep,
            expirationStr: exStr,
            daysToExpiry,
            type,
            lastPrice,
            bid,
            ask,
            mid,
            impliedVolatility: parseFloat((iv * 100).toFixed(1)),
            delta: parseFloat(delta.toFixed(3)),
            theta: parseFloat(thetaPerDay.toFixed(2)),
            gamma: parseFloat((g.gamma ?? 0).toFixed(5)),
            vega: parseFloat(((g.vega ?? 0) * 100).toFixed(2)),
            openInterest: (c.openInterest as number) ?? 0,
            volume: (c.volume as number) ?? 0,
            inTheMoney: (c.inTheMoney as boolean) ?? false,
            breakeven: parseFloat((type === 'call' ? strike + mid : strike - mid).toFixed(2)),
            costVs100Shares: underlyingPrice > 0 ? parseFloat(((mid * 100) / (underlyingPrice * 100) * 100).toFixed(1)) : 0,
            annualizedTheta: mid > 0 ? parseFloat((Math.abs(thetaPerDay) * 365 / (mid * 100) * 100).toFixed(1)) : 0,
          };
          contractsMap.set(contract.contractSymbol, contract);
        }
      };

      parse((result.options?.[0]?.calls ?? []) as Record<string, unknown>[], 'call');
      parse((result.options?.[0]?.puts ?? []) as Record<string, unknown>[], 'put');
    };

    await Promise.all(leapsEpochs.map(fetchExpiry));
    const hv20 = await hvPromise;

    const contracts = Array.from(contractsMap.values()).sort(
      (a, b) => a.expiration - b.expiration || a.type.localeCompare(b.type) || a.strike - b.strike,
    );

    const payload: LeapsChainResponse = {
      symbol,
      underlyingPrice,
      hv20,
      leapsExpirations: leapsEpochs.map(epochToDate),
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
