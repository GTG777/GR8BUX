/**
 * Massive.com (formerly Polygon.io) REST API client.
 * Docs:     https://massive.com/docs/rest
 * Base URL: https://api.massive.com
 * Auth:     ?apiKey=MASSIVE_API_KEY  (or Bearer header)
 */

const MASSIVE_BASE = 'https://api.massive.com';

function getApiKey(): string {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) throw new Error('MASSIVE_API_KEY environment variable is not set');
  return key;
}

export function massiveBuildUrl(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): string {
  const url = new URL(`${MASSIVE_BASE}${path}`);
  url.searchParams.set('apiKey', getApiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export async function massiveFetch<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const url = massiveBuildUrl(path, params);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Massive ${res.status} at ${path}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────

export interface MassiveBar {
  c: number;
  h: number;
  l: number;
  o: number;
  t: number;   // Unix ms timestamp
  v: number;
  vw?: number; // volume-weighted avg price for this bar
  n?: number;  // number of transactions
}

export type MassiveTimespan = 'minute' | 'hour' | 'day' | 'week' | 'month';

export interface MassiveTickerSnapshot {
  ticker: string;
  day?: { c: number; h: number; l: number; o: number; v: number; vw?: number };
  prevDay?: { c: number; h: number; l: number; o: number; v: number; vw?: number };
  min?: { c: number; h: number; l: number; o: number; v: number; vw?: number };
  todaysChange?: number;
  todaysChangePerc?: number;
  updated?: number; // nanoseconds
}

export interface MassiveIndexSnapshot {
  ticker: string;
  name?: string;
  value?: number;
  session?: {
    change: number;
    change_percent: number;
    close: number;
    high: number;
    low: number;
    open: number;
    previous_close: number;
  };
  market_status?: string;
  timeframe?: string;
  error?: string;
}

export interface MassiveOptionContract {
  break_even_price?: number;
  day?: {
    change?: number;
    change_percent?: number;
    close?: number;
    high?: number;
    last_updated?: number;
    low?: number;
    open?: number;
    previous_close?: number;
    volume?: number;
    vwap?: number;
  };
  details: {
    contract_type: 'call' | 'put';
    exercise_style?: string;
    expiration_date: string; // YYYY-MM-DD
    shares_per_contract?: number;
    strike_price: number;
    ticker: string;          // OCC symbol e.g. O:AAPL230616C00150000
  };
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
  implied_volatility?: number; // 0–1 fraction (e.g. 0.30 = 30%)
  last_quote?: {
    ask?: number;
    ask_size?: number;
    bid?: number;
    bid_size?: number;
    last_updated?: number;
    midpoint?: number;
    timeframe?: string;
  };
  last_trade?: {
    price?: number;
    size?: number;
    sip_timestamp?: number;
    timeframe?: string;
  };
  open_interest?: number;
  underlying_asset?: {
    change_to_break_even?: number;
    last_updated?: number;
    price?: number;
    ticker?: string;
    timeframe?: string;
  };
}

// ── Stock snapshots ────────────────────────────────────────────────

export async function getStockSnapshot(ticker: string): Promise<MassiveTickerSnapshot> {
  const data = await massiveFetch<{ ticker: MassiveTickerSnapshot; status: string }>(
    `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}`,
  );
  return data.ticker;
}

/**
 * Batch snapshot for multiple stock tickers in a single request.
 * Returns results keyed by ticker symbol for easy lookup.
 */
export async function getMultipleStockSnapshots(
  tickers: string[],
): Promise<Map<string, MassiveTickerSnapshot>> {
  if (tickers.length === 0) return new Map();
  const data = await massiveFetch<{ tickers: MassiveTickerSnapshot[]; status: string }>(
    '/v2/snapshot/locale/us/markets/stocks/tickers',
    { tickers: tickers.join(',') },
  );
  const map = new Map<string, MassiveTickerSnapshot>();
  for (const snap of data.tickers ?? []) {
    map.set(snap.ticker, snap);
  }
  return map;
}

// ── Aggregate bars (OHLCV candles) ────────────────────────────────

export async function getAggBars(
  ticker: string,
  multiplier: number,
  timespan: MassiveTimespan,
  from: string, // YYYY-MM-DD
  to: string,   // YYYY-MM-DD
  options: { adjusted?: boolean; sort?: 'asc' | 'desc'; limit?: number } = {},
): Promise<MassiveBar[]> {
  const data = await massiveFetch<{ results?: MassiveBar[]; status: string }>(
    `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/${from}/${to}`,
    {
      adjusted: options.adjusted ?? true,
      sort: options.sort ?? 'asc',
      limit: options.limit ?? 5000,
    },
  );
  return data.results ?? [];
}

// ── Indices snapshots ──────────────────────────────────────────────

/**
 * Fetch snapshots for one or more indices.
 * Ticker format: 'I:VIX', 'I:TNX', 'I:IRX', 'I:SPX', etc.
 * Returns a Map keyed by ticker for easy lookup.
 */
export async function getIndicesSnapshots(
  tickers: string[],
): Promise<Map<string, MassiveIndexSnapshot>> {
  if (tickers.length === 0) return new Map();
  const data = await massiveFetch<{ results?: MassiveIndexSnapshot[]; status: string }>(
    '/v3/snapshot/indices',
    { 'ticker.any_of': tickers.join(','), limit: tickers.length + 5 },
  );
  const map = new Map<string, MassiveIndexSnapshot>();
  for (const snap of data.results ?? []) {
    if (!snap.error) map.set(snap.ticker, snap);
  }
  return map;
}

// ── Options chain ──────────────────────────────────────────────────

interface OptionsChainPage {
  results?: MassiveOptionContract[];
  status: string;
  next_url?: string;
  request_id?: string;
}

export interface OptionsChainFetchParams {
  contract_type?: 'call' | 'put';
  'expiration_date.gte'?: string;
  'expiration_date.lte'?: string;
  strike_price?: number;
  limit?: number;
  order?: 'asc' | 'desc';
  sort?: string;
}

/**
 * Fetch options chain for a given underlying ticker.
 * Automatically paginates through pages up to maxPages.
 * Returns all contracts plus the latest underlying price.
 *
 * Stops early if stopAtExpirations is set and we've seen that many distinct
 * expiration dates and the next result would be a new (later) expiration.
 */
export async function getOptionsChainPaged(
  underlyingAsset: string,
  params: OptionsChainFetchParams = {},
  maxPages = 20,
  stopAtExpirations?: number,
): Promise<{ contracts: MassiveOptionContract[]; underlyingPrice: number }> {
  const contracts: MassiveOptionContract[] = [];
  let underlyingPrice = 0;
  const seenExpirations = new Set<string>();

  const queryParams: Record<string, string | number | boolean | undefined> = {
    limit: params.limit ?? 250,
    order: params.order ?? 'asc',
    sort: params.sort ?? 'expiration_date',
    ...params,
  };

  let url: string | null = massiveBuildUrl(
    `/v3/snapshot/options/${encodeURIComponent(underlyingAsset)}`,
    queryParams,
  );

  let pages = 0;
  while (url && pages < maxPages) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Massive options ${res.status}: ${body.slice(0, 200)}`);
    }
    const data: OptionsChainPage = await res.json();

    if (data.results?.length) {
      for (const contract of data.results) {
        const expiry = contract.details.expiration_date;

        // If we've hit the stop limit, check if this is a new expiration
        if (stopAtExpirations && seenExpirations.size >= stopAtExpirations && !seenExpirations.has(expiry)) {
          url = null; // stop pagination
          break;
        }

        seenExpirations.add(expiry);
        contracts.push(contract);

        if (!underlyingPrice && contract.underlying_asset?.price) {
          underlyingPrice = contract.underlying_asset.price;
        }
      }
    }

    if (data.next_url) {
      // Massive's next_url doesn't always include the API key — ensure it's present
      const nextUrl = new URL(data.next_url);
      if (!nextUrl.searchParams.has('apiKey')) {
        nextUrl.searchParams.set('apiKey', getApiKey());
      }
      url = nextUrl.toString();
    } else {
      url = null;
    }
    pages++;
  }

  return { contracts, underlyingPrice };
}

// ── Date helpers ───────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD in US/Eastern (market timezone). */
export function todayDateStr(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Returns a date N calendar days ago as YYYY-MM-DD in US/Eastern. */
export function daysAgoDateStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
