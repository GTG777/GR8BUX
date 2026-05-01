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
const HV20_TTL_MS        = 24 * 60 * 60 * 1000;   // 24 hours
const STREAK_TTL_MS      = 90 * 24 * 60 * 60 * 1000; // 90 days
const BATCH_HV20         = 8;   // parallel Massive calls
const MAX_STREAK_PER_RUN = 20;  // AV EARNINGS calls per run (free tier: 25/day)
const AV_CALL_DELAY_MS   = 1200; // ~1 call/sec for AV

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

// ── Beat streak from AV EARNINGS endpoint ─────────────────────────────────
async function fetchBeatStreak(
  symbol: string,
  avKey: string,
): Promise<{ epsBeatStreak: number; avgSurprisePct: number } | null> {
  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${encodeURIComponent(symbol)}&apikey=${avKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as {
      quarterlyEarnings?: Array<{ surprisePercentage: string }>;
    };
    const last8 = (data.quarterlyEarnings ?? []).slice(0, 8);
    if (last8.length === 0) return null;

    let streak = 0;
    for (const q of last8) {
      const s = parseFloat(q.surprisePercentage ?? 'NaN');
      if (!isNaN(s) && isFinite(s) && s > 0) streak++;
      else break;
    }
    const valids = last8
      .map(q => Math.abs(parseFloat(q.surprisePercentage ?? 'NaN')))
      .filter(v => !isNaN(v) && isFinite(v));
    const avg = valids.length > 0
      ? Math.round(valids.reduce((a, b) => a + b, 0) / valids.length * 10) / 10
      : 0;

    return { epsBeatStreak: streak, avgSurprisePct: avg };
  } catch {
    return null;
  }
}

// ── CSV parser ─────────────────────────────────────────────────────────────
function parseCSV(csv: string): Array<Record<string, string>> {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    return obj;
  });
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

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
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

  const avKey = process.env.ALPHAVANTAGE_API_KEY ?? '';
  if (!avKey) return res.status(500).json({ error: 'ALPHAVANTAGE_API_KEY not configured' });

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  const startTime = Date.now();

  try {
    // ── 1. Fetch upcoming symbols from AV EARNINGS_CALENDAR ─────────────
    const calUrl = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${avKey}`;
    const calRes = await fetch(calUrl, { signal: AbortSignal.timeout(12_000) });
    if (!calRes.ok) throw new Error(`AV calendar ${calRes.status}`);
    const csv = await calRes.text();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = 45; // only care about next 45 days

    const symbolSet = new Set<string>();
    for (const r of parseCSV(csv)) {
      const sym = (r['symbol'] ?? '').trim().toUpperCase();
      const rd  = (r['reportDate'] ?? '').trim();
      if (!sym || !rd) continue;
      const daysOut = Math.floor((new Date(rd + 'T00:00:00').getTime() - today.getTime()) / 86_400_000);
      if (daysOut >= 0 && daysOut <= cutoff) symbolSet.add(sym);
    }
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

    // ── 4. Beat streak: refresh up to MAX_STREAK_PER_RUN stale symbols ──
    const streakStale = allSymbols
      .filter(sym => {
        const e = existingMap.get(sym);
        return !e?.streakAt || (now - e.streakAt.getTime() > STREAK_TTL_MS);
      })
      .slice(0, MAX_STREAK_PER_RUN);

    let streakUpdated = 0;
    for (const sym of streakStale) {
      const result = await fetchBeatStreak(sym, avKey);
      if (result) {
        await supabase.from('earnings_enrichment').upsert({
          symbol: sym,
          eps_beat_streak:   result.epsBeatStreak,
          avg_surprise_pct:  result.avgSurprisePct,
          streak_refreshed_at: new Date().toISOString(),
          refreshed_at: new Date().toISOString(),
        }, { onConflict: 'symbol' });
        streakUpdated++;
      }
      await sleep(AV_CALL_DELAY_MS);
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
