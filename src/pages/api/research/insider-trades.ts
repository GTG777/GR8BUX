import type { NextApiRequest, NextApiResponse } from 'next';

const cache = new Map<string, { data: InsiderTradesResponse; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000;

const EDGAR_HEADERS = {
  'User-Agent': 'GR8BUX glorifytgod@gmail.com',
  Accept: 'application/json',
};

// Map common tickers to EDGAR-searchable company name fragments
const TICKER_MAP: Record<string, string> = {
  AAPL: 'Apple Inc',
  MSFT: 'Microsoft',
  NVDA: 'NVIDIA',
  META: 'Meta Platforms',
  AMZN: 'Amazon',
  TSLA: 'Tesla',
  GOOGL: 'Alphabet',
  GOOG: 'Alphabet',
  NFLX: 'Netflix',
  AMD: 'Advanced Micro',
  INTC: 'Intel',
  CRM: 'Salesforce',
  PLTR: 'Palantir',
  COIN: 'Coinbase',
  HOOD: 'Robinhood',
  GME: 'GameStop',
  PYPL: 'PayPal',
  SQ: 'Block Inc',
  SNAP: 'Snap Inc',
  UBER: 'Uber',
  LYFT: 'Lyft',
  SPOT: 'Spotify',
};

export interface InsiderFiling {
  accessionNumber: string;
  reporterName: string;
  filedDate: string;
  periodDate: string;
  formType: string;
  entityId: string;
  edgarUrl: string;
  filingIndexUrl: string;
}

export interface InsiderTradesResponse {
  filings: InsiderFiling[];
  total: number;
  query: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const days = Math.min(Number(req.query.days) || 7, 90);
  const rawQuery = ((req.query.q as string) || '').trim().toUpperCase();

  // Resolve ticker → company name if applicable
  const searchQuery = TICKER_MAP[rawQuery] || rawQuery.replace(/"/g, '');

  const cacheKey = `insider:${days}:${searchQuery}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().split('T')[0];

    const q = searchQuery ? encodeURIComponent(`"${searchQuery}"`) : '';
    const url =
      `https://efts.sec.gov/LATEST/search-index?q=${q}&forms=4` +
      `&dateRange=custom&startdt=${startStr}`;

    const resp = await fetch(url, { headers: EDGAR_HEADERS });
    if (!resp.ok) {
      throw new Error(`EDGAR EFTS ${resp.status}: ${await resp.text().catch(() => '')}`);
    }
    const json = await resp.json();

    const filings: InsiderFiling[] = (json.hits?.hits ?? []).map((hit: any) => {
      const src = hit._source ?? {};
      const accNum: string = hit._id ?? '';
      const cik: string = src.entity_id ?? '';
      const accNoDash = accNum.replace(/-/g, '');

      return {
        accessionNumber: accNum,
        reporterName: (src.entity_name as string | undefined)?.trim() ?? 'Unknown',
        filedDate: (src.file_date as string | undefined) ?? '',
        periodDate: (src.period_of_report as string | undefined) ?? '',
        formType: (src.form_type as string | undefined) ?? '4',
        entityId: cik,
        edgarUrl: cik
          ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=10`
          : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=4&dateb=&owner=include&count=10`,
        filingIndexUrl: cik && accNoDash
          ? `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDash}/${accNum}-index.htm`
          : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=4`,
      };
    });

    const data: InsiderTradesResponse = {
      filings,
      total: (json.hits?.total?.value as number | undefined) ?? 0,
      query: searchQuery,
    };

    cache.set(cacheKey, { data, timestamp: Date.now() });
    return res.status(200).json(data);
  } catch (err) {
    console.error('[insider-trades]', err);
    return res.status(500).json({ error: 'Failed to fetch insider trade data from EDGAR' });
  }
}
