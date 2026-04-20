import type { NextApiRequest, NextApiResponse } from 'next';
import { massiveFetch } from '@/lib/massive';

const cache = new Map<string, { data: MoversData; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes — movers change more often

/* ── Well-known company names for display ─────────────────────── */
const NAMES: Record<string, string> = {
  AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'NVIDIA', AMZN: 'Amazon',
  GOOGL: 'Alphabet', META: 'Meta', TSLA: 'Tesla', AVGO: 'Broadcom',
  JPM: 'JPMorgan', V: 'Visa', UNH: 'UnitedHealth', XOM: 'ExxonMobil',
  MA: 'Mastercard', LLY: 'Eli Lilly', JNJ: 'Johnson & Johnson',
  WMT: 'Walmart', COST: 'Costco', HD: 'Home Depot', PG: 'P&G',
  NFLX: 'Netflix', AMD: 'AMD', ORCL: 'Oracle', CRM: 'Salesforce',
  NOW: 'ServiceNow', PLTR: 'Palantir', HOOD: 'Robinhood', MSTR: 'MicroStrategy',
  SOFI: 'SoFi', RIVN: 'Rivian', LCID: 'Lucid', GME: 'GameStop',
  AMC: 'AMC Ent.', BBBY: 'Bed Bath', BB: 'BlackBerry', NIO: 'NIO',
  BABA: 'Alibaba', JD: 'JD.com', PDD: 'PDD', SNAP: 'Snap',
  UBER: 'Uber', LYFT: 'Lyft', ABNB: 'Airbnb', COIN: 'Coinbase',
  SHOP: 'Shopify', SQ: 'Block', PYPL: 'PayPal', INTC: 'Intel',
  QCOM: 'Qualcomm', MU: 'Micron', AMAT: 'Applied Materials',
  SPY: 'S&P 500 ETF', QQQ: 'NASDAQ ETF', IWM: 'Russell 2000 ETF',
  GLD: 'Gold ETF', SLV: 'Silver ETF', USO: 'Oil ETF', TLT: 'Bond ETF',
  BAC: 'Bank of America', WFC: 'Wells Fargo', GS: 'Goldman Sachs',
  MS: 'Morgan Stanley', C: 'Citigroup', DIS: 'Disney', CMCSA: 'Comcast',
  T: 'AT&T', VZ: 'Verizon', F: 'Ford', GM: 'General Motors',
  BA: 'Boeing', CAT: 'Caterpillar', DE: 'Deere', RTX: 'RTX Corp',
  CVX: 'Chevron', COP: 'ConocoPhillips', MRO: 'Marathon Oil',
  PFE: 'Pfizer', MRNA: 'Moderna', BMY: 'Bristol-Myers', ABBV: 'AbbVie',
};

/* ── Fixed active-stock pool (sorted by typical dollar volume) ─── */
// Used as fallback/basis for "Most Active" outside market hours
const ACTIVE_POOL = [
  'NVDA','TSLA','AAPL','MSFT','AMZN','META','GOOGL','AMD','PLTR','NFLX',
  'AVGO','JPM','V','BAC','SPY','QQQ','SOFI','COIN','HOOD','MSTR',
];

/* ── Types ────────────────────────────────────────────────────── */
export interface MoverRow {
  rank: number;
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  change: number;
  open: number;
  high: number;
  low: number;
  volume: number;       // shares
  dollarVolume: number; // price × volume
  marketOpen: boolean;  // false = prev close data
}

export interface MoversData {
  gainers: MoverRow[];
  losers: MoverRow[];
  active: MoverRow[];
  marketOpen: boolean;
  fetchedAt: number;
}

interface MassiveSnap {
  ticker: string;
  day?: { c: number; h: number; l: number; o: number; v: number };
  prevDay?: { c: number; h: number; l: number; o: number; v: number };
  todaysChange?: number;
  todaysChangePerc?: number;
}

interface MassiveMoversResponse {
  tickers?: MassiveSnap[];
  status?: string;
}

function snapToRow(snap: MassiveSnap, rank: number): MoverRow {
  const price     = snap.day?.c || snap.prevDay?.c || 0;
  const prevClose = snap.prevDay?.c || price;
  const change    = price && prevClose ? parseFloat((price - prevClose).toFixed(4)) : (snap.todaysChange ?? 0);
  const changePct = price && prevClose ? parseFloat(((change / prevClose) * 100).toFixed(2)) : (snap.todaysChangePerc ?? 0);
  const volume    = snap.day?.v || snap.prevDay?.v || 0;
  const open      = snap.day?.o || snap.prevDay?.o || 0;
  const high      = snap.day?.h || snap.prevDay?.h || 0;
  const low       = snap.day?.l || snap.prevDay?.l || 0;
  const marketOpen = (snap.day?.c ?? 0) > 0;
  return {
    rank,
    symbol: snap.ticker,
    name: NAMES[snap.ticker] ?? snap.ticker,
    price: parseFloat(price.toFixed(2)),
    changePct,
    change: parseFloat(change.toFixed(2)),
    open: parseFloat(open.toFixed(2)),
    high: parseFloat(high.toFixed(2)),
    low: parseFloat(low.toFixed(2)),
    volume,
    dollarVolume: parseFloat((price * volume).toFixed(0)),
    marketOpen,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get('movers');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    // Fetch gainers, losers, and active pool snapshots in parallel
    const [gainersRes, losersRes, activeSnaps] = await Promise.all([
      massiveFetch<MassiveMoversResponse>('/v2/snapshot/locale/us/markets/stocks/gainers'),
      massiveFetch<MassiveMoversResponse>('/v2/snapshot/locale/us/markets/stocks/losers'),
      massiveFetch<{ tickers: MassiveSnap[] }>(
        '/v2/snapshot/locale/us/markets/stocks/tickers',
        { tickers: ACTIVE_POOL.join(',') },
      ),
    ]);

    const gainersRaw = gainersRes.tickers ?? [];
    const losersRaw  = losersRes.tickers ?? [];
    const activeRaw  = activeSnaps.tickers ?? [];

    // During market hours gainers/losers are populated; outside hours they're empty
    // Fall back to active pool sorted by prev-day volume
    const marketOpen = gainersRaw.length > 0;

    const gainers = (gainersRaw.length > 0 ? gainersRaw : activeRaw)
      .filter((s) => s.ticker !== 'SPY' && s.ticker !== 'QQQ') // filter ETFs from gainers
      .slice(0, 10)
      .map((s, i) => snapToRow(s, i + 1));

    const losers = (losersRaw.length > 0 ? losersRaw : [...activeRaw].reverse())
      .filter((s) => s.ticker !== 'SPY' && s.ticker !== 'QQQ')
      .slice(0, 10)
      .map((s, i) => snapToRow(s, i + 1));

    // Most Active = sort by dollar volume (price × volume)
    const active = [...activeRaw]
      .sort((a, b) => {
        const volA = (a.day?.c || a.prevDay?.c || 0) * (a.day?.v || a.prevDay?.v || 0);
        const volB = (b.day?.c || b.prevDay?.c || 0) * (b.day?.v || b.prevDay?.v || 0);
        return volB - volA;
      })
      .slice(0, 10)
      .map((s, i) => snapToRow(s, i + 1));

    const data: MoversData = { gainers, losers, active, marketOpen, fetchedAt: Date.now() };
    cache.set('movers', { data, timestamp: Date.now() });
    return res.status(200).json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: msg });
  }
}
