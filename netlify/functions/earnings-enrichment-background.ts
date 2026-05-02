/**
 * Netlify Background Function — earnings-enrichment-background
 *
 * Named with `-background` suffix so Netlify gives it a 15-minute timeout
 * instead of the 26-second limit on regular functions.
 *
 * Triggered by:
 *  - nightly-refresh-earnings-enrichment (scheduled Netlify function)
 *  - Manual: GET/POST /.netlify/functions/earnings-enrichment-background?secret=...
 *
 * Populates `earnings_enrichment` for all symbols in AV EARNINGS_CALENDAR
 * (next 45 days) with:
 *  - hv20              : 20-day historical vol from Massive daily candles (24h TTL)
 *  - eps_beat_streak   : consecutive EPS beats from AV EARNINGS (90-day TTL)
 *  - avg_surprise_pct  : avg absolute EPS surprise % last 8Q (90-day TTL)
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// ── Constants ──────────────────────────────────────────────────────────────
const MASSIVE_BASE    = 'https://api.massive.com';
const HV20_TTL_MS     = 24 * 60 * 60 * 1000;        // 24 hours
const STREAK_TTL_MS   = 90 * 24 * 60 * 60 * 1000;   // 90 days
const BATCH_HV20      = 8;   // parallel Massive calls
const BATCH_STREAK    = 5;   // parallel Yahoo Finance calls (no rate limit)
const CALENDAR_DAYS   = 45;  // look-ahead window

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

// ── Helpers ────────────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

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

async function processBatch<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return results;
}

// ── HV20 from Massive daily candles ───────────────────────────────────────
async function fetchHv20(symbol: string, massiveKey: string): Promise<number | null> {
  try {
    const from = daysAgoStr(40);
    const to   = todayStr();
    const url  = `${MASSIVE_BASE}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50&apiKey=${massiveKey}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as { results?: Array<{ c: number }> };
    const closes = (data.results ?? []).map(b => b.c).filter(Boolean);
    if (closes.length < 22) return null;
    const slice   = closes.slice(-21);
    const returns = slice.slice(1).map((c, i) => Math.log(c / slice[i]));
    const mean    = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    return parseFloat((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(1));
  } catch {
    return null;
  }
}

// ── Beat streak from Yahoo Finance earningsHistory ────────────────────────
// No API key required. Returns last 4 quarters with actual/estimate/surprise.
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
    // Yahoo returns oldest-first; reverse to get most-recent first
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

// ── Handler ────────────────────────────────────────────────────────────────
const handler: Handler = async (event) => {
  // Auth
  const secret = event.queryStringParameters?.secret ?? event.headers['x-cron-secret'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const massiveKey = process.env.MASSIVE_API_KEY ?? '';
  const sbUrl      = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const sbKey      = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!massiveKey || !sbUrl || !sbKey) {
    const missing = [
      !massiveKey && 'MASSIVE_API_KEY',
      !sbUrl      && 'NEXT_PUBLIC_SUPABASE_URL',
      !sbKey      && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean).join(', ');
    return { statusCode: 500, body: JSON.stringify({ error: `Missing env vars: ${missing}` }) };
  }

  const supabase = createClient(sbUrl, sbKey);
  const start    = Date.now();

  // ── 1. Fetch upcoming earners from Nasdaq earnings calendar ─────────
  // Fan out across weekday dates for the next CALENDAR_DAYS days
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const dates: string[] = [];
  for (let i = 0; i <= CALENDAR_DAYS; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dates.push(d.toISOString().slice(0, 10));
  }

  const symbolSet = new Set<string>();
  await processBatch(dates, 10, async (dateStr) => {
    try {
      const res = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${dateStr}`, {
        headers: NASDAQ_HEADERS, signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const json = await res.json() as { data?: { rows?: Array<{ symbol?: string }> | null } };
      for (const r of json?.data?.rows ?? []) {
        const sym = r?.symbol?.trim().toUpperCase();
        if (sym) symbolSet.add(sym);
      }
    } catch { /* skip day on error */ }
  });

  const allSymbols = [...symbolSet];
  console.log(`[earnings-enrichment-background] ${allSymbols.length} symbols for next ${CALENDAR_DAYS}d`);

  // ── 2. Load existing enrichment timestamps ────────────────────────────
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

  // ── 3. HV20: refresh stale symbols ───────────────────────────────────
  const hv20Stale = allSymbols.filter(sym => {
    const e = existingMap.get(sym);
    return !e?.hv20At || (now - e.hv20At.getTime() > HV20_TTL_MS);
  });
  console.log(`[earnings-enrichment-background] HV20 stale: ${hv20Stale.length}`);

  let hv20Updated = 0;
  const hv20Results = await processBatch(hv20Stale, BATCH_HV20, async (sym) => ({
    sym,
    hv20: await fetchHv20(sym, massiveKey),
  }));

  const hv20Upserts = hv20Results
    .filter(r => r.hv20 != null)
    .map(r => ({
      symbol:            r.sym,
      hv20:              r.hv20,
      hv20_refreshed_at: new Date().toISOString(),
      refreshed_at:      new Date().toISOString(),
    }));

  if (hv20Upserts.length > 0) {
    const { error } = await supabase.from('earnings_enrichment').upsert(hv20Upserts, { onConflict: 'symbol' });
    if (error) console.error('[earnings-enrichment-background] HV20 upsert error:', error.message);
    else hv20Updated = hv20Upserts.length;
  }

  // ── 4. Beat streak: refresh stale symbols in parallel (Yahoo Finance) ─
  const streakStale = allSymbols.filter(sym => {
    const e = existingMap.get(sym);
    return !e?.streakAt || (now - e.streakAt.getTime() > STREAK_TTL_MS);
  });
  console.log(`[earnings-enrichment-background] Streak stale: ${streakStale.length}`);

  let streakUpdated = 0;
  const streakResults = await processBatch(streakStale, BATCH_STREAK, async (sym) => ({
    sym,
    result: await fetchBeatStreak(sym),
  }));

  const streakUpserts = streakResults
    .filter(r => r.result != null)
    .map(r => ({
      symbol:              r.sym,
      eps_beat_streak:     r.result!.epsBeatStreak,
      avg_surprise_pct:    r.result!.avgSurprisePct,
      streak_refreshed_at: new Date().toISOString(),
      refreshed_at:        new Date().toISOString(),
    }));

  if (streakUpserts.length > 0) {
    const { error } = await supabase.from('earnings_enrichment').upsert(streakUpserts, { onConflict: 'symbol' });
    if (error) console.error('[earnings-enrichment-background] streak upsert error:', error.message);
    else streakUpdated = streakUpserts.length;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[earnings-enrichment-background] Done. HV20: ${hv20Updated}, Streak: ${streakUpdated}, ${elapsed}s`);

  return {
    statusCode: 202,
    body: JSON.stringify({
      success:      true,
      symbols:      allSymbols.length,
      hv20Updated,
      streakUpdated,
      elapsed:      `${elapsed}s`,
    }),
  };
};

export { handler };
