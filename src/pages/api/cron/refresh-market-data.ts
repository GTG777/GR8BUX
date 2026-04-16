/**
 * /api/cron/refresh-market-data
 *
 * Fetches latest LEAPS chain data from Massive.com for every symbol in LEAPS_UNIVERSE
 * and upserts into the `market_data` Supabase table.
 *
 * Called by Netlify cron every 15 minutes (market hours only).
 * Also callable manually via POST with X-Cron-Secret header.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';

// 80 liquid LEAPS candidates across all major sectors
const LEAPS_UNIVERSE = [
  // ── Index ETFs ──────────────────────────────────────────────────────────
  { symbol: 'SPY',  name: 'S&P 500 ETF',          sector: 'Index' },
  { symbol: 'QQQ',  name: 'Nasdaq 100 ETF',        sector: 'Index' },
  { symbol: 'IWM',  name: 'Russell 2000 ETF',      sector: 'Index' },
  { symbol: 'DIA',  name: 'Dow Jones ETF',          sector: 'Index' },
  { symbol: 'GLD',  name: 'Gold ETF',               sector: 'Commodities' },
  { symbol: 'SLV',  name: 'Silver ETF',             sector: 'Commodities' },
  { symbol: 'USO',  name: 'Oil ETF',                sector: 'Energy' },
  { symbol: 'TLT',  name: '20yr Treasury ETF',      sector: 'Bonds' },
  // ── Technology ──────────────────────────────────────────────────────────
  { symbol: 'AAPL', name: 'Apple',                  sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft',              sector: 'Technology' },
  { symbol: 'NVDA', name: 'Nvidia',                 sector: 'Technology' },
  { symbol: 'META', name: 'Meta Platforms',         sector: 'Technology' },
  { symbol: 'GOOGL',name: 'Alphabet',               sector: 'Technology' },
  { symbol: 'AMD',  name: 'AMD',                    sector: 'Technology' },
  { symbol: 'INTC', name: 'Intel',                  sector: 'Technology' },
  { symbol: 'AVGO', name: 'Broadcom',               sector: 'Technology' },
  { symbol: 'QCOM', name: 'Qualcomm',               sector: 'Technology' },
  { symbol: 'MU',   name: 'Micron Technology',      sector: 'Technology' },
  { symbol: 'AMAT', name: 'Applied Materials',      sector: 'Technology' },
  { symbol: 'LRCX', name: 'Lam Research',           sector: 'Technology' },
  { symbol: 'ORCL', name: 'Oracle',                 sector: 'Technology' },
  { symbol: 'CRM',  name: 'Salesforce',             sector: 'Technology' },
  { symbol: 'NOW',  name: 'ServiceNow',             sector: 'Technology' },
  { symbol: 'ADBE', name: 'Adobe',                  sector: 'Technology' },
  { symbol: 'PLTR', name: 'Palantir',               sector: 'Technology' },
  { symbol: 'SNOW', name: 'Snowflake',              sector: 'Technology' },
  { symbol: 'NET',  name: 'Cloudflare',             sector: 'Technology' },
  { symbol: 'PANW', name: 'Palo Alto Networks',     sector: 'Technology' },
  { symbol: 'CRWD', name: 'CrowdStrike',            sector: 'Technology' },
  // ── Consumer / E-commerce ────────────────────────────────────────────────
  { symbol: 'AMZN', name: 'Amazon',                 sector: 'Consumer' },
  { symbol: 'TSLA', name: 'Tesla',                  sector: 'Consumer' },
  { symbol: 'NFLX', name: 'Netflix',                sector: 'Consumer' },
  { symbol: 'COST', name: 'Costco',                 sector: 'Consumer' },
  { symbol: 'WMT',  name: 'Walmart',                sector: 'Consumer' },
  { symbol: 'HD',   name: 'Home Depot',             sector: 'Consumer' },
  { symbol: 'NKE',  name: 'Nike',                   sector: 'Consumer' },
  { symbol: 'SBUX', name: 'Starbucks',              sector: 'Consumer' },
  { symbol: 'MCD',  name: "McDonald's",             sector: 'Consumer' },
  // ── Financials ──────────────────────────────────────────────────────────
  { symbol: 'JPM',  name: 'JPMorgan',               sector: 'Financials' },
  { symbol: 'GS',   name: 'Goldman Sachs',          sector: 'Financials' },
  { symbol: 'MS',   name: 'Morgan Stanley',         sector: 'Financials' },
  { symbol: 'BAC',  name: 'Bank of America',        sector: 'Financials' },
  { symbol: 'WFC',  name: 'Wells Fargo',            sector: 'Financials' },
  { symbol: 'BRK-B',name: 'Berkshire Hathaway',     sector: 'Financials' },
  { symbol: 'V',    name: 'Visa',                   sector: 'Financials' },
  { symbol: 'MA',   name: 'Mastercard',             sector: 'Financials' },
  { symbol: 'AXP',  name: 'American Express',       sector: 'Financials' },
  { symbol: 'BLK',  name: 'BlackRock',              sector: 'Financials' },
  // ── Healthcare ──────────────────────────────────────────────────────────
  { symbol: 'UNH',  name: 'UnitedHealth',           sector: 'Healthcare' },
  { symbol: 'LLY',  name: 'Eli Lilly',              sector: 'Healthcare' },
  { symbol: 'JNJ',  name: 'Johnson & Johnson',      sector: 'Healthcare' },
  { symbol: 'ABBV', name: 'AbbVie',                 sector: 'Healthcare' },
  { symbol: 'MRK',  name: 'Merck',                  sector: 'Healthcare' },
  { symbol: 'PFE',  name: 'Pfizer',                 sector: 'Healthcare' },
  { symbol: 'AMGN', name: 'Amgen',                  sector: 'Healthcare' },
  { symbol: 'ISRG', name: 'Intuitive Surgical',     sector: 'Healthcare' },
  { symbol: 'MRNA', name: 'Moderna',                sector: 'Healthcare' },
  // ── Energy ──────────────────────────────────────────────────────────────
  { symbol: 'XOM',  name: 'ExxonMobil',             sector: 'Energy' },
  { symbol: 'CVX',  name: 'Chevron',                sector: 'Energy' },
  { symbol: 'COP',  name: 'ConocoPhillips',         sector: 'Energy' },
  { symbol: 'SLB',  name: 'SLB',                    sector: 'Energy' },
  // ── Industrials ─────────────────────────────────────────────────────────
  { symbol: 'BA',   name: 'Boeing',                 sector: 'Industrials' },
  { symbol: 'CAT',  name: 'Caterpillar',            sector: 'Industrials' },
  { symbol: 'DE',   name: 'Deere & Co',             sector: 'Industrials' },
  { symbol: 'GE',   name: 'GE Aerospace',           sector: 'Industrials' },
  { symbol: 'RTX',  name: 'Raytheon Technologies',  sector: 'Industrials' },
  { symbol: 'LMT',  name: 'Lockheed Martin',        sector: 'Industrials' },
  { symbol: 'UPS',  name: 'UPS',                    sector: 'Industrials' },
  { symbol: 'FDX',  name: 'FedEx',                  sector: 'Industrials' },
  // ── Telecom / Media ──────────────────────────────────────────────────────
  { symbol: 'DIS',  name: 'Walt Disney',            sector: 'Media' },
  { symbol: 'SPOT', name: 'Spotify',                sector: 'Media' },
  { symbol: 'T',    name: 'AT&T',                   sector: 'Telecom' },
  { symbol: 'VZ',   name: 'Verizon',                sector: 'Telecom' },
  // ── Real Estate / Utilities ──────────────────────────────────────────────
  { symbol: 'AMT',  name: 'American Tower',         sector: 'Real Estate' },
  { symbol: 'NEE',  name: 'NextEra Energy',         sector: 'Utilities' },
];

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = 5; // parallel fetches per batch

// Fetch a single symbol from the internal leaps-chain API
async function fetchSymbolData(symbol: string, baseUrl: string) {
  const url = `${baseUrl}/api/options/leaps-chain?symbol=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, { headers: { 'x-internal-cron': 'true' } });
  if (!res.ok) throw new Error(`leaps-chain ${symbol} → HTTP ${res.status}`);
  return res.json();
}

// Process one symbol: fetch + compute + upsert
async function processSymbol(
  { symbol, name, sector }: { symbol: string; name: string; sector: string },
  baseUrl: string,
  supabase: ReturnType<typeof import('@/lib/supabase').getSupabaseServiceRoleClient>,
): Promise<{ symbol: string; status: 'ok' | 'error'; error?: string }> {
  try {
    const data = await fetchSymbolData(symbol, baseUrl);

    // Best ATM call: delta closest to 0.70
    const best = (data.contracts ?? [])
      .filter((c: { type: string; delta: number; openInterest: number }) =>
        c.type === 'call' && c.delta > 0 && c.openInterest >= 10)
      .sort((a: { delta: number }, b: { delta: number }) =>
        Math.abs(Math.abs(a.delta) - 0.70) - Math.abs(Math.abs(b.delta) - 0.70))[0] ?? null;

    // IVR from all contracts
    const ivs: number[] = (data.contracts ?? [])
      .map((c: { impliedVolatility: number }) => c.impliedVolatility)
      .filter((v: number) => v > 0);
    let ivr: number | null = null;
    if (ivs.length >= 4) {
      const sorted = [...ivs].sort((a, b) => a - b);
      const mid = sorted.slice(Math.floor(sorted.length * 0.3), Math.ceil(sorted.length * 0.7));
      const current = mid.reduce((s: number, v: number) => s + v, 0) / mid.length;
      const mn = Math.min(...sorted), mx = Math.max(...sorted);
      if (mx !== mn) ivr = parseFloat(((current - mn) / (mx - mn) * 100).toFixed(1));
    }

    await supabase!.from('market_data').upsert({
      symbol, name, sector,
      price: data.underlyingPrice ?? null,
      hv20: data.hv20 ?? null,
      rsi: data.rsi ?? null,
      ivr,
      best_delta: best?.delta ?? null,
      best_expiry: best?.expirationStr ?? null,
      best_premium: best?.mid ?? null,
      raw_payload: data,
      fetch_error: false,
      refreshed_at: new Date().toISOString(),
    }, { onConflict: 'symbol' });

    return { symbol, status: 'ok' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[refresh-market-data] ${symbol} failed:`, message);
    await supabase!.from('market_data').upsert({
      symbol, name, sector,
      fetch_error: true,
      refreshed_at: new Date().toISOString(),
    }, { onConflict: 'symbol' });
    return { symbol, status: 'error', error: message };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Accept GET (Netlify cron) or POST (manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate cron secret if set
  if (CRON_SECRET) {
    const provided = req.headers['x-cron-secret'] ?? req.query.secret;
    if (provided !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase service role not configured' });
  }

  // Derive base URL for internal API calls
  const proto = req.headers['x-forwarded-proto'] ?? 'http';
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:3000';
  const baseUrl = `${proto}://${host}`;

  const results: { symbol: string; status: 'ok' | 'error'; error?: string }[] = [];

  // Process in parallel batches to stay fast without overwhelming the API
  for (let i = 0; i < LEAPS_UNIVERSE.length; i += BATCH_SIZE) {
    const batch = LEAPS_UNIVERSE.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((entry) => processSymbol(entry, baseUrl, supabase))
    );
    results.push(...batchResults);

    // 500ms pause between batches to be a good API citizen
    if (i + BATCH_SIZE < LEAPS_UNIVERSE.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  const failed = results.filter((r) => r.status === 'error').length;

  console.log(`[refresh-market-data] Done: ${ok} ok, ${failed} failed out of ${LEAPS_UNIVERSE.length} symbols`);
  return res.status(200).json({ ok, failed, total: LEAPS_UNIVERSE.length, results });
}
