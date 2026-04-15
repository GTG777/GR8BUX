/**
 * /api/cron/refresh-market-data
 *
 * Fetches latest LEAPS chain data from Yahoo for every symbol in LEAPS_UNIVERSE
 * and upserts into the `market_data` Supabase table.
 *
 * Called by Netlify cron every 15 minutes (market hours only).
 * Also callable manually via POST with X-Cron-Secret header.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';

const LEAPS_UNIVERSE = [
  { symbol: 'SPY',   name: 'S&P 500 ETF',       sector: 'Index' },
  { symbol: 'QQQ',   name: 'Nasdaq 100 ETF',     sector: 'Index' },
  { symbol: 'AAPL',  name: 'Apple',              sector: 'Technology' },
  { symbol: 'MSFT',  name: 'Microsoft',          sector: 'Technology' },
  { symbol: 'NVDA',  name: 'Nvidia',             sector: 'Technology' },
  { symbol: 'META',  name: 'Meta Platforms',     sector: 'Technology' },
  { symbol: 'AMZN',  name: 'Amazon',             sector: 'Consumer' },
  { symbol: 'GOOGL', name: 'Alphabet',           sector: 'Technology' },
  { symbol: 'TSLA',  name: 'Tesla',              sector: 'Consumer' },
  { symbol: 'JPM',   name: 'JPMorgan',           sector: 'Financials' },
  { symbol: 'GS',    name: 'Goldman Sachs',      sector: 'Financials' },
  { symbol: 'BRK-B', name: 'Berkshire Hathaway', sector: 'Financials' },
  { symbol: 'XOM',   name: 'ExxonMobil',         sector: 'Energy' },
  { symbol: 'UNH',   name: 'UnitedHealth',       sector: 'Healthcare' },
  { symbol: 'LLY',   name: 'Eli Lilly',          sector: 'Healthcare' },
  { symbol: 'V',     name: 'Visa',               sector: 'Financials' },
  { symbol: 'AMD',   name: 'AMD',                sector: 'Technology' },
  { symbol: 'PLTR',  name: 'Palantir',           sector: 'Technology' },
];

const CRON_SECRET = process.env.CRON_SECRET;

// Fetch a single symbol from the internal leaps-chain API
async function fetchSymbolData(symbol: string, baseUrl: string) {
  const url = `${baseUrl}/api/options/leaps-chain?symbol=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, { headers: { 'x-internal-cron': 'true' } });
  if (!res.ok) throw new Error(`leaps-chain ${symbol} → HTTP ${res.status}`);
  return res.json();
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

  // Process symbols sequentially to avoid overwhelming Yahoo
  for (const { symbol, name, sector } of LEAPS_UNIVERSE) {
    try {
      const data = await fetchSymbolData(symbol, baseUrl);

      // Compute best ATM call (delta closest to 0.70)
      const best = (data.contracts ?? [])
        .filter((c: any) => c.type === 'call' && c.delta > 0 && c.openInterest >= 10)
        .sort((a: any, b: any) => Math.abs(Math.abs(a.delta) - 0.70) - Math.abs(Math.abs(b.delta) - 0.70))[0] ?? null;

      // Compute IVR from all contracts
      const ivs: number[] = (data.contracts ?? []).map((c: any) => c.impliedVolatility).filter((v: number) => v > 0);
      let ivr: number | null = null;
      if (ivs.length >= 4) {
        const sorted = [...ivs].sort((a, b) => a - b);
        const mid = sorted.slice(Math.floor(sorted.length * 0.3), Math.ceil(sorted.length * 0.7));
        const current = mid.reduce((s: number, v: number) => s + v, 0) / mid.length;
        const mn = Math.min(...sorted), mx = Math.max(...sorted);
        if (mx !== mn) ivr = parseFloat(((current - mn) / (mx - mn) * 100).toFixed(1));
      }

      await supabase.from('market_data').upsert({
        symbol,
        name,
        sector,
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

      results.push({ symbol, status: 'ok' });
    } catch (err: any) {
      console.error(`[refresh-market-data] ${symbol} failed:`, err.message);

      // Mark as error in DB but don't stop the loop
      await supabase.from('market_data').upsert({
        symbol,
        name,
        sector,
        fetch_error: true,
        refreshed_at: new Date().toISOString(),
      }, { onConflict: 'symbol' });

      results.push({ symbol, status: 'error', error: err.message });
    }

    // Small delay between symbols to be polite to Yahoo
    await new Promise((r) => setTimeout(r, 300));
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  const failed = results.filter((r) => r.status === 'error').length;

  console.log(`[refresh-market-data] Done: ${ok} ok, ${failed} failed`);
  return res.status(200).json({ ok, failed, results });
}
