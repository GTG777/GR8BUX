/**
 * GET /api/market/earnings-all?days=45&page=1&limit=50&q=AAPL
 *
 * Returns upcoming earnings for ALL stocks from Alpha Vantage â€”
 * no universe filter. Paginated. Optionally filtered by symbol/name query.
 *
 * Caching strategy:
 *   - Alpha Vantage CSV   â†’ 4 hours  (rate-limited external source)
 *   - Supabase enrichment â†’ 15 min   (updated by cron every 15 min)
 *   - Massive relVol      â†’ 15 min   (intraday snapshot)
 *
 * Query params:
 *   ?days=45      â€“ look-forward window (default 45, max 90)
 *   ?page=1       â€“ 1-based page index
 *   ?limit=50     â€“ results per page (max 100)
 *   ?q=           â€“ symbol or company name substring search (case-insensitive)
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
  relVol: number | null;         // today's volume / prev-day volume
  expectedMove: number | null;   // % move implied by HV20 × √(daysOut/252)
  isHighVolEarner: boolean;      // expectedMove ≥ 10%
  epsBeatStreak: number | null;  // consecutive quarterly EPS beats
  avgSurprisePct: number | null; // avg absolute EPS surprise % last 8Q
}

// â”€â”€ Base row (AV CSV only â€” no enrichment) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface BaseRow {
  symbol: string;
  name: string;
  reportDate: string;
  daysOut: number;
  fiscalDateEnding: string;
  estimatedEPS: number | null;
  currency: string;
}

// â”€â”€ Cache buckets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const AV_TTL      = 4 * 60 * 60 * 1000;  // 4 hours â€” AV rate limits
const ENRICH_TTL  = 15 * 60 * 1000;       // 15 min  â€” matches cron cadence
const VOL_TTL     = 15 * 60 * 1000;       // 15 min  â€” intraday snapshots

let _avCache:     { rows: BaseRow[]; at: number } | null = null;
let _enrichCache: { map: Record<string, EnrichEntry>; at: number } | null = null;
let _volCache:    { map: Record<string, number | null>; at: number } | null = null;

type EnrichEntry = {
  price: number | null;
  rsi: number | null;
  ivRank: number | null;
  hv20: number | null;
  aiConsensus: string | null;
  setupType: string | null;
  epsBeatStreak: number | null;
  avgSurprisePct: number | null;
};

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

// Fetch + cache Alpha Vantage CSV (4-hour TTL)
async function getBaseRows(): Promise<BaseRow[]> {
  if (_avCache && Date.now() - _avCache.at < AV_TTL) return _avCache.rows;

  const avKey = process.env.ALPHAVANTAGE_API_KEY ?? '';
  if (!avKey) throw new Error('ALPHAVANTAGE_API_KEY not configured');

  const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${avKey}`;
  const avRes = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!avRes.ok) throw new Error(`Alpha Vantage ${avRes.status}`);
  const csv = await avRes.text();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows: BaseRow[] = [];
  for (const r of parseCSV(csv)) {
    const symbol = (r['symbol'] ?? '').trim().toUpperCase();
    const reportDate = (r['reportDate'] ?? '').trim();
    if (!symbol || !reportDate) continue;

    const reportDay = new Date(reportDate + 'T00:00:00');
    const daysOut = Math.floor((reportDay.getTime() - today.getTime()) / 86_400_000);
    if (daysOut < 0 || daysOut > 90) continue;

    const raw = r['estimate'] ?? '';
    rows.push({
      symbol,
      name: (r['name'] ?? symbol).trim(),
      reportDate,
      daysOut,
      fiscalDateEnding: (r['fiscalDateEnding'] ?? '').trim(),
      estimatedEPS: raw !== '' && !isNaN(Number(raw)) ? parseFloat(raw) : null,
      currency: (r['currency'] ?? 'USD').trim(),
    });
  }

  rows.sort((a, b) => a.daysOut - b.daysOut || a.symbol.localeCompare(b.symbol));
  _avCache = { rows, at: Date.now() };
  return rows;
}

// Fetch + cache Supabase enrichment (15-min TTL)
async function getEnrichMap(): Promise<Record<string, EnrichEntry>> {
  if (_enrichCache && Date.now() - _enrichCache.at < ENRICH_TTL) return _enrichCache.map;

  const map: Record<string, EnrichEntry> = {};
  try {
    const supabase = getSupabaseServiceRoleClient();
    if (!supabase) return map;

    const [mdRes, aiRes, enrichRes] = await Promise.all([
      supabase.from('market_data').select('symbol, price, rsi, ivr, hv20'),
      supabase.from('ai_analyses').select('symbol, consensus, setup_type'),
      supabase.from('earnings_enrichment').select('symbol, hv20, eps_beat_streak, avg_surprise_pct'),
    ]);
    for (const r of mdRes.data ?? []) {
      map[r.symbol] = { price: r.price ?? null, rsi: r.rsi ?? null, ivRank: r.ivr ?? null, hv20: r.hv20 ?? null, aiConsensus: null, setupType: null, epsBeatStreak: null, avgSurprisePct: null };
    }
    // earnings_enrichment has HV20 for ALL symbols (not just LEAPS universe)
    for (const r of enrichRes.data ?? []) {
      if (!map[r.symbol]) map[r.symbol] = { price: null, rsi: null, ivRank: null, hv20: null, aiConsensus: null, setupType: null, epsBeatStreak: null, avgSurprisePct: null };
      // earnings_enrichment HV20 takes precedence for non-LEAPS symbols; market_data wins for LEAPS (fresher)
      if (map[r.symbol].hv20 == null && r.hv20 != null) map[r.symbol].hv20 = r.hv20;
      map[r.symbol].epsBeatStreak  = r.eps_beat_streak  ?? null;
      map[r.symbol].avgSurprisePct = r.avg_surprise_pct ?? null;
    }
    for (const r of aiRes.data ?? []) {
      if (!map[r.symbol]) map[r.symbol] = { price: null, rsi: null, ivRank: null, hv20: null, aiConsensus: null, setupType: null, epsBeatStreak: null, avgSurprisePct: null };
      map[r.symbol].aiConsensus = r.consensus ?? null;
      map[r.symbol].setupType   = r.setup_type ?? null;
    }
    _enrichCache = { map, at: Date.now() };
  } catch (err) {
    console.error('[earnings-all] Supabase enrichment error:', err);
    // Return stale cache rather than empty
    if (_enrichCache) return _enrichCache.map;
  }
  return map;
}

// Fetch + cache Massive relVol (15-min TTL)
async function getRelVolMap(symbols: string[]): Promise<Record<string, number | null>> {
  if (_volCache && Date.now() - _volCache.at < VOL_TTL) return _volCache.map;

  const map: Record<string, number | null> = {};
  if (symbols.length === 0) return map;
  try {
    const snaps = await getMultipleStockSnapshots(symbols);
    for (const [sym, snap] of snaps) {
      const dayVol  = snap.day?.v;
      const prevVol = snap.prevDay?.v;
      map[sym] = (dayVol != null && prevVol != null && prevVol > 0)
        ? Math.round((dayVol / prevVol) * 100) / 100
        : null;
    }
    _volCache = { map, at: Date.now() };
  } catch (err) {
    console.error('[earnings-all] Massive relVol error:', err);
    if (_volCache) return _volCache.map;
  }
  return map;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const days  = Math.min(Number(req.query.days)  || 45, 90);
    const page  = Math.max(Number(req.query.page)  || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const q     = ((req.query.q as string) ?? '').trim().toLowerCase();

    // Fetch all three caches in parallel â€” each refreshes independently
    const [baseRows, enrichMap, relVolMap] = await Promise.all([
      getBaseRows(),
      getEnrichMap(),
      getRelVolMap(Object.keys(
        _enrichCache?.map ?? {}   // use existing enrich cache keys if available to avoid chicken-and-egg
      )),
    ]);

    // Merge enrichment into rows
    const enrichedRows: AllEarningsRow[] = baseRows.map((r) => {
      const e = enrichMap[r.symbol] ?? null;
      const hv20 = e?.hv20 ?? null;
      const expectedMove = (hv20 != null && r.daysOut > 0)
        ? Math.round(hv20 * Math.sqrt(r.daysOut / 252) * 10) / 10
        : null;
      return {
        ...r,
        price:          e?.price       ?? null,
        rsi:            e?.rsi         ?? null,
        ivRank:         e?.ivRank      ?? null,
        aiConsensus:    e?.aiConsensus ?? null,
        setupType:      e?.setupType   ?? null,
        relVol:         relVolMap[r.symbol] ?? null,
        expectedMove,
        isHighVolEarner: expectedMove != null && expectedMove >= 10,
        epsBeatStreak:  e?.epsBeatStreak  ?? null,
        avgSurprisePct: e?.avgSurprisePct ?? null,
      };
    });

    // Apply days + search filters
    let filtered = enrichedRows.filter((r) => r.daysOut <= days);
    if (q) {
      filtered = filtered.filter(
        (r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
      );
    }

    const total      = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const pageRows   = filtered.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      success: true,
      rows: pageRows,
      total,
      page,
      totalPages,
      cachedAt:   _avCache ? new Date(_avCache.at).toISOString() : null,
      enrichedAt: _enrichCache ? new Date(_enrichCache.at).toISOString() : null,
    });
  } catch (err) {
    // Serve stale AV cache + fresh enrichment if possible
    if (_avCache) {
      const enrichMap  = _enrichCache?.map ?? {};
      const relVolMap  = _volCache?.map    ?? {};
      const days       = Math.min(Number(req.query.days) || 45, 90);
      const enriched   = _avCache.rows
        .filter((r) => r.daysOut <= days)
        .map((r) => {
          const e = enrichMap[r.symbol] ?? null;
          const hv20e = e?.hv20 ?? null;
          const em = (hv20e != null && r.daysOut > 0) ? Math.round(hv20e * Math.sqrt(r.daysOut / 252) * 10) / 10 : null;
          return { ...r, price: e?.price ?? null, rsi: e?.rsi ?? null, ivRank: e?.ivRank ?? null, aiConsensus: e?.aiConsensus ?? null, setupType: e?.setupType ?? null, relVol: relVolMap[r.symbol] ?? null, expectedMove: em, isHighVolEarner: em != null && em >= 10, epsBeatStreak: e?.epsBeatStreak ?? null, avgSurprisePct: e?.avgSurprisePct ?? null };
        });
      return res.status(200).json({ success: true, rows: enriched.slice(0, 50), total: enriched.length, page: 1, totalPages: 1, cachedAt: new Date(_avCache.at).toISOString(), enrichedAt: _enrichCache ? new Date(_enrichCache.at).toISOString() : null, stale: true });
    }
    console.error('[earnings-all]', err);
    return res.status(502).json({ success: false, error: String(err) });
  }
  }
