import type { NextApiRequest, NextApiResponse } from 'next';

const cache = new Map<string, { data: SectorData; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/* ── Sector definitions ────────────────────────────────────────── */
export const SECTORS = [
  { symbol: 'XLK',  label: 'Technology',        emoji: '💻', type: 'offensive' },
  { symbol: 'XLF',  label: 'Financials',         emoji: '🏦', type: 'offensive' },
  { symbol: 'XLY',  label: 'Consumer Disc.',     emoji: '🛍️', type: 'offensive' },
  { symbol: 'XLC',  label: 'Communication',      emoji: '📡', type: 'offensive' },
  { symbol: 'XLI',  label: 'Industrials',        emoji: '🏭', type: 'offensive' },
  { symbol: 'XLE',  label: 'Energy',             emoji: '⛽', type: 'commodity' },
  { symbol: 'XLB',  label: 'Materials',          emoji: '🪨', type: 'commodity' },
  { symbol: 'XLV',  label: 'Health Care',        emoji: '🏥', type: 'defensive' },
  { symbol: 'XLP',  label: 'Consumer Staples',   emoji: '🛒', type: 'defensive' },
  { symbol: 'XLU',  label: 'Utilities',          emoji: '⚡', type: 'defensive' },
  { symbol: 'XLRE', label: 'Real Estate',        emoji: '🏠', type: 'defensive' },
] as const;

export type SectorType = 'offensive' | 'defensive' | 'commodity';
export type SectorStatus = 'leading' | 'lagging' | 'neutral';
export type RotationRegime =
  | 'risk-on'        // offensive sectors dominating
  | 'defensive'      // defensive sectors leading
  | 'commodity'      // energy/materials leading
  | 'mixed';         // no clear leader

export interface SectorQuote {
  symbol: string;
  label: string;
  emoji: string;
  type: SectorType;
  price: number;
  changePct: number;        // daily % change
  relStrength: number;      // changePct - SPY changePct (bps context)
  status: SectorStatus;     // leading / lagging / neutral vs SPY
}

export interface SectorData {
  sectors: SectorQuote[];
  spy: { price: number; changePct: number };
  rotationRegime: RotationRegime;
  leaders: string[];        // labels of top 3 outperformers
  laggards: string[];       // labels of bottom 3 underperformers
  narrative: string;        // plain-English rotation summary
  fetchedAt: number;
}

/* ── Fetch a single Yahoo Finance quote ───────────────────────── */
async function fetchQuote(symbol: string): Promise<{ price: number; changePct: number }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${symbol}: ${res.status}`);
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`${symbol}: no meta`);
  const price = meta.regularMarketPrice ?? 0;
  const prev  = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const changePct = prev !== 0 ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : 0;
  return { price, changePct };
}

/* ── Rotation regime classifier ────────────────────────────────── */
function classifyRotation(sectors: SectorQuote[]): RotationRegime {
  const offensive = sectors.filter((s) => s.type === 'offensive');
  const defensive = sectors.filter((s) => s.type === 'defensive');
  const commodity = sectors.filter((s) => s.type === 'commodity');

  const avgRel = (arr: SectorQuote[]) =>
    arr.reduce((sum, s) => sum + s.relStrength, 0) / (arr.length || 1);

  const offAvg = avgRel(offensive);
  const defAvg = avgRel(defensive);
  const comAvg = avgRel(commodity);

  const max = Math.max(offAvg, defAvg, comAvg);
  if (max < 0.15) return 'mixed'; // no clear leader

  if (offAvg === max && offAvg > 0.15) return 'risk-on';
  if (defAvg === max && defAvg > 0.15) return 'defensive';
  if (comAvg === max && comAvg > 0.15) return 'commodity';
  return 'mixed';
}

/* ── Plain-English rotation narrative ─────────────────────────── */
function buildNarrative(
  regime: RotationRegime,
  leaders: string[],
  laggards: string[],
  spyChangePct: number,
): string {
  const mkt = spyChangePct >= 0
    ? `SPY is up ${spyChangePct.toFixed(2)}% today.`
    : `SPY is down ${Math.abs(spyChangePct).toFixed(2)}% today.`;

  const leadStr  = leaders.length  ? `${leaders.slice(0, 3).join(', ')} leading.`  : '';
  const lagStr   = laggards.length ? `${laggards.slice(0, 3).join(', ')} lagging.` : '';

  const regimeText: Record<RotationRegime, string> = {
    'risk-on':   'Offensive sectors dominating — market in risk-on mode. Growth and cyclicals preferred.',
    'defensive': 'Defensive sectors leading — investors rotating to safety. Watch for broader weakness.',
    'commodity': 'Energy and Materials outperforming — commodity/inflation rotation in play.',
    'mixed':     'No clear sector leadership — mixed rotation, wait for confirmation.',
  };

  return [mkt, regimeText[regime], leadStr, lagStr].filter(Boolean).join(' ');
}

/* ── API handler ───────────────────────────────────────────────── */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get('sectors');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    const allSymbols = [...SECTORS.map((s) => s.symbol), 'SPY'];
    const results = await Promise.allSettled(allSymbols.map(fetchQuote));

    const spyResult = results[SECTORS.length];
    const spyQ = spyResult.status === 'fulfilled'
      ? spyResult.value
      : { price: 0, changePct: 0 };

    const sectors: SectorQuote[] = SECTORS.map((def, i) => {
      const r = results[i];
      const q = r.status === 'fulfilled' ? r.value : { price: 0, changePct: 0 };
      const relStrength = parseFloat((q.changePct - spyQ.changePct).toFixed(2));
      const status: SectorStatus =
        relStrength >= 0.3 ? 'leading' :
        relStrength <= -0.3 ? 'lagging' : 'neutral';
      return {
        symbol: def.symbol,
        label:  def.label,
        emoji:  def.emoji,
        type:   def.type,
        price:  q.price,
        changePct: q.changePct,
        relStrength,
        status,
      };
    });

    const sorted    = [...sectors].sort((a, b) => b.relStrength - a.relStrength);
    const leaders   = sorted.filter((s) => s.status === 'leading').map((s) => s.label);
    const laggards  = sorted.filter((s) => s.status === 'lagging').map((s) => s.label);
    const regime    = classifyRotation(sectors);
    const narrative = buildNarrative(regime, leaders, laggards, spyQ.changePct);

    const data: SectorData = {
      sectors: sorted, // pre-sorted best → worst
      spy: spyQ,
      rotationRegime: regime,
      leaders,
      laggards,
      narrative,
      fetchedAt: Date.now(),
    };

    cache.set('sectors', { data, timestamp: Date.now() });
    return res.status(200).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: msg });
  }
}
