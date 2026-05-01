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
  // Earnings-specific enrichment
  expectedMove: number | null;   // % move implied by HV20 × √(daysOut/252)
  epsBeatStreak: number | null;  // consecutive quarterly EPS beats (most recent first)
  avgSurprisePct: number | null; // avg absolute EPS surprise % last 8 quarters
  isHighVolEarner: boolean;      // expectedMove >= 10 — historically explosive on earnings
  // Derived
  urgency: 'today' | 'this-week' | 'next-week' | 'later';
  strategy: 'sell-premium' | 'leaps-opportunity' | 'watch' | 'avoid';
  ivCrush: boolean;
}

interface CacheEntry {
  data: EarningsEvent[];
  fetchedAt: number;
}

const CACHE_TTL_MS   = 4  * 60 * 60 * 1000; // 4 hours
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
let _cache: CacheEntry | null = null;

// ── Per-symbol AV earnings history cache (beat streak + avg surprise) ────────
interface EarningsHistEntry { epsBeatStreak: number; avgSurprisePct: number; fetchedAt: number; }
const _historyCache = new Map<string, EarningsHistEntry>();

async function getEarningsHistory(symbol: string): Promise<EarningsHistEntry | null> {
  const cached = _historyCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < HISTORY_TTL_MS) return cached;

  const avKey = process.env.ALPHAVANTAGE_API_KEY ?? '';
  if (!avKey) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${encodeURIComponent(symbol)}&apikey=${avKey}`;
    const avRes = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!avRes.ok) return null;
    const data = await avRes.json() as {
      quarterlyEarnings?: Array<{ surprisePercentage: string }>;
    };
    const quarterly = data.quarterlyEarnings ?? [];
    const last8 = quarterly.slice(0, 8);
    if (last8.length === 0) return null;

    // Beat streak: consecutive quarters (most recent first) with positive surprise
    let epsBeatStreak = 0;
    for (const q of last8) {
      const surp = parseFloat(q.surprisePercentage ?? 'NaN');
      if (!isNaN(surp) && isFinite(surp) && surp > 0) epsBeatStreak++;
      else break;
    }
    // Avg absolute EPS surprise %
    const valid = last8
      .map(q => Math.abs(parseFloat(q.surprisePercentage ?? 'NaN')))
      .filter(v => !isNaN(v) && isFinite(v));
    const avgSurprisePct = valid.length > 0
      ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length * 10) / 10
      : 0;

    const entry: EarningsHistEntry = { epsBeatStreak, avgSurprisePct, fetchedAt: Date.now() };
    _historyCache.set(symbol, entry);
    return entry;
  } catch {
    return null;
  }
}

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

function strategy(
  ivRank: number | null,
  aiConsensus: string | null,
  isHighVolEarner: boolean,
): EarningsEvent['strategy'] {
  if (aiConsensus === 'AVOID') return 'avoid';
  // High-vol earners can move 20%+ — never recommend selling premium into them
  if (isHighVolEarner) return 'watch';
  if (ivRank != null && ivRank >= 65) return 'sell-premium';
  if (ivRank != null && ivRank < 35) return 'leaps-opportunity';
  return 'watch';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    return await earningsHandler(req, res);
  } catch (err: unknown) {
    console.error('[earnings] Unhandled error:', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function earningsHandler(req: NextApiRequest, res: NextApiResponse) {
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

  // ── Fetch from Alpha Vantage earnings calendar ───────────────────────────
  interface EarningRow { symbol: string; reportDate: string; fiscalDateEnding: string; estimate: number | null; name: string; }
  let rawRows: EarningRow[] = [];
  try {
    const avKey = process.env.ALPHAVANTAGE_API_KEY ?? '';
    if (!avKey) throw new Error('ALPHAVANTAGE_API_KEY not configured');
    const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${avKey}`;
    const avRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!avRes.ok) throw new Error(`Alpha Vantage ${avRes.status}`);
    const csv = await avRes.text();
    rawRows = parseCSV(csv).map((r) => ({
      symbol: r['symbol'] ?? '',
      reportDate: r['reportDate'] ?? '',
      fiscalDateEnding: r['fiscalDateEnding'] ?? '',
      estimate: r['estimate'] ? parseFloat(r['estimate']) : null,
      name: r['name'] ?? '',
    })).filter((r) => r.symbol && r.reportDate);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[earnings] Alpha Vantage fetch failed:', msg);
    if (_cache) {
      const filtered = _cache.data.filter((e) => e.daysOut <= days);
      return res.status(200).json({ events: filtered, total: filtered.length, cachedAt: new Date(_cache.fetchedAt).toISOString(), stale: true });
    }
    return res.status(502).json({ error: `Earnings data unavailable: ${msg}` });
  }

  // ── Load enrichment data from Supabase ───────────────────────────────────
  const enrichMap: Record<string, { sector: string; ivRank: number | null; rsi: number | null; price: number | null; hv20: number | null; aiConsensus: string | null; name: string }> = {};
  try {
    const supabase = getSupabaseServiceRoleClient();
    if (supabase) {
      const [mdRes, aiRes] = await Promise.all([
        supabase.from('market_data').select('symbol, name, sector, ivr, rsi, price, hv20'),
        supabase.from('ai_analyses').select('symbol, consensus').eq('setup_type', 'LEAPS_CANDIDATE'),
      ]);
      for (const r of mdRes.data ?? []) {
        enrichMap[r.symbol] = {
          name: r.name ?? r.symbol,
          sector: r.sector ?? 'Unknown',
          ivRank: r.ivr ?? null,
          rsi: r.rsi ?? null,
          price: r.price ?? null,
          hv20: r.hv20 ?? null,
          aiConsensus: null,
        };
      }
      for (const r of aiRes.data ?? []) {
        if (enrichMap[r.symbol]) enrichMap[r.symbol].aiConsensus = r.consensus;
      }
    }
  } catch (sbErr: unknown) {
    console.error('[earnings] Supabase enrichment failed:', sbErr instanceof Error ? sbErr.message : String(sbErr));
    // Continue without enrichment — earnings dates still work
  }

  // ── Parse + filter ───────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const events: EarningsEvent[] = [];

  for (const row of rawRows) {
    const sym = row.symbol?.toUpperCase();
    if (!sym || !LEAPS_SYMBOLS.has(sym)) continue;

    const reportDate = row.reportDate ?? '';
    if (!reportDate) continue;

    const reportDay = new Date(reportDate + 'T00:00:00');
    const daysOut = daysBetween(today, reportDay);
    if (daysOut < 0 || daysOut > 90) continue;

    const enrich = enrichMap[sym];
    const ivRank = enrich?.ivRank ?? null;
    const aiConsensus = enrich?.aiConsensus ?? null;
    const estEps = row.estimate;
    const hv20 = enrich?.hv20 ?? null;
    // Expected move: HV20 × √(daysOut/252) — approx 1-std move the options market prices in
    const expectedMove = (hv20 != null && daysOut > 0)
      ? Math.round(hv20 * Math.sqrt(daysOut / 252) * 10) / 10
      : null;
    const isHighVolEarner = expectedMove != null && expectedMove >= 10;

    events.push({
      symbol: sym,
      name: enrich?.name ?? row.name ?? sym,
      sector: enrich?.sector ?? 'Unknown',
      reportDate,
      daysOut,
      fiscalDateEnding: row.fiscalDateEnding ?? '',
      estimatedEPS: estEps != null && !isNaN(estEps) ? estEps : null,
      currency: 'USD',
      ivRank,
      rsi: enrich?.rsi ?? null,
      price: enrich?.price ?? null,
      aiConsensus,
      expectedMove,
      epsBeatStreak: null,   // populated below after AV EARNINGS fetch
      avgSurprisePct: null,
      isHighVolEarner,
      urgency: urgency(daysOut),
      strategy: strategy(ivRank, aiConsensus, isHighVolEarner),
      ivCrush: (ivRank ?? 0) >= 65,
    });
  }

  // Sort: soonest first
  events.sort((a, b) => a.daysOut - b.daysOut);

  // Fetch AV earnings history (beat streak + avg surprise %) for near-term events
  // Limit to next-30d symbols to keep AV API usage minimal (~5-15 calls per 4h refresh)
  const soonSymbols = [...new Set(events.filter(e => e.daysOut <= 30).map(e => e.symbol))];
  if (soonSymbols.length > 0) {
    const histories = await Promise.all(soonSymbols.map(s => getEarningsHistory(s).catch(() => null)));
    soonSymbols.forEach((sym, i) => {
      const h = histories[i];
      if (!h) return;
      const ev = events.find(e => e.symbol === sym);
      if (ev) { ev.epsBeatStreak = h.epsBeatStreak; ev.avgSurprisePct = h.avgSurprisePct; }
    });
  }

  _cache = { data: events, fetchedAt: Date.now() };

  const filtered = events.filter((e) => e.daysOut <= days);
  return res.status(200).json({
    events: filtered,
    total: filtered.length,
    cachedAt: new Date().toISOString(),
  });
}
