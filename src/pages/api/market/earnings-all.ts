/**
 * GET /api/market/earnings-all?days=7&page=1&limit=50&q=AAPL&date=YYYY-MM-DD
 *
 * Returns upcoming earnings for ALL stocks — data sourced from the
 * `earnings_calendar` Supabase table (populated by the background cron).
 * No external API calls on this hot path — response time ~150–300ms.
 *
 * Query params:
 *   ?days=7            – look-forward window (default 7, max 90)
 *   ?page=1            – 1-based page index
 *   ?limit=50          – results per page (max 100)
 *   ?q=                – symbol or company name substring search
 *   ?date=YYYY-MM-DD   – filter to exact report date (no pagination, up to 500)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { getMultipleStockSnapshots } from '@/lib/massive';


export interface AllEarningsRow {
  symbol: string;
  name: string;
  reportDate: string;
  daysOut: number;
  fiscalDateEnding: string;
  estimatedEPS: number | null;
  currency: string;
  price: number | null;
  rsi: number | null;
  ivRank: number | null;
  aiConsensus: string | null;
  setupType: string | null;
  relVol: number | null;
  expectedMove: number | null;
  isHighVolEarner: boolean;
  epsBeatStreak: number | null;
  avgSurprisePct: number | null;
}

// -- In-memory caches (enrichment + relVol only -- calendar lives in Supabase) --
const ENRICH_TTL = 15 * 60 * 1000;
const VOL_TTL    = 15 * 60 * 1000;

let _volCache: { map: Record<string, number | null>; at: number } | null = null;

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

// Per-request enrichment cache scoped to the page's symbols only
// (avoids loading the whole universe when only 50 rows are needed)
let _enrichCache: { map: Record<string, EnrichEntry>; at: number } | null = null;

async function getEnrichMapForSymbols(symbols: string[]): Promise<Record<string, EnrichEntry>> {
  if (symbols.length === 0) return {};
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return {};

  // Serve from cache if fresh
  if (_enrichCache && Date.now() - _enrichCache.at < ENRICH_TTL) {
    return _enrichCache.map;
  }

  const map: Record<string, EnrichEntry> = {};
  try {
    const [mdRes, aiRes, enrichRes] = await Promise.all([
      supabase.from('market_data').select('symbol, price, rsi, ivr, hv20').in('symbol', symbols),
      supabase.from('ai_analyses').select('symbol, consensus, setup_type').in('symbol', symbols),
      supabase.from('earnings_enrichment').select('symbol, hv20, eps_beat_streak, avg_surprise_pct').in('symbol', symbols),
    ]);

    for (const r of mdRes.data ?? []) {
      map[r.symbol] = { price: r.price ?? null, rsi: r.rsi ?? null, ivRank: r.ivr ?? null, hv20: r.hv20 ?? null, aiConsensus: null, setupType: null, epsBeatStreak: null, avgSurprisePct: null };
    }
    for (const r of enrichRes.data ?? []) {
      if (!map[r.symbol]) map[r.symbol] = { price: null, rsi: null, ivRank: null, hv20: null, aiConsensus: null, setupType: null, epsBeatStreak: null, avgSurprisePct: null };
      if (map[r.symbol].hv20 == null && r.hv20 != null) map[r.symbol].hv20 = r.hv20;
      map[r.symbol].epsBeatStreak  = r.eps_beat_streak  ?? null;
      map[r.symbol].avgSurprisePct = r.avg_surprise_pct ?? null;
    }
    for (const r of aiRes.data ?? []) {
      if (!map[r.symbol]) map[r.symbol] = { price: null, rsi: null, ivRank: null, hv20: null, aiConsensus: null, setupType: null, epsBeatStreak: null, avgSurprisePct: null };
      map[r.symbol].aiConsensus = r.consensus  ?? null;
      map[r.symbol].setupType   = r.setup_type ?? null;
    }
    _enrichCache = { map, at: Date.now() };
  } catch (err) {
    console.error('[earnings-all] enrichment query error:', err);
    if (_enrichCache) return _enrichCache.map;
  }
  return map;
}

async function getRelVolForSymbols(symbols: string[]): Promise<Record<string, number | null>> {
  if (symbols.length === 0) return {};
  if (_volCache && Date.now() - _volCache.at < VOL_TTL) {
    const subset: Record<string, number | null> = {};
    for (const s of symbols) if (s in _volCache.map) subset[s] = _volCache.map[s];
    return subset;
  }
  try {
    const snaps = await getMultipleStockSnapshots(symbols);
    const map: Record<string, number | null> = {};
    for (const [sym, snap] of snaps) {
      const dayVol  = (snap as { day?: { v?: number }; prevDay?: { v?: number } }).day?.v;
      const prevVol = (snap as { day?: { v?: number }; prevDay?: { v?: number } }).prevDay?.v;
      map[sym] = (dayVol != null && prevVol != null && prevVol > 0)
        ? Math.round((dayVol / prevVol) * 100) / 100
        : null;
    }
    _volCache = { map: { ...(_volCache?.map ?? {}), ...map }, at: Date.now() };
    return map;
  } catch (err) {
    console.error('[earnings-all] relVol error:', err);
    return {};
  }
}

function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysOutFromToday(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const days       = Math.min(Number(req.query.days)  || 7,  90);
    const page       = Math.max(Number(req.query.page)  || 1,  1);
    const limit      = Math.min(Number(req.query.limit) || 50, 100);
    const q          = ((req.query.q as string) ?? '').trim();
    const dateFilter = ((req.query.date as string) ?? '').trim();

    const todayStr = todayLocalStr();
    const maxDate  = dateFilter || addDaysStr(days);
    const offset   = (page - 1) * limit;

    // 1. Query earnings_calendar from Supabase -- single fast query, no fan-out
    let calQuery = supabase
      .from('earnings_calendar')
      .select('symbol, report_date, name, fiscal_date_ending, estimated_eps, currency', { count: 'exact' })
      .gte('report_date', todayStr)
      .order('report_date', { ascending: true })
      .order('symbol',      { ascending: true });

    if (q) {
      calQuery = calQuery.or(`symbol.ilike.%${q}%,name.ilike.%${q}%`);
    }

    if (dateFilter) {
      calQuery = calQuery.eq('report_date', dateFilter).limit(500);
    } else {
      calQuery = calQuery.lte('report_date', maxDate).range(offset, offset + limit - 1);
    }

    const { data: calRows, count, error: calErr } = await calQuery;

    if (calErr) throw calErr;

    if (!calRows || calRows.length === 0) {
      return res.status(200).json({ success: true, rows: [], total: 0, page, totalPages: 1, cachedAt: new Date().toISOString() });
    }

    // 2. Enrich only the page's symbols (50 rows max -- very fast)
    const symbols    = [...new Set(calRows.map((r: { symbol: string }) => r.symbol))];
    const enrichMap  = await getEnrichMapForSymbols(symbols);
    const leapsSymbols = symbols.filter(s => s in enrichMap);
    const relVolMap  = leapsSymbols.length > 0 ? await getRelVolForSymbols(leapsSymbols) : {};

    // 3. Merge and compute
    const rows: AllEarningsRow[] = calRows.map((r: { symbol: string; report_date: string; name: string; fiscal_date_ending: string | null; estimated_eps: number | null; currency: string }) => {
      const daysOut      = daysOutFromToday(r.report_date);
      const e            = enrichMap[r.symbol] ?? null;
      const hv20         = e?.hv20 ?? null;
      const expectedMove = (hv20 != null && daysOut > 0)
        ? Math.round(hv20 * Math.sqrt(daysOut / 252) * 10) / 10
        : null;
      return {
        symbol:           r.symbol,
        name:             r.name,
        reportDate:       r.report_date,
        daysOut,
        fiscalDateEnding: r.fiscal_date_ending ?? '',
        estimatedEPS:     r.estimated_eps ?? null,
        currency:         r.currency ?? 'USD',
        price:            e?.price       ?? null,
        rsi:              e?.rsi         ?? null,
        ivRank:           e?.ivRank      ?? null,
        aiConsensus:      e?.aiConsensus ?? null,
        setupType:        e?.setupType   ?? null,
        relVol:           relVolMap[r.symbol] ?? null,
        expectedMove,
        isHighVolEarner:  expectedMove != null && expectedMove >= 10,
        epsBeatStreak:    e?.epsBeatStreak  ?? null,
        avgSurprisePct:   e?.avgSurprisePct ?? null,
      };
    });

    const total      = count ?? rows.length;
    const totalPages = dateFilter ? 1 : Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success:    true,
      rows,
      total,
      page,
      totalPages,
      cachedAt:   new Date().toISOString(),
    });

  } catch (err) {
    console.error('[earnings-all]', err);
    return res.status(502).json({ success: false, error: String(err) });
  }
}
