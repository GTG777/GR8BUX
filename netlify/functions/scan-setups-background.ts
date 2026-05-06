/**
 * Netlify Background Function — scan-setups-background
 *
 * Named with `-background` suffix for Netlify's 15-minute timeout.
 *
 * Pipeline:
 *  Tier 1 — Batch snapshot all ~120 S&P 500 representative tickers (Massive)
 *            Filter: abs(changePct) >= 1.5%  →  top 40 candidates
 *  Tier 2 — Fetch 30-day daily bars per candidate (Massive, 8 at a time)
 *            Compute: RSI-14, 20d avg volume, gap%, VWAP proxy
 *            Score 0-100 with rule-based formula
 *            Keep top 12 by score
 *  Tier 3 — Single Claude call to generate concise 'reason' text for each setup
 *            Write final batch to Supabase morning_setups table
 *
 * Triggered by:
 *  - intraday-scan-setups (scheduled, every 15 min market hours)
 *  - Manual: POST /.netlify/functions/scan-setups-background?secret=...
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// ── Constants ───────────────────────────────────────────────────────────────
const MASSIVE_BASE     = 'https://api.massive.com';
const BATCH_SNAPSHOT   = 200;   // tickers per Massive snapshot call
const BATCH_BARS       = 8;     // parallel daily-bars fetches
const TIER1_COUNT      = 50;    // candidates after change% filter
const TIER2_COUNT      = 15;    // setups after scoring
const FINAL_COUNT      = 12;    // rows written to DB (displayed in UI)
const BARS_LOOKBACK    = 30;    // days of daily OHLCV for RSI + vol avg

// ── Full S&P 500 Universe ────────────────────────────────────────────────────
const SP500_UNIVERSE = [
  // Information Technology
  'AAPL','MSFT','NVDA','AVGO','AMD','ORCL','CRM','ADBE','NOW','QCOM',
  'TXN','INTC','MU','AMAT','LRCX','KLAC','PANW','CRWD','FTNT','MRVL',
  'PLTR','CDNS','SNPS','APH','IT','CTSH','GLW','HPQ','HPE','CDW',
  'JNPR','NTAP','STX','WDC','KEYS','ANSS','TDY','TER','MCHP','NXPI',
  'SWKS','QRVO','MPWR','ON','ENPH','FSLR','GEN','PTC','ROP','TRMB',
  'ZBRA','FFIV','AKAM','JKHY','FIS','FI','PYPL','PAYX','ADP','EPAM',
  // Communication Services
  'META','GOOGL','GOOG','AMZN','NFLX','DIS','CMCSA','T','VZ','TMUS',
  'TTWO','EA','MTCH','WBD','PARA','NWSA','NWS','LYV','IPG','OMC',
  'FOX','FOXA',
  // Consumer Discretionary
  'TSLA','HD','MCD','NKE','LOW','BKNG','TGT','SBUX','TJX','ROST',
  'UBER','AMZN','ABNB','GM','F','ORLY','AZO','KMX','LEN','DHI',
  'PHM','NVR','LVS','WYNN','MGM','CZR','RCL','CCL','NCLH','HLT',
  'MAR','LVS','YUM','CMG','DRI','MKC','GPC','RL','TPR','DECK',
  'LULU','BBY','DG','DLTR','ULTA','APTV','BWA','LKQ','MHK',
  // Consumer Staples
  'WMT','COST','PG','KO','PEP','PM','MO','MDLZ','CL','GIS',
  'K','KDP','KHC','HSY','SJM','CPB','HRL','TSN','ADM','BG',
  'MOS','CF','FMC','CAG','KVUE','CHD','CLX','EL',
  // Energy
  'XOM','CVX','COP','EOG','SLB','MPC','VLO','OXY','PSX','HES',
  'BKR','HAL','DVN','FANG','APA','MRO','TRGP','OKE','WMB','KMI',
  'NRG','VST','CEG',
  // Financials
  'JPM','BAC','WFC','GS','MS','C','BLK','SCHW','AXP','V',
  'MA','COF','USB','PNC','TFC','FI','SPGI','MCO','ICE','CME',
  'CBOE','NDAQ','BX','BK','STT','NTRS','RF','HBAN','KEY','CFG',
  'MTB','FITB','CMA','ZION','L','AIG','MET','PRU','AFL','ALL',
  'PGR','CB','TRV','HIG','CINF','GL','AJG','MMC','AON','WTW',
  'BEN','IVZ','TROW','AMG','FDS','MSCI','RJF','AMP','PFG','LNC',
  'ACGL','EG','AIZ','SYF','DFS','PAYC','CPAY','FLT','BR','PNC',
  'BRK.B',
  // Healthcare
  'UNH','JNJ','LLY','ABBV','MRK','PFE','AMGN','GILD','ISRG','BMY',
  'VRTX','REGN','ZBH','EW','DXCM','MDT','BSX','BDX','SYK','ABT',
  'DHR','TMO','IQV','MTD','A','IDXX','PODD','HOLX','BAX','CAH',
  'MCK','COR','CVS','CI','ELV','HUM','MOH','CNC','HSIC','TECH',
  'BIIB','MRNA','INCY','RVTY','CTLT','VTRS','ZTS','ALGN','DXCM',
  'PKG','RMD','STE','TFX','WST','WAT','CRL',
  // Industrials
  'CAT','HON','UPS','BA','RTX','LMT','GE','DE','EMR','ETN',
  'FDX','NSC','CSX','URI','MMM','ITW','PH','ROK','GD','NOC',
  'HII','TXT','LHX','HWM','TDG','CARR','OTIS','DAY','AXON','PWR',
  'HUBB','RRX','AME','LDOS','SAIC','CPRT','CTAS','FAST','GWW','WAB',
  'JBHT','CHRW','EXPD','XPO','J','JCI','IR','TRANE','FTV','ROL',
  'RSG','WM','AOS','MAS','SNA','SWK','ALLE','BALL','PKG','IP',
  'AVY','SEE','SON','BLL','WRK','BLDR','MLM','VMC','NUE','STLD',
  'ROP','VRSK','NDAQ','ODFL','PCAR','CMI','GNRC',
  // Materials
  'LIN','APD','ECL','SHW','NEM','FCX','AA','CLF','ALB','CE',
  'DOW','DD','LYB','PPG','RPM','EMN','IFF','FMC','MOS','NUE',
  'STLD','WRB',
  // Real Estate
  'AMT','PLD','EQIX','CCI','PSA','WELL','SPG','O','DLR','EQR',
  'AVB','ESS','MAA','UDR','CPT','ARE','BXP','VTR','PEAK','HST',
  'REG','FRT','KIM','NNN','VICI','INVH','SUI','EXR','CUBE','LSI',
  'IRM','SBAC','AMT','CSGP',
  // Utilities
  'NEE','DUK','SO','AEP','EXC','XEL','SRE','D','PCG','EIX',
  'ETR','PPL','ES','WEC','CMS','LNT','EVRG','NI','PNW','AES',
  'NRG','AEE','CNP','PEG','FE','DTE','AWK',
];

// ── Types ───────────────────────────────────────────────────────────────────
interface MassiveSnapshot {
  ticker: string;
  day?: { c: number; h: number; l: number; o: number; v: number; vw?: number };
  prevDay?: { c: number; h: number; l: number; o: number; v: number };
  todaysChange?: number;
  todaysChangePerc?: number;
}

interface MassiveBar {
  c: number; h: number; l: number; o: number; t: number; v: number; vw?: number;
}

interface ScoredSetup {
  symbol: string;
  company: string;
  price: number;
  changePct: number;
  gapPct: number;
  volume: number;
  avgVolume20d: number;
  rsi: number;
  setupType: string;
  catalyst: string;
  catalystDetail: string;
  entry: number;
  stop: number;
  target: number;
  rr: string;
  score: number;
  reason: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

function todayStr(): string { return new Date().toISOString().slice(0, 10); }

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function massiveUrl(path: string, params: Record<string, string | number> = {}): string {
  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) throw new Error('MASSIVE_API_KEY not set');
  const url = new URL(`${MASSIVE_BASE}${path}`);
  url.searchParams.set('apiKey', apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return url.toString();
}

async function massiveGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = massiveUrl(path, params);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Massive ${res.status} at ${path}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function computeRSI14(bars: MassiveBar[]): number {
  if (bars.length < 15) return 50;
  const closes = bars.slice(-15).map(b => b.c);
  let gains = 0, losses = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

function scoreSetup(
  snap: MassiveSnapshot,
  bars: MassiveBar[],
  rsi: number,
  avgVol20: number,
  gapPct: number,
  vixLevel: number,
): number {
  let score = 0;

  // 1. Price momentum (0-25)
  const changePct = Math.abs(snap.todaysChangePerc ?? 0);
  if (changePct >= 4)   score += 25;
  else if (changePct >= 3)   score += 20;
  else if (changePct >= 2)   score += 14;
  else if (changePct >= 1.5) score += 8;

  // 2. Volume spike vs 20d avg (0-30)
  const todayVol = snap.day?.v ?? 0;
  const volRatio = avgVol20 > 0 ? todayVol / avgVol20 : 0;
  if (volRatio >= 3.0)  score += 30;
  else if (volRatio >= 2.0)  score += 23;
  else if (volRatio >= 1.5)  score += 15;
  else if (volRatio >= 1.2)  score += 8;

  // 3. RSI quality (0-25)
  // Exception: extreme movers (≥8%) always get full momentum credit regardless of RSI
  if (changePct >= 8) {
    score += 25; // explosive move — RSI being high is expected, not a penalty
  } else if (rsi >= 55 && rsi <= 70)       score += 25; // sweet spot: momentum not overbought
  else if (rsi >= 45 && rsi < 55)   score += 20; // pullback recovery
  else if (rsi >= 40 && rsi < 45)   score += 12; // oversold bounce
  else if (rsi > 70  && rsi <= 80)  score += 10; // extended but running

  // 4. Gap quality (0-20)
  if (gapPct >= 2.5)      score += 20;
  else if (gapPct >= 1.5) score += 14;
  else if (gapPct >= 0.8) score += 8;
  else if (gapPct >= 0.3) score += 3;

  // VIX risk penalty
  if (vixLevel > 30) score = Math.round(score * 0.70);
  else if (vixLevel > 25) score = Math.round(score * 0.85);

  return Math.min(score, 100);
}

function classifySetupType(changePct: number, rsi: number, gapPct: number, volRatio: number): string {
  if (gapPct >= 1.5 && changePct > 0 && volRatio > 1.5) return 'Gap + Hold';
  if (rsi >= 58 && changePct > 1.5) return 'Breakout';
  if (rsi >= 45 && rsi < 58 && gapPct > 0.5) return 'VWAP Reclaim';
  if (rsi >= 40 && rsi < 55 && changePct > 0) return 'Pullback';
  return 'Breakout';
}

function classifyCatalyst(gapPct: number, volRatio: number, changePct: number): { catalyst: string; detail: string } {
  if (volRatio >= 3.0 && gapPct >= 2)
    return { catalyst: 'Volume Spike', detail: `${volRatio.toFixed(1)}x avg volume with ${gapPct.toFixed(1)}% gap up` };
  if (gapPct >= 2.0)
    return { catalyst: 'Volume Spike', detail: `${gapPct.toFixed(1)}% gap suggests news catalyst or analyst action` };
  if (volRatio >= 2.5)
    return { catalyst: 'Volume Spike', detail: `${volRatio.toFixed(1)}x average volume — unusual institutional activity` };
  if (Math.abs(changePct) >= 2)
    return { catalyst: 'Technical', detail: `Strong ${changePct > 0 ? 'bullish' : 'bearish'} momentum on elevated volume` };
  return { catalyst: 'Technical', detail: 'Confluence of momentum and volume signals' };
}

function computeLevels(price: number, low: number, gapPct: number) {
  // Entry: current price
  const entry = parseFloat(price.toFixed(2));
  // Stop: below today's low, or 2% below entry if low is too close
  const stopFromLow = parseFloat((low * 0.995).toFixed(2));
  const stopFromPct = parseFloat((entry * 0.98).toFixed(2));
  const stop = Math.max(stopFromLow, stopFromPct) < entry
    ? Math.max(stopFromLow, stopFromPct)
    : parseFloat((entry * 0.97).toFixed(2));
  const risk = entry - stop;
  // Target: 2.5x risk
  const target = parseFloat((entry + risk * 2.5).toFixed(2));
  const rrNum = risk > 0 ? (risk * 2.5 / risk).toFixed(1) : '2.5';
  return { entry, stop, target, rr: `1:${rrNum}` };
}

// ── AI Reason generation ─────────────────────────────────────────────────────
async function generateReasons(setups: ScoredSetup[]): Promise<Map<string, string>> {
  const reasons = new Map<string, string>();
  if (setups.length === 0) return reasons;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const setupSummaries = setups.map(s =>
    `${s.symbol}: ${s.setupType}, RSI ${s.rsi}, +${s.changePct.toFixed(1)}% today, ` +
    `${s.rsi >= 55 ? 'momentum zone' : 'pullback zone'}, vol ${(s.volume / s.avgVolume20d).toFixed(1)}x avg, ` +
    `gap ${s.gapPct.toFixed(1)}%, score ${s.score}/100`
  ).join('\n');

  const prompt = `You are a concise stock trading analyst. For each setup below, write ONE sentence (max 20 words) explaining WHY it's a trade candidate today. Be specific — mention the key factor driving the signal (gap, volume surge, momentum, pullback to support, etc.). Return ONLY a JSON object: {"SYMBOL": "reason", ...}

Setups:
${setupSummaries}`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content.find(c => c.type === 'text')?.text ?? '{}';
    // Extract JSON from response (Claude sometimes wraps in ```json blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
      for (const [sym, reason] of Object.entries(parsed)) {
        reasons.set(sym.toUpperCase(), reason);
      }
    }
  } catch (err) {
    console.error('[scan-setups] Claude reason generation failed:', err instanceof Error ? err.message : err);
    // Fall back to template reasons
  }

  return reasons;
}

// ── Main handler ─────────────────────────────────────────────────────────────
const handler: Handler = async (event) => {
  // Auth check
  const secret = process.env.CRON_SECRET;
  const provided =
    event.queryStringParameters?.secret ||
    event.headers?.['x-cron-secret'];
  if (secret && provided !== secret) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  console.log('[scan-setups] Starting scan…');

  try {
    // ── Tier 1: Batch snapshots ───────────────────────────────────────────
    const allSnapshots: MassiveSnapshot[] = [];
    for (let i = 0; i < SP500_UNIVERSE.length; i += BATCH_SNAPSHOT) {
      const batch = SP500_UNIVERSE.slice(i, i + BATCH_SNAPSHOT);
      try {
        const data = await massiveGet<{ tickers: MassiveSnapshot[] }>(
          '/v2/snapshot/locale/us/markets/stocks/tickers',
          { tickers: batch.join(',') },
        );
        allSnapshots.push(...(data.tickers ?? []));
      } catch (err) {
        console.error('[scan-setups] Snapshot batch error:', err instanceof Error ? err.message : err);
      }
      if (i + BATCH_SNAPSHOT < SP500_UNIVERSE.length) await sleep(200);
    }

    console.log(`[scan-setups] Got ${allSnapshots.length} snapshots`);

    // Get VIX for risk adjustment — try to fetch it
    let vixLevel = 18; // default neutral
    try {
      const vixData = await massiveGet<{ results?: Array<{ value?: number; session?: { close?: number } }> }>(
        '/v3/snapshot/indices',
        { 'ticker.any_of': 'I:VIX', limit: 1 },
      );
      const vixResult = vixData.results?.[0];
      vixLevel = vixResult?.value ?? vixResult?.session?.close ?? 18;
    } catch { /* non-fatal */ }

    // Filter: abs(changePct) >= 1.5% AND has today's data
    const candidates = allSnapshots
      .filter(s => s.day?.c && s.day.c > 5) // price > $5
      .filter(s => Math.abs(s.todaysChangePerc ?? 0) >= 1.5)
      .sort((a, b) => Math.abs(b.todaysChangePerc ?? 0) - Math.abs(a.todaysChangePerc ?? 0))
      .slice(0, TIER1_COUNT);

    console.log(`[scan-setups] ${candidates.length} candidates after Tier 1 filter`);

    // ── Tier 2: Fetch bars, score, rank ──────────────────────────────────
    const scoredSetups: ScoredSetup[] = [];
    const today    = todayStr();
    const fromDate = daysAgoStr(BARS_LOOKBACK + 10); // extra days for weekends

    for (let i = 0; i < candidates.length; i += BATCH_BARS) {
      const batch = candidates.slice(i, i + BATCH_BARS);
      await Promise.all(batch.map(async (snap) => {
        try {
          const data = await massiveGet<{ results?: MassiveBar[] }>(
            `/v2/aggs/ticker/${encodeURIComponent(snap.ticker)}/range/1/day/${fromDate}/${today}`,
            { adjusted: 1, sort: 'asc', limit: BARS_LOOKBACK + 15 },
          );
          const bars = data.results ?? [];
          if (bars.length < 10) return; // not enough history

          const rsi = computeRSI14(bars);
          const recentBars = bars.slice(-20);
          const avgVol20 = recentBars.length > 0
            ? Math.round(recentBars.reduce((s, b) => s + b.v, 0) / recentBars.length)
            : 0;

          const currentPrice = snap.day?.c ?? 0;
          const prevClose    = snap.prevDay?.c ?? 0;
          const todayOpen    = snap.day?.o ?? currentPrice;
          const todayLow     = snap.day?.l ?? currentPrice * 0.97;
          const changePct    = snap.todaysChangePerc ?? 0;
          const gapPct       = prevClose > 0
            ? parseFloat((((todayOpen - prevClose) / prevClose) * 100).toFixed(2))
            : 0;
          const volRatio = avgVol20 > 0 ? (snap.day?.v ?? 0) / avgVol20 : 0;

          const score = scoreSetup(snap, bars, rsi, avgVol20, gapPct, vixLevel);
          const setupType = classifySetupType(changePct, rsi, gapPct, volRatio);
          const { catalyst, detail: catalystDetail } = classifyCatalyst(gapPct, volRatio, changePct);
          const { entry, stop, target, rr } = computeLevels(currentPrice, todayLow, gapPct);

          scoredSetups.push({
            symbol:         snap.ticker,
            company:        snap.ticker, // will be overridden by name lookup if available
            price:          currentPrice,
            changePct,
            gapPct,
            volume:         snap.day?.v ?? 0,
            avgVolume20d:   avgVol20,
            rsi,
            setupType,
            catalyst,
            catalystDetail,
            entry,
            stop,
            target,
            rr,
            score,
            reason:         '',
          });
        } catch (err) {
          console.error(`[scan-setups] Bars error for ${snap.ticker}:`, err instanceof Error ? err.message : err);
        }
      }));
      if (i + BATCH_BARS < candidates.length) await sleep(300);
    }

    // Sort by score descending, take top FINAL_COUNT
    scoredSetups.sort((a, b) => b.score - a.score);
    const topSetups = scoredSetups.slice(0, TIER2_COUNT);

    console.log(`[scan-setups] Top setups by score: ${topSetups.map(s => `${s.symbol}(${s.score})`).join(', ')}`);

    // ── Tier 3: AI reason generation ─────────────────────────────────────
    const reasons = await generateReasons(topSetups);
    for (const setup of topSetups) {
      setup.reason = reasons.get(setup.symbol) ??
        `${setup.setupType} setup with ${setup.rsi >= 55 ? 'bullish' : 'recovering'} RSI-14 (${setup.rsi}) on ${((setup.volume / setup.avgVolume20d)).toFixed(1)}x average volume.`;
    }

    const finalSetups = topSetups.slice(0, FINAL_COUNT);

    // ── Write to Supabase ─────────────────────────────────────────────────
    const batchId = crypto.randomUUID();
    const scannedAt = new Date().toISOString();

    const rows = finalSetups.map((s, i) => ({
      batch_id:        batchId,
      rank:            i + 1,
      symbol:          s.symbol,
      company:         s.company,
      price:           s.price,
      change_pct:      s.changePct,
      gap_pct:         s.gapPct,
      volume:          s.volume,
      avg_volume_20d:  s.avgVolume20d,
      rsi:             s.rsi,
      catalyst:        s.catalyst,
      catalyst_detail: s.catalystDetail,
      setup_type:      s.setupType,
      entry:           s.entry,
      stop:            s.stop,
      target:          s.target,
      rr:              s.rr,
      score:           s.score,
      reason:          s.reason,
      scanned_at:      scannedAt,
    }));

    const { error: insertErr } = await supabase.from('morning_setups').insert(rows);
    if (insertErr) throw insertErr;

    // Clean up old batches (keep last 48 hours of history)
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await supabase.from('morning_setups').delete().lt('scanned_at', cutoff);

    console.log(`[scan-setups] ✅ Wrote ${rows.length} setups, batch ${batchId}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, count: rows.length, batchId, scannedAt }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[scan-setups] Fatal error:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
