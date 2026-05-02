/**
 * /api/cron/refresh-earnings-enrichment
 *
 * Nightly job that populates `earnings_enrichment` for ALL stocks that
 * appear in the Alpha Vantage EARNINGS_CALENDAR (next 45 days).
 *
 * Per symbol it computes:
 *  - hv20  : 20-day historical volatility from Massive daily candles
 *            (refreshed every 24 hours per symbol)
 *  - eps_beat_streak / avg_surprise_pct : from AV EARNINGS per-symbol endpoint
 *            (refreshed every 90 days — quarterly data barely changes)
 *
 * Rate limits:
 *  - Massive candles: batches of 8 in parallel, no hard rate limit
 *  - Alpha Vantage EARNINGS: 1 call/sec (safe for paid tiers ≥75 calls/min)
 *    Limited to MAX_STREAK_PER_RUN symbols per run to stay within free tier
 *    (25 calls/day). Over multiple nights the full list gets covered.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { getAggBars, todayDateStr, daysAgoDateStr } from '@/lib/massive';

const CRON_SECRET        = process.env.CRON_SECRET;
const HV20_TTL_MS        = 24 * 60 * 60 * 1000;
const STREAK_TTL_MS      = 90 * 24 * 60 * 60 * 1000;
const BATCH_HV20         = 8;
const BATCH_STREAK       = 5;  // parallel Yahoo Finance calls

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const NASDAQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nasdaq.com',
  'Referer': 'https://www.nasdaq.com/',
};

// ── HV20 from daily candles ────────────────────────────────────────────────
async function fetchHv20(symbol: string): Promise<number | null> {
  try {
    const bars = await getAggBars(
      symbol, 1, 'day',
      daysAgoDateStr(40), todayDateStr(),
      { sort: 'asc', limit: 50 },
    );
    const closes = bars.map(b => b.c).filter(Boolean);
    if (closes.length < 22) return null;
    const slice = closes.slice(-21);
    const returns = slice.slice(1).map((c, i) => Math.log(c / slice[i]));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    return parseFloat((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(1));
  } catch {
    return null;
  }
}

// ── Beat streak from Yahoo Finance ──────────────────────────────────────
async function fetchBeatStreak(
  symbol: string,
): Promise<{ epsBeatStreak: number; avgSurprisePct: number } | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=earningsHistory`;
    const res = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as {
      quoteSummary?: {
        result?: Array<{
          earningsHistory?: {
            history?: Array<{ surprisePercent?: { raw: number } }>;
          };
        }>;
      };
    };
    const history = data?.quoteSummary?.result?.[0]?.earningsHistory?.history ?? [];
    const last8 = [...history].reverse().slice(0, 8);
    if (last8.length === 0) return null;

    let streak = 0;
    for (const q of last8) {
      const s = q.surprisePercent?.raw;
      if (s != null && isFinite(s) && s > 0) streak++;
      else break;
    }
    const valids = last8
      .map(q => q.surprisePercent?.raw)
      .filter((v): v is number => v != null && isFinite(v))
      .map(Math.abs);
    const avg = valids.length > 0
      ? Math.round(valids.reduce((a, b) => a + b, 0) / valids.length * 10) / 10
      : 0;

    return { epsBeatStreak: streak, avgSurprisePct: avg };
  } catch {
    return null;
  }
}

// ── Batch helper ──────────────────────────────────────────────────────────
async function processBatch<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end();
  }
  if (CRON_SECRET) {
    const provided = req.headers['x-cron-secret'] ?? req.query.secret;
    if (provided !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  const startTime = Date.now();

  try {
    // ── 1. Fetch upcoming symbols from Nasdaq calendar ───────────────────
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = 45;
    const dates: string[] = [];
    for (let i = 0; i <= cutoff; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) dates.push(d.toISOString().slice(0, 10));
    }
    const symbolSet = new Set<string>();
    await processBatch(dates, 10, async (dateStr) => {
      try {
        const res2 = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${dateStr}`, {
          headers: NASDAQ_HEADERS, signal: AbortSignal.timeout(8000),
        });
        if (!res2.ok) return;
        const json = await res2.json() as { data?: { rows?: Array<{ symbol?: string }> | null } };
        for (const r of json?.data?.rows ?? []) {
          const sym = r?.symbol?.trim().toUpperCase();
          if (sym) symbolSet.add(sym);
        }
      } catch { /* skip */ }
    });
    const allSymbols = [...symbolSet];

    // ── 2. Load existing enrichment from Supabase ────────────────────────
    const { data: existing } = await supabase
      .from('earnings_enrichment')
      .select('symbol, hv20_refreshed_at, streak_refreshed_at');

    const existingMap = new Map<string, { hv20At: Date | null; streakAt: Date | null }>();
    for (const row of existing ?? []) {
      existingMap.set(row.symbol, {
        hv20At:   row.hv20_refreshed_at   ? new Date(row.hv20_refreshed_at)   : null,
        streakAt: row.streak_refreshed_at ? new Date(row.streak_refreshed_at) : null,
      });
    }

    const now = Date.now();

    // ── 3. HV20: refresh symbols where stale or missing ──────────────────
    const hv20Stale = allSymbols.filter(sym => {
      const e = existingMap.get(sym);
      return !e?.hv20At || (now - e.hv20At.getTime() > HV20_TTL_MS);
    });

    let hv20Updated = 0;
    const hv20Results = await processBatch(hv20Stale, BATCH_HV20, async (sym) => {
      const hv20 = await fetchHv20(sym);
      return { sym, hv20 };
    });

    // Upsert HV20 results
    const hv20Upserts = hv20Results
      .filter(r => r.hv20 != null)
      .map(r => ({
        symbol: r.sym,
        hv20: r.hv20,
        hv20_refreshed_at: new Date().toISOString(),
        refreshed_at: new Date().toISOString(),
      }));
    if (hv20Upserts.length > 0) {
      await supabase.from('earnings_enrichment').upsert(hv20Upserts, { onConflict: 'symbol' });
      hv20Updated = hv20Upserts.length;
    }

    // ── 4. Beat streak: refresh stale symbols via Yahoo Finance ─────────
    const streakStale = allSymbols.filter(sym => {
      const e = existingMap.get(sym);
      return !e?.streakAt || (now - e.streakAt.getTime() > STREAK_TTL_MS);
    });

    let streakUpdated = 0;
    const streakResults = await processBatch(streakStale, BATCH_STREAK, async (sym) => ({
      sym, result: await fetchBeatStreak(sym),
    }));
    const streakUpserts = streakResults
      .filter(r => r.result != null)
      .map(r => ({
        symbol: r.sym,
        eps_beat_streak:   r.result!.epsBeatStreak,
        avg_surprise_pct:  r.result!.avgSurprisePct,
        streak_refreshed_at: new Date().toISOString(),
        refreshed_at: new Date().toISOString(),
      }));
    if (streakUpserts.length > 0) {
      await supabase.from('earnings_enrichment').upsert(streakUpserts, { onConflict: 'symbol' });
      streakUpdated = streakUpserts.length;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[refresh-earnings-enrichment] ${allSymbols.length} symbols | HV20 updated: ${hv20Updated} | Streak updated: ${streakUpdated} | ${elapsed}s`);

    return res.status(200).json({
      success: true,
      symbols: allSymbols.length,
      hv20Updated,
      streakUpdated,
      streakRemaining: Math.max(0, streakStale.length - streakUpdated),
      elapsed: `${elapsed}s`,
    });
  } catch (err) {
    console.error('[refresh-earnings-enrichment]', err);
    return res.status(500).json({ error: String(err) });
  }
}
