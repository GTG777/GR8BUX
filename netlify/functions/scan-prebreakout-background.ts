/**
 * Netlify Background Function — scan-prebreakout-background
 *
 * Named with `-background` suffix for Netlify's 15-minute timeout.
 *
 * PHILOSOPHY: Find stocks BEFORE they move, not after.
 *
 * Pipeline:
 *  Tier 1 — Batch snapshot all S&P 500 tickers (Massive)
 *            Pre-filter: price > $10, abs(changePct) < 4%, volume > 300k
 *            Sort by volume-to-price-move ratio (high vol + quiet price = accumulation)
 *            Take top 60 candidates
 *
 *  Tier 2 — Fetch 30-day daily bars per candidate (Massive, 8 at a time)
 *            Score 0-100 using COMPRESSION signals:
 *              - NR7:               today's range = narrowest in 7 days       (30 pts)
 *              - ATR Squeeze:       ATR(5)/ATR(20) < 0.65                     (20 pts)
 *              - Vol Accumulation:  volume > 1.8× avg but price barely moved  (30 pts)
 *              - Near 20d High:     within 1.5% of 20-day high                (15 pts)
 *              - Gap & Hold:        small gap (0.8–3.5%) holding near open    (15 pts)
 *            Penalty: already moved >5% today (-20 pts each tier)
 *            Keep top 15 by score
 *
 *  Tier 3 — Single OpenAI call generates 1-sentence reason per setup
 *            Write final top 12 to Supabase pre_breakout_setups table
 *
 * Triggered by:
 *  - intraday-scan-prebreakout (scheduled, every 15 min market hours)
 *  - Manual: POST /.netlify/functions/scan-prebreakout-background?secret=...
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { extractJsonString, generateText, getDefaultOpenAIModel } from '../../src/lib/openaiResponses';

// ── Constants ────────────────────────────────────────────────────────────────
const MASSIVE_BASE   = 'https://api.massive.com';
const BATCH_SNAPSHOT = 200;
const BATCH_BARS     = 8;
const TIER1_COUNT    = 60;   // candidates for bar fetch
const TIER2_COUNT    = 15;   // after scoring
const FINAL_COUNT    = 12;   // written to DB
const BARS_LOOKBACK  = 30;

// ── Same S&P 500 universe as momentum scanner ────────────────────────────────
const SP500_UNIVERSE = [
  'AAPL','MSFT','NVDA','AVGO','AMD','ORCL','CRM','ADBE','NOW','QCOM',
  'TXN','INTC','MU','AMAT','LRCX','KLAC','PANW','CRWD','FTNT','MRVL',
  'PLTR','CDNS','SNPS','APH','IT','CTSH','GLW','HPQ','HPE','CDW',
  'JNPR','NTAP','STX','WDC','KEYS','ANSS','TDY','TER','MCHP','NXPI',
  'SWKS','QRVO','MPWR','ON','ENPH','FSLR','GEN','PTC','ROP','TRMB',
  'ZBRA','FFIV','AKAM','JKHY','FIS','FI','PYPL','PAYX','ADP','EPAM',
  'META','GOOGL','GOOG','AMZN','NFLX','DIS','CMCSA','T','VZ','TMUS',
  'TTWO','EA','MTCH','WBD','PARA','NWSA','NWS','LYV','IPG','OMC',
  'FOX','FOXA',
  'TSLA','HD','MCD','NKE','LOW','BKNG','TGT','SBUX','TJX','ROST',
  'UBER','ABNB','GM','F','ORLY','AZO','KMX','LEN','DHI',
  'PHM','NVR','LVS','WYNN','MGM','CZR','RCL','CCL','NCLH','HLT',
  'MAR','YUM','CMG','DRI','GPC','RL','TPR','DECK',
  'LULU','BBY','DG','DLTR','ULTA','APTV','BWA','LKQ','MHK',
  'WMT','COST','PG','KO','PEP','PM','MO','MDLZ','CL','GIS',
  'K','KDP','KHC','HSY','SJM','CPB','HRL','TSN','ADM','BG',
  'MOS','CF','FMC','CAG','KVUE','CHD','CLX','EL',
  'XOM','CVX','COP','EOG','SLB','MPC','VLO','OXY','PSX','HES',
  'BKR','HAL','DVN','FANG','APA','MRO','TRGP','OKE','WMB','KMI',
  'NRG','VST','CEG',
  'JPM','BAC','WFC','GS','MS','C','BLK','SCHW','AXP','V',
  'MA','COF','USB','PNC','TFC','SPGI','MCO','ICE','CME',
  'CBOE','NDAQ','BX','BK','STT','NTRS','RF','HBAN','KEY','CFG',
  'MTB','FITB','CMA','ZION','L','AIG','MET','PRU','AFL','ALL',
  'PGR','CB','TRV','HIG','CINF','GL','AJG','MMC','AON','WTW',
  'BEN','IVZ','TROW','AMG','FDS','MSCI','RJF','AMP','PFG','LNC',
  'ACGL','EG','AIZ','SYF','DFS','PAYC','CPAY','FLT','BR','BRK.B',
  'UNH','JNJ','LLY','ABBV','MRK','PFE','AMGN','GILD','ISRG','BMY',
  'VRTX','REGN','ZBH','EW','DXCM','MDT','BSX','BDX','SYK','ABT',
  'DHR','TMO','IQV','MTD','A','IDXX','PODD','HOLX','BAX','CAH',
  'MCK','COR','CVS','CI','ELV','HUM','MOH','CNC','HSIC','TECH',
  'BIIB','MRNA','INCY','RVTY','CTLT','VTRS','ZTS','ALGN','RMD','STE',
  'TFX','WST','WAT','CRL',
  'CAT','HON','UPS','BA','RTX','LMT','GE','DE','EMR','ETN',
  'FDX','NSC','CSX','URI','MMM','ITW','PH','ROK','GD','NOC',
  'HII','TXT','LHX','HWM','TDG','CARR','OTIS','DAY','AXON','PWR',
  'HUBB','RRX','AME','LDOS','SAIC','CPRT','CTAS','FAST','GWW','WAB',
  'JBHT','CHRW','EXPD','XPO','J','JCI','IR','FTV','ROL',
  'RSG','WM','AOS','MAS','SNA','SWK','ALLE','BALL','PKG','IP',
  'AVY','SEE','SON','BLL','WRK','BLDR','MLM','VMC','NUE','STLD',
  'VRSK','ODFL','PCAR','CMI','GNRC',
  'LIN','APD','ECL','SHW','NEM','FCX','AA','CLF','ALB','CE',
  'DOW','DD','LYB','PPG','RPM','EMN','IFF',
  'AMT','PLD','EQIX','CCI','PSA','WELL','SPG','O','DLR','EQR',
  'AVB','ESS','MAA','UDR','CPT','ARE','BXP','VTR','PEAK','HST',
  'REG','FRT','KIM','NNN','VICI','INVH','SUI','EXR','CUBE','IRM','SBAC','CSGP',
  'NEE','DUK','SO','AEP','EXC','XEL','SRE','D','PCG','EIX',
  'ETR','PPL','ES','WEC','CMS','LNT','EVRG','NI','PNW','AES',
  'NRG','AEE','CNP','PEG','FE','DTE','AWK',
];

// ── Types ────────────────────────────────────────────────────────────────────
interface MassiveSnapshot {
  ticker: string;
  day?: { c: number; h: number; l: number; o: number; v: number };
  prevDay?: { c: number; h: number; l: number; o: number; v: number };
  todaysChangePerc?: number;
}

interface MassiveBar {
  c: number; h: number; l: number; o: number; t: number; v: number;
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
  atrRatio: number;
  distFromHigh: number;
  signals: string[];
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
  return Math.round(100 - 100 / (1 + avgGain / avgLoss));
}

function calcATR(bars: MassiveBar[]): number {
  if (bars.length < 2) return 0;
  const trs = bars.slice(1).map((b, i) => {
    const prev = bars[i];
    return Math.max(b.h - b.l, Math.abs(b.h - prev.c), Math.abs(b.l - prev.c));
  });
  return trs.reduce((s, v) => s + v, 0) / trs.length;
}

function scorePreBreakout(
  snap: MassiveSnapshot,
  bars: MassiveBar[],
  avgVol20: number,
): { score: number; signals: string[]; atrRatio: number; distFromHigh: number } {
  const signals: string[] = [];
  let score = 0;

  const changePct = Math.abs(snap.todaysChangePerc ?? 0);
  const todayVol  = snap.day?.v ?? 0;
  const todayHigh = snap.day?.h ?? snap.day?.c ?? 0;
  const todayLow  = snap.day?.l ?? snap.day?.c ?? 0;
  const todayRange = todayHigh - todayLow;

  // Signal 1: NR7 — today's range is narrowest of last 7 sessions (30 pts)
  if (bars.length >= 7 && todayRange > 0) {
    const last7Ranges = bars.slice(-7).map(b => b.h - b.l);
    const minRange7   = Math.min(...last7Ranges);
    if (todayRange <= minRange7) {
      score += 30;
      signals.push('NR7');
    } else if (todayRange <= Math.min(...bars.slice(-5).map(b => b.h - b.l))) {
      score += 15;
      signals.push('NR5');
    }
  }

  // Signal 2: ATR Squeeze — short-term ATR compressing vs 20d (20 pts)
  const atr5  = calcATR(bars.slice(-6));
  const atr20 = calcATR(bars.slice(-21));
  const atrRatio = atr20 > 0 ? atr5 / atr20 : 1;
  if (atrRatio < 0.60) {
    score += 20;
    signals.push('ATR Squeeze');
  } else if (atrRatio < 0.75) {
    score += 10;
    signals.push('Compressing');
  }

  // Signal 3: Volume accumulation — high vol + quiet price (30 pts)
  const volRatio = avgVol20 > 0 ? todayVol / avgVol20 : 0;
  if (volRatio >= 1.8 && changePct < 1.5) {
    score += 30;
    signals.push('Vol Accumulation');
  } else if (volRatio >= 1.3 && changePct < 2.5) {
    score += 15;
    signals.push('Elevated Vol');
  }

  // Signal 4: Near 20-day high — within 1.5% of resistance that may break (15 pts)
  const high20d = Math.max(...bars.slice(-20).map(b => b.h));
  const currentPrice = snap.day?.c ?? 0;
  const distFromHigh = high20d > 0 ? ((high20d - currentPrice) / high20d) * 100 : 100;
  if (distFromHigh >= 0 && distFromHigh <= 1.5) {
    score += 15;
    signals.push('Near 20d High');
  } else if (distFromHigh > 1.5 && distFromHigh <= 3.5) {
    score += 7;
    signals.push('Approaching High');
  }

  // Signal 5: Gap-and-absorb — small gap but holding (not filling back) (15 pts)
  const prevClose = snap.prevDay?.c ?? 0;
  const todayOpen = snap.day?.o ?? 0;
  const gapPct    = prevClose > 0 ? ((todayOpen - prevClose) / prevClose) * 100 : 0;
  if (gapPct >= 0.8 && gapPct <= 3.5 && changePct <= gapPct + 0.8 && changePct >= 0) {
    score += 15;
    signals.push('Gap & Hold');
  }

  // Penalty: stock already moved significantly (not pre-breakout anymore)
  if (changePct > 5)  score = Math.round(score * 0.7);
  if (changePct > 8)  score = Math.round(score * 0.5);

  return {
    score:       Math.max(0, Math.min(score, 100)),
    signals,
    atrRatio:    parseFloat(atrRatio.toFixed(4)),
    distFromHigh: parseFloat(distFromHigh.toFixed(4)),
  };
}

function classifySetupType(signals: string[], rsi: number, distFromHigh: number): string {
  if (signals.includes('NR7') && signals.includes('ATR Squeeze')) return 'Squeeze';
  if (signals.includes('Vol Accumulation'))                        return 'Accumulation';
  if (signals.includes('Near 20d High') || distFromHigh <= 1.5)   return 'Coiling at Resistance';
  if (signals.includes('Gap & Hold'))                              return 'Gap & Hold';
  if (rsi >= 40 && rsi <= 60)                                      return 'Base Building';
  return 'Compression';
}

function computeLevels(price: number, low: number) {
  const entry = parseFloat(price.toFixed(2));
  const stopFromLow = parseFloat((low * 0.995).toFixed(2));
  const stopFromPct = parseFloat((entry * 0.98).toFixed(2));
  const stop  = Math.max(stopFromLow, stopFromPct) < entry
    ? Math.max(stopFromLow, stopFromPct)
    : parseFloat((entry * 0.97).toFixed(2));
  const risk   = entry - stop;
  const target = parseFloat((entry + risk * 3.0).toFixed(2)); // 3:1 for anticipation trades
  return { entry, stop, target, rr: '1:3.0' };
}

// ── AI reason generation ─────────────────────────────────────────────────────
async function generateReasons(setups: ScoredSetup[]): Promise<Map<string, string>> {
  const reasons = new Map<string, string>();
  if (setups.length === 0) return reasons;

  const summaries = setups.map(s =>
    `${s.symbol}: ${s.setupType}, RSI ${s.rsi}, ${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(1)}% today, ` +
    `signals: [${s.signals.join(', ')}], ATR ratio ${s.atrRatio.toFixed(2)}, ` +
    `${s.distFromHigh.toFixed(1)}% below 20d high, vol ${(s.volume / Math.max(s.avgVolume20d, 1)).toFixed(1)}x avg, score ${s.score}/100`
  ).join('\n');

  const prompt = `You are a concise technical trading analyst. For each pre-breakout setup below, write ONE sentence (max 20 words) explaining WHY it looks poised to move SOON — focus on the compression/coiling signal, not the fact it has already moved. Return ONLY a JSON object: {"SYMBOL": "reason", ...}

Setups:
${summaries}`;

  try {
    const response = await generateText({
      model: getDefaultOpenAIModel(),
      maxOutputTokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const parsed = JSON.parse(extractJsonString(response.text)) as Record<string, string>;
    for (const [sym, reason] of Object.entries(parsed)) reasons.set(sym.toUpperCase(), reason);
  } catch (err) {
    console.error('[scan-prebreakout] OpenAI failed:', err instanceof Error ? err.message : err);
  }
  return reasons;
}

// ── Main handler ─────────────────────────────────────────────────────────────
const handler: Handler = async (event) => {
  const secret   = process.env.CRON_SECRET;
  const provided = event.queryStringParameters?.secret || event.headers?.['x-cron-secret'];
  if (secret && provided !== secret) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  console.log('[scan-prebreakout] Starting scan…');

  try {
    // ── Tier 1: Batch snapshots ──────────────────────────────────────────
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
        console.error('[scan-prebreakout] Snapshot batch error:', err instanceof Error ? err.message : err);
      }
      if (i + BATCH_SNAPSHOT < SP500_UNIVERSE.length) await sleep(200);
    }

    console.log(`[scan-prebreakout] Got ${allSnapshots.length} snapshots`);

    // Pre-filter: price > $10, not already a huge mover (<4%), liquid (vol > 300k)
    // Sort by "accumulation score proxy": high volume with low price movement
    const preFiltered = allSnapshots
      .filter(s => (s.day?.c ?? 0) > 10)
      .filter(s => Math.abs(s.todaysChangePerc ?? 0) < 4)
      .filter(s => (s.day?.v ?? 0) > 300_000)
      .sort((a, b) => {
        // proxy: volume rank descending (more volume = more interesting for accumulation)
        return (b.day?.v ?? 0) - (a.day?.v ?? 0);
      })
      .slice(0, TIER1_COUNT);

    console.log(`[scan-prebreakout] ${preFiltered.length} candidates after Tier 1 filter`);

    // ── Tier 2: Fetch bars, compute compression signals ──────────────────
    const scoredSetups: ScoredSetup[] = [];
    const today    = todayStr();
    const fromDate = daysAgoStr(BARS_LOOKBACK + 10);

    for (let i = 0; i < preFiltered.length; i += BATCH_BARS) {
      const batch = preFiltered.slice(i, i + BATCH_BARS);
      await Promise.all(batch.map(async (snap) => {
        try {
          const data = await massiveGet<{ results?: MassiveBar[] }>(
            `/v2/aggs/ticker/${encodeURIComponent(snap.ticker)}/range/1/day/${fromDate}/${today}`,
            { adjusted: 1, sort: 'asc', limit: BARS_LOOKBACK + 15 },
          );
          const bars = data.results ?? [];
          if (bars.length < 10) return;

          const rsi       = computeRSI14(bars);
          const recentBars = bars.slice(-20);
          const avgVol20  = recentBars.length > 0
            ? Math.round(recentBars.reduce((s, b) => s + b.v, 0) / recentBars.length)
            : 0;

          const { score, signals, atrRatio, distFromHigh } = scorePreBreakout(snap, bars, avgVol20);

          // Only keep if at least 2 signals fired
          if (signals.length < 2) return;

          const currentPrice = snap.day?.c ?? 0;
          const prevClose    = snap.prevDay?.c ?? 0;
          const todayOpen    = snap.day?.o ?? currentPrice;
          const todayLow     = snap.day?.l ?? currentPrice * 0.97;
          const changePct    = snap.todaysChangePerc ?? 0;
          const gapPct       = prevClose > 0
            ? parseFloat((((todayOpen - prevClose) / prevClose) * 100).toFixed(2))
            : 0;

          const setupType = classifySetupType(signals, rsi, distFromHigh);
          const { entry, stop, target, rr } = computeLevels(currentPrice, todayLow);

          scoredSetups.push({
            symbol:       snap.ticker,
            company:      snap.ticker,
            price:        currentPrice,
            changePct,
            gapPct,
            volume:       snap.day?.v ?? 0,
            avgVolume20d: avgVol20,
            rsi,
            atrRatio,
            distFromHigh,
            signals,
            setupType,
            entry,
            stop,
            target,
            rr,
            score,
            reason: '',
          });
        } catch (err) {
          console.error(`[scan-prebreakout] Bars error for ${snap.ticker}:`, err instanceof Error ? err.message : err);
        }
      }));
      if (i + BATCH_BARS < preFiltered.length) await sleep(300);
    }

    scoredSetups.sort((a, b) => b.score - a.score);
    const topSetups = scoredSetups.slice(0, TIER2_COUNT);

    console.log(`[scan-prebreakout] Top: ${topSetups.map(s => `${s.symbol}(${s.score})`).join(', ')}`);

    // ── Tier 3: AI reasons ───────────────────────────────────────────────
    const reasons = await generateReasons(topSetups);
    for (const setup of topSetups) {
      setup.reason = reasons.get(setup.symbol) ??
        `${setup.setupType} with signals: ${setup.signals.join(', ')} — volatility compressing before potential expansion.`;
    }

    const finalSetups = topSetups.slice(0, FINAL_COUNT);

    // ── Write to Supabase ────────────────────────────────────────────────
    const batchId   = crypto.randomUUID();
    const scannedAt = new Date().toISOString();

    const rows = finalSetups.map((s, idx) => ({
      batch_id:      batchId,
      rank:          idx + 1,
      symbol:        s.symbol,
      company:       s.company,
      price:         s.price,
      change_pct:    s.changePct,
      gap_pct:       s.gapPct,
      volume:        s.volume,
      avg_volume_20d: s.avgVolume20d,
      rsi:           s.rsi,
      atr_ratio:     s.atrRatio,
      dist_from_high: s.distFromHigh,
      signals:       s.signals,
      setup_type:    s.setupType,
      entry:         s.entry,
      stop:          s.stop,
      target:        s.target,
      rr:            s.rr,
      score:         s.score,
      reason:        s.reason,
      scanned_at:    scannedAt,
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from('pre_breakout_setups').insert(rows);
      if (error) throw new Error(`Supabase insert error: ${error.message}`);
    }

    // Cleanup: delete batches older than 48h
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await supabase.from('pre_breakout_setups').delete().lt('scanned_at', cutoff);

    console.log(`[scan-prebreakout] Done — wrote ${rows.length} pre-breakout setups`);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, count: rows.length, batchId }),
    };
  } catch (err) {
    console.error('[scan-prebreakout] Fatal error:', err instanceof Error ? err.message : err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
    };
  }
};

export { handler };
