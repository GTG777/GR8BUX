/**
 * GET /api/market/screener?symbols=AAPL,MSFT,...
 *
 * Fetches 6-month daily candles for each symbol in parallel,
 * computes full indicator set, detects setup grade, returns rows
 * sorted by trend score descending.
 *
 * Results cached 15 minutes in-process.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getAggBars, daysAgoDateStr, todayDateStr } from '@/lib/massive';

// ── In-process cache ──────────────────────────────────────────────
const cache = new Map<string, { rows: ScreenerRow[]; ts: number }>();
const TTL = 15 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────
export interface ScreenerRow {
  symbol: string;
  price: number;
  changePct: number;
  trendScore: number;   // -3 to 3
  rsi: number;
  tsi: number;
  volumeRatio: number;
  atr14: number;
  hv20: number;
  macdHist: number;
  grade: 'A' | 'B' | 'C' | '-';
  setupCount: number;
}

interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number }

// ── Pure math ─────────────────────────────────────────────────────
function calcEMAArr(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [data.slice(0, period).reduce((a, b) => a + b) / period];
  for (let i = period; i < data.length; i++) result.push(data[i] * k + result[result.length - 1] * (1 - k));
  return result;
}

function calcEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes.at(-1) ?? 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  if (loss === 0) return 100;
  return parseFloat((100 - 100 / (1 + gain / loss)).toFixed(1));
}

function calcTSI(closes: number[]): number {
  if (closes.length < 40) return 0;
  const mom = closes.slice(1).map((c, i) => c - closes[i]);
  const absMom = mom.map(Math.abs);
  const sm2 = calcEMAArr(calcEMAArr(mom, 25), 13);
  const sa2 = calcEMAArr(calcEMAArr(absMom, 25), 13);
  if (!sa2.length || sa2.at(-1) === 0) return 0;
  return parseFloat(((100 * (sm2.at(-1) ?? 0)) / (sa2.at(-1) ?? 1)).toFixed(1));
}

function calcATR(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (highs.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  return parseFloat(atr.toFixed(2));
}

function calcHV(closes: number[], period = 20): number {
  if (closes.length < period + 1) return 0;
  const sl = closes.slice(-(period + 1));
  const rets = sl.slice(1).map((c, i) => Math.log(c / sl[i]));
  const mean = rets.reduce((a, b) => a + b) / rets.length;
  const v = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return parseFloat((Math.sqrt(v) * Math.sqrt(252) * 100).toFixed(1));
}

function calcMACD(closes: number[]): number {
  if (closes.length < 35) return 0;
  const kf = 2 / 13, ks = 2 / 27, kg = 2 / 10;
  let emaf = closes.slice(0, 12).reduce((a, b) => a + b) / 12;
  let emas = closes.slice(0, 26).reduce((a, b) => a + b) / 26;
  for (let i = 12; i < 26; i++) emaf = closes[i] * kf + emaf * (1 - kf);
  const macdSeries: number[] = [];
  for (let i = 26; i < closes.length; i++) {
    emaf = closes[i] * kf + emaf * (1 - kf);
    emas = closes[i] * ks + emas * (1 - ks);
    macdSeries.push(emaf - emas);
  }
  if (macdSeries.length < 9) return 0;
  let sig = macdSeries.slice(0, 9).reduce((a, b) => a + b) / 9;
  for (let i = 9; i < macdSeries.length; i++) sig = macdSeries[i] * kg + sig * (1 - kg);
  const last = macdSeries.at(-1) ?? 0;
  return parseFloat((last - sig).toFixed(4));
}

function computeRow(symbol: string, candles: Candle[]): ScreenerRow {
  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  const price     = closes.at(-1) ?? 0;
  const prevClose = closes.at(-2) ?? price;
  const changePct = parseFloat(((price - prevClose) / prevClose * 100).toFixed(2));

  const ema20  = calcEMA(closes, 20);
  const ema50  = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);

  let trendScore = 0;
  if (price > ema20)  trendScore++; else trendScore--;
  if (price > ema50)  trendScore++; else trendScore--;
  if (price > ema200) trendScore++; else trendScore--;

  const recentVols = volumes.slice(-21);
  const avgVol = recentVols.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
  const volumeRatio = avgVol > 0 ? parseFloat(((recentVols.at(-1) ?? 0) / avgVol).toFixed(2)) : 1;

  const rsi      = calcRSI(closes);
  const tsi      = calcTSI(closes);
  const atr14    = calcATR(highs, lows, closes);
  const hv20     = calcHV(closes);
  const macdHist = calcMACD(closes);

  // Simple grade: A = strong trend + momentum; B = partial; C = weak/mixed
  const signals = [
    trendScore === 3,
    tsi > 10,
    rsi > 40 && rsi < 70,
    macdHist > 0,
    volumeRatio >= 1.1,
  ].filter(Boolean).length;

  const grade: 'A' | 'B' | 'C' | '-' =
    trendScore <= -2 ? '-' :
    signals >= 4    ? 'A' :
    signals >= 2    ? 'B' : 'C';

  const setupCount =
    (trendScore === 3 && tsi >= 0 && tsi <= 50 && macdHist > 0 ? 1 : 0) +
    (trendScore >= 2 && rsi < 40 ? 1 : 0) +
    (rsi < 30 ? 1 : 0);

  return { symbol, price, changePct, trendScore, rsi, tsi, volumeRatio, atr14, hv20, macdHist, grade, setupCount };
}

// ── Fetch + compute for one symbol ───────────────────────────────
async function fetchSymbol(symbol: string, from: string, to: string): Promise<ScreenerRow | null> {
  try {
    const bars = await getAggBars(symbol, 1, 'day', from, to, { limit: 300 });
    if (bars.length < 30) return null;
    const candles: Candle[] = bars
      .map(b => ({
        date:   new Date(b.t).toISOString().slice(0, 10),
        open:   b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
      }))
      .filter(c => c.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    return computeRow(symbol, candles);
  } catch {
    return null;
  }
}

// ── Parallel fetch with concurrency limit ─────────────────────────
async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency = 6): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.all(chunk.map(fn));
    results.push(...settled);
  }
  return results;
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rawSymbols = (req.query.symbols as string) ?? '';
  const symbols = rawSymbols
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => /^[A-Z]{1,10}$/.test(s))
    .slice(0, 40); // hard cap

  if (symbols.length === 0) return res.status(400).json({ error: 'No valid symbols provided' });

  const cacheKey = symbols.sort().join(',');
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) {
    return res.status(200).json({ success: true, rows: cached.rows });
  }

  const from = daysAgoDateStr(210); // 7 months of daily bars
  const to   = todayDateStr();

  const rawRows = await pMap(symbols, s => fetchSymbol(s, from, to), 6);
  const rows = rawRows
    .filter((r): r is ScreenerRow => r !== null)
    .sort((a, b) => b.trendScore - a.trendScore || b.changePct - a.changePct);

  cache.set(cacheKey, { rows, ts: Date.now() });
  return res.status(200).json({ success: true, rows });
}
