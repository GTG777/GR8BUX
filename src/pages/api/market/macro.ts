import type { NextApiRequest, NextApiResponse } from 'next';

// Cache for 10 minutes — macro data doesn't change by the second
const cache = new Map<string, { data: MacroData; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/* ── Symbols to fetch ──────────────────────────────────────────── */
// ^VIX  = CBOE Volatility Index
// ^TNX  = 10-year Treasury yield (×10 to get %)
// ^IRX  = 13-week (≈2yr proxy) Treasury yield (×10 to get %)
// GLD   = Gold ETF (proxy for Gold)
// USO   = Oil ETF (proxy for crude oil)
// UUP   = Dollar Bull ETF (proxy for DXY)
// TLT   = 20+ yr Treasury Bond ETF (proxy for long bonds)
// SPY   = S&P 500 ETF (market baseline)
const SYMBOLS = ['^VIX', '^TNX', '^IRX', 'GLD', 'USO', 'UUP', 'TLT', 'SPY'];

export interface MacroQuote {
  symbol: string;
  label: string;
  price: number;
  change: number;
  changePct: number;
}

export interface MacroData {
  vix: MacroQuote;
  t10y: MacroQuote;   // 10-year yield %
  t2y: MacroQuote;    // 2-year yield % (13wk proxy, IRX)
  yieldSpread: number; // 10y - 2y in bps
  yieldCurveRegime: 'normal' | 'flat' | 'inverted';
  gold: MacroQuote;
  oil: MacroQuote;
  dollar: MacroQuote;
  bonds: MacroQuote;
  spy: MacroQuote;
  vixRegime: 'low' | 'normal' | 'elevated' | 'extreme';
  riskRegime: 'risk-on' | 'risk-off' | 'neutral';
  fetchedAt: number;
}

async function fetchQuote(symbol: string): Promise<{ price: number; change: number; changePct: number }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${symbol}: ${res.status}`);
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`${symbol}: no meta`);
  const price = meta.regularMarketPrice ?? 0;
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const change = parseFloat((price - prev).toFixed(4));
  const changePct = prev !== 0 ? parseFloat(((change / prev) * 100).toFixed(2)) : 0;
  return { price, change, changePct };
}

function vixRegime(vix: number): MacroData['vixRegime'] {
  if (vix < 15) return 'low';
  if (vix < 20) return 'normal';
  if (vix < 30) return 'elevated';
  return 'extreme';
}

/**
 * Risk regime heuristic:
 *  - VIX < 20 + bonds falling + dollar falling → risk-on
 *  - VIX > 25 OR bonds rising strongly + dollar rising → risk-off
 *  - else neutral
 */
function riskRegime(
  vix: number,
  bondChangePct: number,
  dollarChangePct: number,
): MacroData['riskRegime'] {
  if (vix > 25 || bondChangePct > 0.5 || dollarChangePct > 0.5) return 'risk-off';
  if (vix < 18 && bondChangePct < 0 && dollarChangePct < 0) return 'risk-on';
  return 'neutral';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get('macro');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    // Fetch all in parallel
    const results = await Promise.allSettled(SYMBOLS.map(fetchQuote));

    const getQ = (idx: number, label: string, sym: string): MacroQuote => {
      const r = results[idx];
      const q = r.status === 'fulfilled' ? r.value : { price: 0, change: 0, changePct: 0 };
      return { symbol: sym, label, ...q };
    };

    const vixQ    = getQ(0, 'VIX',         '^VIX');
    const t10yRaw = getQ(1, '10Y Yield',    '^TNX');
    const t2yRaw  = getQ(2, '2Y Yield',     '^IRX');
    const goldQ   = getQ(3, 'Gold (GLD)',   'GLD');
    const oilQ    = getQ(4, 'Oil (USO)',    'USO');
    const dollarQ = getQ(5, 'Dollar (UUP)', 'UUP');
    const bondsQ  = getQ(6, 'Bonds (TLT)',  'TLT');
    const spyQ    = getQ(7, 'SPY',          'SPY');

    // TNX and IRX are quoted as % × 10 by Yahoo (e.g. 43.5 = 4.35%)
    const t10yPct = t10yRaw.price > 10 ? t10yRaw.price / 10 : t10yRaw.price;
    const t2yPct  = t2yRaw.price  > 10 ? t2yRaw.price  / 10 : t2yRaw.price;

    const t10y: MacroQuote = { ...t10yRaw, price: parseFloat(t10yPct.toFixed(3)) };
    const t2y:  MacroQuote = { ...t2yRaw,  price: parseFloat(t2yPct.toFixed(3))  };

    const spreadBps = parseFloat(((t10yPct - t2yPct) * 100).toFixed(1));
    const yieldCurveRegime: MacroData['yieldCurveRegime'] =
      spreadBps > 25 ? 'normal' : spreadBps > -10 ? 'flat' : 'inverted';

    const data: MacroData = {
      vix: vixQ,
      t10y,
      t2y,
      yieldSpread: spreadBps,
      yieldCurveRegime,
      gold: goldQ,
      oil: oilQ,
      dollar: dollarQ,
      bonds: bondsQ,
      spy: spyQ,
      vixRegime: vixRegime(vixQ.price),
      riskRegime: riskRegime(vixQ.price, bondsQ.changePct, dollarQ.changePct),
      fetchedAt: Date.now(),
    };

    cache.set('macro', { data, timestamp: Date.now() });
    return res.status(200).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: msg });
  }
}
