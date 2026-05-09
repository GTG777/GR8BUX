/**
 * Netlify Background Function — scan-onwatch-background
 *
 * "On Watch" scanner: merges earnings catalysts + unusual volume surges.
 * Runs every 15 min during market hours via intraday-scan-onwatch.
 *
 * Pipeline:
 *  Tier 1 — Load today's + tomorrow's earnings from earnings_calendar (Supabase)
 *            Snapshot all S&P 500 tickers (Massive) to find vol surges (3x+ avg)
 *            Merge: earnings tickers + vol-surge-only tickers → candidates
 *
 *  Tier 2 — Fetch 30d daily bars for top 60 candidates
 *            Compute: RSI-14, 20d avg vol, gap%, NR7 flag, vol ratio
 *            Load earnings_enrichment data (hv20, eps_beat_streak, avg_surprise_pct)
 *            Score 0-100 with combined earnings + volume formula
 *            Keep top 15 with score ≥ 20
 *
 *  Tier 3 — OpenAI generates catalyst-aware 1-sentence reason for each
 *            Write top 12 to on_watch_setups table with new batch_id
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { extractJsonString, generateText, getDefaultOpenAIModel } from '../../src/lib/openaiResponses';

// ── Constants ────────────────────────────────────────────────────────────────
const MASSIVE_BASE    = 'https://api.massive.com';
const BATCH_SNAPSHOT  = 200;
const BATCH_BARS      = 8;
const TIER1_COUNT     = 80;   // candidates after merge (S&P 500 earners sorted first)
const TIER2_COUNT     = 15;   // after scoring
const FINAL_COUNT     = 12;   // written to DB
const BARS_LOOKBACK   = 30;
const VOL_SURGE_3X    = 3.0;  // high-conviction volume surge
const VOL_SURGE_2X    = 2.0;  // moderate volume surge

// ── Full S&P 500 Universe (same as scan-setups-background) ───────────────────
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
  'UBER','ABNB','GM','F','ORLY','AZO','KMX','LEN','DHI',
  'PHM','NVR','LVS','WYNN','MGM','CZR','RCL','CCL','NCLH','HLT',
  'MAR','YUM','CMG','DRI','MKC','GPC','RL','TPR','DECK',
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
  'MA','COF','USB','PNC','TFC','SPGI','MCO','ICE','CME',
  'CBOE','NDAQ','BX','BK','STT','NTRS','RF','HBAN','KEY','CFG',
  'MTB','FITB','CMA','ZION','L','AIG','MET','PRU','AFL','ALL',
  'PGR','CB','TRV','HIG','CINF','GL','AJG','MMC','AON','WTW',
  'BEN','IVZ','TROW','AMG','FDS','MSCI','RJF','AMP','PFG','LNC',
  'ACGL','EG','AIZ','SYF','DFS','PAYC','CPAY','FLT','BR',
  'BRK.B',
  // Healthcare
  'UNH','JNJ','LLY','ABBV','MRK','PFE','AMGN','GILD','ISRG','BMY',
  'VRTX','REGN','ZBH','EW','DXCM','MDT','BSX','BDX','SYK','ABT',
  'DHR','TMO','IQV','MTD','A','IDXX','PODD','HOLX','BAX','CAH',
  'MCK','COR','CVS','CI','ELV','HUM','MOH','CNC','HSIC','TECH',
  'BIIB','MRNA','INCY','RVTY','CTLT','VTRS','ZTS','ALGN',
  'PKG','RMD','STE','TFX','WST','WAT','CRL',
  // Industrials
  'CAT','HON','UPS','BA','RTX','LMT','GE','DE','EMR','ETN',
  'FDX','NSC','CSX','URI','MMM','ITW','PH','ROK','GD','NOC',
  'HII','TXT','LHX','HWM','TDG','CARR','OTIS','DAY','AXON','PWR',
  'HUBB','RRX','AME','LDOS','SAIC','CPRT','CTAS','FAST','GWW','WAB',
  'JBHT','CHRW','EXPD','XPO','J','JCI','IR','FTV','ROL',
  'RSG','WM','AOS','MAS','SNA','SWK','ALLE','BALL','IP',
  'AVY','SEE','SON','WRK','BLDR','MLM','VMC','NUE','STLD',
  'VRSK','ODFL','PCAR','CMI','GNRC',
  // Materials
  'LIN','APD','ECL','SHW','NEM','FCX','AA','CLF','ALB','CE',
  'DOW','DD','LYB','PPG','RPM','EMN','IFF',
  // Real Estate
  'AMT','PLD','EQIX','CCI','PSA','WELL','SPG','O','DLR','EQR',
  'AVB','ESS','MAA','UDR','CPT','ARE','BXP','VTR','PEAK','HST',
  'REG','FRT','KIM','NNN','VICI','INVH','SUI','EXR','CUBE','LSI',
  'IRM','SBAC','CSGP',
  // Utilities
  'NEE','DUK','SO','AEP','EXC','XEL','SRE','D','PCG','EIX',
  'ETR','PPL','ES','WEC','CMS','LNT','EVRG','NI','PNW','AES',
  'AEE','CNP','PEG','FE','DTE','AWK',
];

// ── Types ────────────────────────────────────────────────────────────────────
interface MassiveSnapshot {
  ticker: string;
  day?: { c: number; h: number; l: number; o: number; v: number; vw?: number };
  prevDay?: { c: number; h: number; l: number; o: number; v: number };
  todaysChange?: number;
  todaysChangePerc?: number;
}

interface MassiveBar {
  c: number; h: number; l: number; o: number; t: number; v: number;
}

interface EarningsRow {
  symbol: string;
  name: string;
  report_date: string;
}

interface EnrichmentRow {
  symbol: string;
  hv20: number | null;
  eps_beat_streak: number | null;
  avg_surprise_pct: number | null;
}

interface Candidate {
  symbol: string;
  company: string;
  price: number;
  changePct: number;
  gapPct: number;
  volume: number;
  signalType: 'earnings_today' | 'earnings_tomorrow' | 'vol_surge' | 'earnings_vol_combo';
  reportDate: string | null;
}

interface ScoredSetup extends Candidate {
  avgVolume20d: number;
  rsi: number;
  volRatio: number;
  hv20: number | null;
  epsBeatStreak: number | null;
  avgSurprisePct: number | null;
  setupType: string;
  entry: number;
  stop: number;
  target: number;
  rr: string;
  score: number;
  reason: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
}
function daysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
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

async function processBatch<T, R>(
  items: T[], size: number, fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...await Promise.all(items.slice(i, i + size).map(fn)));
    if (i + size < items.length) await sleep(150);
  }
  return results;
}

// ── RSI-14 ───────────────────────────────────────────────────────────────────
function computeRsi(closes: number[]): number {
  if (closes.length < 15) return 50;
  const last15 = closes.slice(-15);
  let gains = 0, losses = 0;
  for (let i = 1; i < last15.length; i++) {
    const d = last15[i] - last15[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}

// ── Setup type classifier ────────────────────────────────────────────────────
function classifySetupType(
  signalType: string,
  changePct: number,
  rsi: number,
  volRatio: number,
): string {
  if (signalType === 'earnings_today' || signalType === 'earnings_vol_combo') {
    if (rsi > 65) return 'Earnings Breakout';
    if (rsi < 40) return 'Earnings Reversal';
    return 'Earnings Play';
  }
  if (signalType === 'earnings_tomorrow') {
    return 'Pre-Earnings Setup';
  }
  // vol_surge
  if (changePct > 2) return 'Vol Surge Breakout';
  if (changePct < -2) return 'Vol Surge Reversal';
  return 'Dark Pool Accumulation';
}

// ── Compute levels (3:1 R:R) ─────────────────────────────────────────────────
function computeLevels(price: number, atr: number, signal: string) {
  const riskFactor = signal.includes('earnings') ? 1.2 : 1.0;
  const stop   = parseFloat((price - atr * riskFactor).toFixed(2));
  const entry  = parseFloat(price.toFixed(2));
  const target = parseFloat((price + atr * riskFactor * 3).toFixed(2));
  const rrNum  = ((target - entry) / (entry - stop));
  const rr     = `${rrNum.toFixed(1)}:1`;
  return { entry, stop, target, rr };
}

// ── Scoring ──────────────────────────────────────────────────────────────────
function scoreCandidate(
  signalType: string,
  changePct: number,
  volRatio: number,
  rsi: number,
  epsBeatStreak: number | null,
  avgSurprisePct: number | null,
): number {
  let score = 0;

  // Earnings base points
  if (signalType === 'earnings_today' || signalType === 'earnings_vol_combo') score += 40;
  else if (signalType === 'earnings_tomorrow') score += 25;

  // Volume surge points (0-30)
  if (volRatio >= VOL_SURGE_3X) score += 30;
  else if (volRatio >= VOL_SURGE_2X) score += 15;
  else if (volRatio >= 1.5) score += 8;

  // Earnings quality bonus (0-20)
  if (epsBeatStreak != null) {
    if (epsBeatStreak >= 4) score += 20;
    else if (epsBeatStreak >= 2) score += 12;
    else if (epsBeatStreak >= 1) score += 6;
  }
  if (avgSurprisePct != null && avgSurprisePct > 5) score += 10;

  // RSI quality (0-15)
  // For earnings: prefer mid-RSI (40-70) — not too overbought or oversold
  if (signalType.includes('earnings')) {
    if (rsi >= 40 && rsi <= 70) score += 15;
    else if (rsi >= 30 && rsi < 40) score += 8;
    else if (rsi > 70 && rsi <= 80) score += 8;
  } else {
    // Vol surge: higher RSI = more momentum
    if (rsi >= 55 && rsi <= 75) score += 15;
    else if (rsi >= 45) score += 8;
  }

  // Penalty: already ran hard (avoid chasing)
  if (Math.abs(changePct) > 8) score -= 15;
  else if (Math.abs(changePct) > 5) score -= 8;

  // Combo bonus: both earnings + vol surge
  if (signalType === 'earnings_vol_combo') score += 15;

  return Math.max(0, Math.min(100, score));
}

// ── Handler ──────────────────────────────────────────────────────────────────
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
  const openAiKey = process.env.OPENAI_API_KEY ?? '';

  if (!massiveKey || !sbUrl || !sbKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing env vars' }) };
  }

  const supabase  = createClient(sbUrl, sbKey);
  const start     = Date.now();

  // ── TIER 1a: Load today's + tomorrow's earnings from Supabase ───────────
  const today    = todayStr();
  const tomorrow = tomorrowStr();

  const { data: earningsRows } = await supabase
    .from('earnings_calendar')
    .select('symbol, name, report_date')
    .in('report_date', [today, tomorrow])
    .order('report_date', { ascending: true });

  const earnings = (earningsRows ?? []) as EarningsRow[];
  const earningsMap = new Map<string, EarningsRow>();
  for (const e of earnings) earningsMap.set(e.symbol, e);

  console.log(`[scan-onwatch] Earnings today/tomorrow: ${earnings.length} symbols`);

  // ── TIER 1b: Snapshot all S&P 500 + earnings tickers to find vol surges ─
  const earningsSymbols = earnings.map(e => e.symbol);
  const universe = [...new Set([...SP500_UNIVERSE, ...earningsSymbols])];
  const snapshots: MassiveSnapshot[] = [];

  for (let i = 0; i < universe.length; i += BATCH_SNAPSHOT) {
    const batch = universe.slice(i, i + BATCH_SNAPSHOT);
    try {
      const res = await massiveGet<{ tickers?: MassiveSnapshot[] }>(
        `/v2/snapshot/locale/us/markets/stocks/tickers`,
        { tickers: batch.join(',') },
      );
      snapshots.push(...(res.tickers ?? []));
    } catch (e) {
      console.error('[scan-onwatch] Snapshot batch error:', e);
    }
    if (i + BATCH_SNAPSHOT < universe.length) await sleep(100);
  }

  // Build snapshot map
  const snapMap = new Map<string, MassiveSnapshot>();
  for (const s of snapshots) snapMap.set(s.ticker, s);

  // ── TIER 1c: Identify candidates ─────────────────────────────────────────
  // We need 20d avg vol to detect surges — do a quick vol estimate from snapshot only
  // (full avg computed in tier 2 from bars, but we need a rough filter here)
  // Use prevDay vol as a rough proxy for "yesterday" and today's vol for ratio
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  // Earnings candidates first (always include regardless of vol)
  for (const e of earnings) {
    const snap = snapMap.get(e.symbol);
    const price = snap?.day?.c ?? snap?.prevDay?.c ?? 0;
    if (price < 5) continue; // skip penny stocks

    const changePct = snap?.todaysChangePerc ?? 0;
    const volume    = snap?.day?.v ?? snap?.prevDay?.v ?? 0;
    const gapPct    = snap?.prevDay?.c && snap?.day?.o
      ? ((snap.day.o - snap.prevDay.c) / snap.prevDay.c) * 100
      : 0;

    seen.add(e.symbol);
    candidates.push({
      symbol:     e.symbol,
      company:    e.name,
      price,
      changePct,
      gapPct,
      volume,
      signalType: e.report_date === today ? 'earnings_today' : 'earnings_tomorrow',
      reportDate: e.report_date,
    });
  }

  // Vol surge candidates (non-earnings)
  // We don't have 20d avg here, so use a rough heuristic: volume > 2M AND changePct flat-ish
  // Full vol ratio computed in tier 2
  const volSurgeCandidates = snapshots
    .filter(s => {
      const sym = s.ticker;
      if (seen.has(sym)) return false;
      const price = s.day?.c ?? 0;
      const vol   = s.day?.v ?? 0;
      // Rough filter: high absolute volume, price > $10
      return price > 10 && vol > 1_500_000;
    })
    .sort((a, b) => (b.day?.v ?? 0) - (a.day?.v ?? 0))
    .slice(0, 40); // top 40 by raw volume

  for (const s of volSurgeCandidates) {
    const snap = snapMap.get(s.ticker);
    const price = snap?.day?.c ?? snap?.prevDay?.c ?? 0;
    if (price < 10) continue;

    const changePct = snap?.todaysChangePerc ?? 0;
    const volume    = snap?.day?.v ?? snap?.prevDay?.v ?? 0;
    const gapPct    = snap?.prevDay?.c && snap?.day?.o
      ? ((snap.day.o - snap.prevDay.c) / snap.prevDay.c) * 100
      : 0;

    seen.add(s.ticker);
    candidates.push({
      symbol:     s.ticker,
      company:    s.ticker, // will be enriched if earnings match
      price,
      changePct,
      gapPct,
      volume,
      signalType: 'vol_surge',
      reportDate: null,
    });
  }

  // Sort: S&P 500 members first (guaranteed Massive bar data), then by signal priority
  const sp500Set = new Set(SP500_UNIVERSE);
  candidates.sort((a, b) => {
    const aKnown = sp500Set.has(a.symbol) ? 0 : 1;
    const bKnown = sp500Set.has(b.symbol) ? 0 : 1;
    if (aKnown !== bKnown) return aKnown - bKnown;
    // Within same group: earnings_today first, then earnings_tomorrow, then vol_surge
    const priority = (sig: string) => sig === 'earnings_today' ? 0 : sig === 'earnings_tomorrow' ? 1 : 2;
    return priority(a.signalType) - priority(b.signalType);
  });

  // Limit to TIER1_COUNT, S&P 500 earners first
  const tier1 = candidates.slice(0, TIER1_COUNT);
  console.log(`[scan-onwatch] Tier 1 candidates: ${tier1.length} (${earnings.length} earnings + ${tier1.length - Math.min(earnings.length, TIER1_COUNT)} vol surge)`);

  // ── TIER 2: Fetch 30d bars + enrichment ──────────────────────────────────
  const barsResults = await processBatch(tier1, BATCH_BARS, async (c) => {
    try {
      const from = daysAgoStr(BARS_LOOKBACK + 5);
      const to   = todayStr();
      const data = await massiveGet<{ results?: MassiveBar[] }>(
        `/v2/aggs/ticker/${encodeURIComponent(c.symbol)}/range/1/day/${from}/${to}`,
        { adjusted: 'true', sort: 'asc', limit: 50 },
      );
      return { symbol: c.symbol, bars: data.results ?? [] };
    } catch {
      return { symbol: c.symbol, bars: [] };
    }
  });

  const barsMap = new Map<string, MassiveBar[]>();
  for (const r of barsResults) barsMap.set(r.symbol, r.bars);

  // Load earnings enrichment for all symbols
  const symbols = tier1.map(c => c.symbol);
  const { data: enrichRows } = await supabase
    .from('earnings_enrichment')
    .select('symbol, hv20, eps_beat_streak, avg_surprise_pct')
    .in('symbol', symbols);

  const enrichMap = new Map<string, EnrichmentRow>();
  for (const r of (enrichRows ?? []) as EnrichmentRow[]) enrichMap.set(r.symbol, r);

  // ── Score each candidate ─────────────────────────────────────────────────
  const scored: ScoredSetup[] = [];

  for (const c of tier1) {
    const bars = barsMap.get(c.symbol) ?? [];
    if (bars.length < 5) continue;

    const closes  = bars.map(b => b.c);
    const volumes = bars.map(b => b.v);

    const rsi        = computeRsi(closes);
    const avg20vols  = volumes.slice(-20);
    const avgVol20d  = avg20vols.reduce((a, b) => a + b, 0) / avg20vols.length;
    const volRatio   = avgVol20d > 0 ? c.volume / avgVol20d : 1;

    // Upgrade signal type if vol surge detected for earnings stock
    let signalType = c.signalType;
    if ((signalType === 'earnings_today' || signalType === 'earnings_tomorrow') && volRatio >= VOL_SURGE_2X) {
      signalType = 'earnings_vol_combo';
    }
    // Filter vol_surge: require actual confirmed 2x+ ratio
    if (signalType === 'vol_surge' && volRatio < VOL_SURGE_2X) continue;

    const enrich     = enrichMap.get(c.symbol);
    const hv20       = enrich?.hv20 ?? null;
    const epsBeat    = enrich?.eps_beat_streak ?? null;
    const avgSurp    = enrich?.avg_surprise_pct ?? null;

    const score = scoreCandidate(signalType, c.changePct, volRatio, rsi, epsBeat, avgSurp);
    if (score < 20) continue;

    // ATR for levels (5-day)
    const last6 = bars.slice(-6);
    const trueRanges = last6.slice(1).map((b, i) => {
      const prev = last6[i];
      return Math.max(b.h - b.l, Math.abs(b.h - prev.c), Math.abs(b.l - prev.c));
    });
    const atr = trueRanges.length > 0
      ? trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length
      : c.price * 0.02;

    const { entry, stop, target, rr } = computeLevels(c.price, atr, signalType);
    const setupType = classifySetupType(signalType, c.changePct, rsi, volRatio);

    scored.push({
      ...c,
      signalType,
      avgVolume20d: Math.round(avgVol20d),
      rsi,
      volRatio: parseFloat(volRatio.toFixed(2)),
      hv20,
      epsBeatStreak: epsBeat,
      avgSurprisePct: avgSurp,
      setupType,
      entry,
      stop,
      target,
      rr,
      score,
      reason: '',
    });
  }

  // Sort: earnings_vol_combo first, then by score
  scored.sort((a, b) => {
    const typeOrder = { earnings_vol_combo: 0, earnings_today: 1, earnings_tomorrow: 2, vol_surge: 3 };
    const ta = typeOrder[a.signalType] ?? 4;
    const tb = typeOrder[b.signalType] ?? 4;
    if (ta !== tb) return ta - tb;
    return b.score - a.score;
  });

  const tier2 = scored.slice(0, TIER2_COUNT);
  console.log(`[scan-onwatch] Tier 2: ${tier2.length} setups after scoring`);

  if (tier2.length === 0) {
    console.log('[scan-onwatch] No qualifying setups found');
    return { statusCode: 200, body: JSON.stringify({ message: 'No qualifying setups', elapsed: Date.now() - start }) };
  }

  // ── TIER 3: OpenAI reasons ───────────────────────────────────────────────
  if (openAiKey) {
    try {
      const prompt = tier2.map(s => {
        const earningsPart = s.reportDate
          ? s.signalType === 'earnings_today'
            ? `reporting earnings TODAY`
            : s.signalType === 'earnings_vol_combo'
            ? `reporting earnings TODAY with unusual volume surge (${s.volRatio.toFixed(1)}x avg)`
            : `reporting earnings TOMORROW`
          : '';
        const volPart = s.signalType === 'vol_surge'
          ? `running ${s.volRatio.toFixed(1)}x normal volume`
          : '';
        const enrichPart = s.epsBeatStreak ? `, beat EPS ${s.epsBeatStreak} quarters in a row` : '';
        const hv20Part = s.hv20 ? `, HV20: ${s.hv20}%` : '';
        return `${s.symbol} (${s.company}): ${s.signalType} — ${earningsPart}${volPart}, price $${s.price.toFixed(2)} (${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%), RSI ${s.rsi}${enrichPart}${hv20Part}, vol ratio ${s.volRatio.toFixed(1)}x`;
      }).join('\n');

      const response = await generateText({
        model: getDefaultOpenAIModel(),
        maxOutputTokens: 1024,
        messages: [{
          role: 'user',
          content: `You are a concise trading analyst. For each stock below, write exactly ONE sentence explaining why it's "on watch" today — focus on the catalyst (earnings or unusual volume) and what the setup means for traders. Be specific, plain English, no jargon. Output ONLY a JSON array of strings in the same order, no other text.\n\n${prompt}`,
        }],
      });

      const reasons: string[] = JSON.parse(extractJsonString(response.text));
      reasons.forEach((r, i) => { if (tier2[i]) tier2[i].reason = r; });
    } catch (e) {
      console.error('[scan-onwatch] OpenAI error:', e);
    }
  }

  // ── Write to Supabase ────────────────────────────────────────────────────
  const batchId     = crypto.randomUUID();
  const scannedAt   = new Date().toISOString();
  const final       = tier2.slice(0, FINAL_COUNT);

  const rows = final.map((s, i) => ({
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
    signal_type:     s.signalType,
    report_date:     s.reportDate,
    hv20:            s.hv20,
    eps_beat_streak: s.epsBeatStreak,
    avg_surprise_pct: s.avgSurprisePct,
    vol_ratio:       s.volRatio,
    setup_type:      s.setupType,
    entry:           s.entry,
    stop:            s.stop,
    target:          s.target,
    rr:              s.rr,
    score:           s.score,
    reason:          s.reason || `${s.company} is on watch — ${s.signalType.replace(/_/g, ' ')} with ${s.volRatio.toFixed(1)}x volume.`,
    scanned_at:      scannedAt,
  }));

  const { error: insertErr } = await supabase.from('on_watch_setups').insert(rows);
  if (insertErr) {
    console.error('[scan-onwatch] Insert error:', insertErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: insertErr.message }) };
  }

  // Prune batches older than 48 hours
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await supabase.from('on_watch_setups').delete().lt('scanned_at', cutoff);

  console.log(`[scan-onwatch] Done — ${final.length} setups written in ${Date.now() - start}ms`);
  return {
    statusCode: 200,
    body: JSON.stringify({ batchId, count: final.length, elapsed: Date.now() - start }),
  };
};

export { handler };
