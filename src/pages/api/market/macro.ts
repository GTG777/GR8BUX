import type { NextApiRequest, NextApiResponse } from 'next';
import { getMultipleStockSnapshots, getIndicesSnapshots } from '@/lib/massive';

// Cache for 10 minutes — macro data doesn't change by the second
const cache = new Map<string, { data: MacroData; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000;

/* ── Symbols to fetch ──────────────────────────────────────────── */
// I:VIX = CBOE Volatility Index
// I:TNX = 10-year Treasury yield (actual % value, e.g. 4.35)
// I:IRX = 13-week T-bill yield (≈2yr proxy)
// GLD   = Gold ETF (proxy for Gold)
// USO   = Oil ETF (proxy for crude oil)
// UUP   = Dollar Bull ETF (proxy for DXY)
// TLT   = 20+ yr Treasury Bond ETF (proxy for long bonds)
// SPY   = S&P 500 ETF (market baseline)
const INDEX_TICKERS = ['I:VIX', 'I:TNX', 'I:IRX'];
const ETF_TICKERS   = ['GLD', 'USO', 'UUP', 'TLT', 'SPY'];

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

function vixRegime(vix: number): MacroData['vixRegime'] {
  if (vix < 15) return 'low';
  if (vix < 20) return 'normal';
  if (vix < 30) return 'elevated';
  return 'extreme';
}

function riskRegime(
  vix: number,
  bondChangePct: number,
  dollarChangePct: number,
): MacroData['riskRegime'] {
  if (vix > 25 || bondChangePct > 0.5 || dollarChangePct > 0.5) return 'risk-off';
  if (vix < 18 && bondChangePct < 0 && dollarChangePct < 0) return 'risk-on';
  return 'neutral';
}

const ZERO_QUOTE = { price: 0, change: 0, changePct: 0 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get('macro');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    // Fetch indices and ETFs in parallel
    const [indexSnaps, etfSnaps] = await Promise.all([
      getIndicesSnapshots(INDEX_TICKERS),
      getMultipleStockSnapshots(ETF_TICKERS),
    ]);

    // Helper: build MacroQuote from index snapshot (Massive returns actual % for yields)
    const indexQ = (ticker: string, symbol: string, label: string): MacroQuote => {
      const snap = indexSnaps.get(ticker);
      if (!snap) return { symbol, label, ...ZERO_QUOTE };
      const price    = snap.value ?? 0;
      const change   = snap.session?.change ?? 0;
      const changePct = snap.session?.change_percent ?? 0;
      return { symbol, label, price: parseFloat(price.toFixed(4)), change: parseFloat(change.toFixed(4)), changePct: parseFloat(changePct.toFixed(2)) };
    };

    // Helper: build MacroQuote from stock ETF snapshot
    const etfQ = (ticker: string, label: string): MacroQuote => {
      const snap = etfSnaps.get(ticker);
      if (!snap) return { symbol: ticker, label, ...ZERO_QUOTE };
      const price    = snap.day?.c ?? 0;
      const prevClose = snap.prevDay?.c ?? price;
      const change   = snap.todaysChange ?? parseFloat((price - prevClose).toFixed(4));
      const changePct = snap.todaysChangePerc ?? (prevClose !== 0 ? parseFloat(((change / prevClose) * 100).toFixed(2)) : 0);
      return { symbol: ticker, label, price: parseFloat(price.toFixed(4)), change: parseFloat(change.toFixed(4)), changePct: parseFloat(changePct.toFixed(2)) };
    };

    const vixQ  = indexQ('I:VIX', '^VIX', 'VIX');
    const t10y  = indexQ('I:TNX', '^TNX', '10Y Yield');
    const t2y   = indexQ('I:IRX', '^IRX', '2Y Yield');
    const goldQ = etfQ('GLD', 'Gold (GLD)');
    const oilQ  = etfQ('USO', 'Oil (USO)');
    const dollarQ = etfQ('UUP', 'Dollar (UUP)');
    const bondsQ  = etfQ('TLT', 'Bonds (TLT)');
    const spyQ    = etfQ('SPY', 'SPY');

    // Massive returns I:TNX and I:IRX as actual % values (e.g. 4.35 = 4.35%)
    // No ×10 adjustment needed (unlike Yahoo Finance)
    const t10yPct = t10y.price;
    const t2yPct  = t2y.price;

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
