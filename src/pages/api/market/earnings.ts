/**
 * GET /api/market/earnings
 *
 * Returns upcoming earnings for all tracked LEAPS symbols (80 stocks).
 * Source: Alpha Vantage EARNINGS_CALENDAR (one CSV call, 4-hour in-memory cache).
 * Enriched with IVR + RSI from Supabase market_data.
 *
 * Query params:
 *   ?days=30   – look-forward window in days (default 45, max 90)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';

// ── Shared universe (must stay in sync with refresh-market-data.ts) ──────────
const LEAPS_SYMBOLS = new Set([
  'SPY','QQQ','IWM','DIA','GLD','SLV','USO','TLT',
  'AAPL','MSFT','NVDA','META','GOOGL','AMD','INTC','AVGO','QCOM','MU','AMAT',
  'LRCX','ORCL','CRM','NOW','ADBE','PLTR','SNOW','NET','PANW','CRWD',
  'AMZN','TSLA','NFLX','COST','WMT','HD','NKE','SBUX','MCD',
  'JPM','GS','MS','BAC','WFC','BRK-B','V','MA','AXP','BLK',
  'UNH','LLY','JNJ','ABBV','MRK','PFE','AMGN','ISRG','MRNA',
  'XOM','CVX','COP','SLB',
  'BA','CAT','DE','GE','RTX','LMT','UPS','FDX',
  'DIS','SPOT','T','VZ',
  'AMT','NEE',
]);

export interface EarningsEvent {
  symbol: string;
  name: string;
  sector: string;
  reportDate: string;        // YYYY-MM-DD
  daysOut: number;
  fiscalDateEnding: string;
  estimatedEPS: number | null;
  currency: string;
  ivRank: number | null;
  rsi: number | null;
  price: number | null;
  aiConsensus: string | null;
  // Derived
  urgency: 'today' | 'this-week' | 'next-week' | 'later';
  strategy: 'sell-premium' | 'leaps-opportunity' | 'watch' | 'avoid';
  ivCrush: boolean;
}

interface CacheEntry {
  data: EarningsEvent[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function parseCSV(csv: string): Array<Record<string, string>> {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(',');
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    return obj;
  });
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function urgency(days: number): EarningsEvent['urgency'] {
  if (days <= 1)  return 'today';
  if (days <= 7)  return 'this-week';
  if (days <= 14) return 'next-week';
  return 'later';
}

function strategy(ivRank: number | null, aiConsensus: string | null): EarningsEvent['strategy'] {
  if (aiConsensus === 'AVOID') return 'avoid';
  if (ivRank != null && ivRank >= 65) return 'sell-premium';
  if (ivRank != null && ivRank < 35) return 'leaps-opportunity';
  return 'watch';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const days = Math.min(Number(req.query.days) || 45, 90);

  // ── Serve from cache if fresh ────────────────────────────────────────────
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    const filtered = _cache.data.filter((e) => e.daysOut <= days);
    return res.status(200).json({
      events: filtered,
      total: filtered.length,
      cachedAt: new Date(_cache.fetchedAt).toISOString(),
    });
  }

  // ── Fetch fresh from Alpha Vantage ───────────────────────────────────────
  const avKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!avKey) {
    return res.status(500).json({ error: 'ALPHAVANTAGE_API_KEY not configured' });
  }

  let rawRows: Array<Record<string, string>> = [];
  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${avKey}`;
    const avRes = await fetch(url, { headers: { Accept: 'text/csv' } });
    if (!avRes.ok) throw new Error(`Alpha Vantage ${avRes.status}`);
    const csv = await avRes.text();
    rawRows = parseCSV(csv);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[earnings] Alpha Vantage fetch failed:', msg);
    // Return stale cache if available
    if (_cache) {
      const filtered = _cache.data.filter((e) => e.daysOut <= days);
      return res.status(200).json({
        events: filtered,
        total: filtered.length,
        cachedAt: new Date(_cache.fetchedAt).toISOString(),
        stale: true,
      });
    }
    return res.status(502).json({ error: `Earnings data unavailable: ${msg}` });
  }

  // ── Load enrichment data from Supabase ───────────────────────────────────
  const enrichMap: Record<string, { sector: string; ivRank: number | null; rsi: number | null; price: number | null; aiConsensus: string | null; name: string }> = {};
  const supabase = getSupabaseServiceRoleClient();
  if (supabase) {
    const [mdRes, aiRes] = await Promise.all([
      supabase.from('market_data').select('symbol, name, sector, ivr, rsi, price'),
      supabase.from('ai_analyses').select('symbol, consensus').eq('setup_type', 'LEAPS_CANDIDATE'),
    ]);
    for (const r of mdRes.data ?? []) {
      enrichMap[r.symbol] = {
        name: r.name ?? r.symbol,
        sector: r.sector ?? 'Unknown',
        ivRank: r.ivr ?? null,
        rsi: r.rsi ?? null,
        price: r.price ?? null,
        aiConsensus: null,
      };
    }
    for (const r of aiRes.data ?? []) {
      if (enrichMap[r.symbol]) enrichMap[r.symbol].aiConsensus = r.consensus;
    }
  }

  // ── Parse + filter ───────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const events: EarningsEvent[] = [];

  for (const row of rawRows) {
    const sym = row['symbol']?.toUpperCase();
    if (!sym || !LEAPS_SYMBOLS.has(sym)) continue;

    const reportDate = row['reportDate'] ?? '';
    if (!reportDate) continue;

    const reportDay = new Date(reportDate + 'T00:00:00');
    const daysOut = daysBetween(today, reportDay);
    if (daysOut < 0 || daysOut > 90) continue;

    const enrich = enrichMap[sym];
    const ivRank = enrich?.ivRank ?? null;
    const aiConsensus = enrich?.aiConsensus ?? null;
    const estEps = row['estimate'] ? parseFloat(row['estimate']) : null;

    events.push({
      symbol: sym,
      name: enrich?.name ?? row['name'] ?? sym,
      sector: enrich?.sector ?? 'Unknown',
      reportDate,
      daysOut,
      fiscalDateEnding: row['fiscalDateEnding'] ?? '',
      estimatedEPS: estEps != null && !isNaN(estEps) ? estEps : null,
      currency: row['currency'] ?? 'USD',
      ivRank,
      rsi: enrich?.rsi ?? null,
      price: enrich?.price ?? null,
      aiConsensus,
      urgency: urgency(daysOut),
      strategy: strategy(ivRank, aiConsensus),
      ivCrush: (ivRank ?? 0) >= 65,
    });
  }

  // Sort: soonest first
  events.sort((a, b) => a.daysOut - b.daysOut);

  _cache = { data: events, fetchedAt: Date.now() };

  const filtered = events.filter((e) => e.daysOut <= days);
  return res.status(200).json({
    events: filtered,
    total: filtered.length,
    cachedAt: new Date().toISOString(),
  });
}
