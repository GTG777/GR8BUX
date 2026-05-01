/**
 * GET /api/market/earnings-all?days=45&page=1&limit=50&q=AAPL
 *
 * Returns upcoming earnings for ALL stocks from Alpha Vantage —
 * no universe filter. Paginated. Optionally filtered by symbol/name query.
 *
 * Query params:
 *   ?days=45      – look-forward window (default 45, max 90)
 *   ?page=1       – 1-based page index
 *   ?limit=50     – results per page (max 100)
 *   ?q=           – symbol or company name substring search (case-insensitive)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { getMultipleStockSnapshots } from '@/lib/massive';

export interface AllEarningsRow {
  symbol: string;
  name: string;
  reportDate: string;      // YYYY-MM-DD
  daysOut: number;
  fiscalDateEnding: string;
  estimatedEPS: number | null;
  currency: string;
  // Supabase enrichment (null when not in our universe)
  price: number | null;
  rsi: number | null;
  ivRank: number | null;
  aiConsensus: string | null;
  setupType: string | null;
  relVol: number | null;  // today's volume / prev-day volume
}

interface CacheEntry { rows: AllEarningsRow[]; fetchedAt: number }
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
let _cache: CacheEntry | null = null;

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

async function fetchAndCache(): Promise<AllEarningsRow[]> {
  const avKey = process.env.ALPHAVANTAGE_API_KEY ?? '';
  if (!avKey) throw new Error('ALPHAVANTAGE_API_KEY not configured');

  const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${avKey}`;
  const avRes = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!avRes.ok) throw new Error(`Alpha Vantage ${avRes.status}`);
  const csv = await avRes.text();

  // ── Load Supabase enrichment ───────────────────────────────────────────
  type EnrichEntry = { price: number | null; rsi: number | null; ivRank: number | null; aiConsensus: string | null; setupType: string | null };
  const enrichMap: Record<string, EnrichEntry> = {};
  try {
    const supabase = getSupabaseServiceRoleClient();
    if (supabase) {
      const [mdRes, aiRes] = await Promise.all([
        supabase.from('market_data').select('symbol, price, rsi, ivr'),
        supabase.from('ai_analyses').select('symbol, consensus, setup_type'),
      ]);
      for (const r of mdRes.data ?? []) {
        enrichMap[r.symbol] = { price: r.price ?? null, rsi: r.rsi ?? null, ivRank: r.ivr ?? null, aiConsensus: null, setupType: null };
      }
      for (const r of aiRes.data ?? []) {
        if (!enrichMap[r.symbol]) enrichMap[r.symbol] = { price: null, rsi: null, ivRank: null, aiConsensus: null, setupType: null };
        enrichMap[r.symbol].aiConsensus = r.consensus ?? null;
        enrichMap[r.symbol].setupType = r.setup_type ?? null;
      }
    }
  } catch {
    // enrichment optional — continue without it
  }

  // ── Batch-fetch volume snapshots for tracked symbols ──────────────────
  const relVolMap: Record<string, number | null> = {};
  const trackedSymbols = Object.keys(enrichMap);
  if (trackedSymbols.length > 0) {
    try {
      const snaps = await getMultipleStockSnapshots(trackedSymbols);
      for (const [sym, snap] of snaps) {
        const dayVol  = snap.day?.v;
        const prevVol = snap.prevDay?.v;
        relVolMap[sym] = (dayVol != null && prevVol != null && prevVol > 0)
          ? Math.round((dayVol / prevVol) * 100) / 100
          : null;
      }
    } catch {
      // relVol optional — continue without it
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows: AllEarningsRow[] = [];
  for (const r of parseCSV(csv)) {
    const symbol = (r['symbol'] ?? '').trim().toUpperCase();
    const reportDate = (r['reportDate'] ?? '').trim();
    if (!symbol || !reportDate) continue;

    const reportDay = new Date(reportDate + 'T00:00:00');
    const daysOut = Math.floor((reportDay.getTime() - today.getTime()) / 86_400_000);
    if (daysOut < 0 || daysOut > 90) continue;

    const raw = r['estimate'] ?? '';
    const estimatedEPS = raw !== '' && !isNaN(Number(raw)) ? parseFloat(raw) : null;
    const enrich = enrichMap[symbol] ?? null;

    rows.push({
      symbol,
      name: (r['name'] ?? symbol).trim(),
      reportDate,
      daysOut,
      fiscalDateEnding: (r['fiscalDateEnding'] ?? '').trim(),
      estimatedEPS,
      currency: (r['currency'] ?? 'USD').trim(),
      price: enrich?.price ?? null,
      rsi: enrich?.rsi ?? null,
      ivRank: enrich?.ivRank ?? null,
      aiConsensus: enrich?.aiConsensus ?? null,
      setupType: enrich?.setupType ?? null,
      relVol: relVolMap[symbol] ?? null,
    });
  }

  // Sort soonest first
  rows.sort((a, b) => a.daysOut - b.daysOut || a.symbol.localeCompare(b.symbol));
  _cache = { rows, fetchedAt: Date.now() };
  return rows;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const days  = Math.min(Number(req.query.days)  || 45, 90);
    const page  = Math.max(Number(req.query.page)  || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const q     = ((req.query.q as string) ?? '').trim().toLowerCase();

    // Use cache if fresh
    let rows: AllEarningsRow[];
    if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL) {
      rows = _cache.rows;
    } else {
      rows = await fetchAndCache();
    }

    // Apply days filter
    let filtered = rows.filter((r) => r.daysOut <= days);

    // Apply search filter
    if (q) {
      filtered = filtered.filter(
        (r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
      );
    }

    const total    = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const pageRows = filtered.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      success: true,
      rows: pageRows,
      total,
      page,
      totalPages,
      cachedAt: _cache ? new Date(_cache.fetchedAt).toISOString() : null,
    });
  } catch (err) {
    // Serve stale cache rather than error
    if (_cache) {
      const days  = Math.min(Number(req.query.days) || 45, 90);
      const filtered = _cache.rows.filter((r) => r.daysOut <= days);
      return res.status(200).json({ success: true, rows: filtered.slice(0, 50), total: filtered.length, page: 1, totalPages: 1, cachedAt: new Date(_cache.fetchedAt).toISOString(), stale: true });
    }
    console.error('[earnings-all]', err);
    return res.status(502).json({ success: false, error: String(err) });
  }
}
