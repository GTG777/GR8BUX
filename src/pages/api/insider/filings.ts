import type { NextApiRequest, NextApiResponse } from 'next';

const cache = new Map<string, { data: InsiderData; timestamp: number }>();
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours — insider data moves slowly

// SEC requires a User-Agent with contact info to avoid rate-limiting
const SEC_HEADERS = {
  'User-Agent': 'Gr8bux Trading App contact@gr8bux.com',
  Accept: 'application/json, text/html, application/xml',
};

/* ── Transaction code semantics ────────────────────────────────── */
const TX_TYPE_MAP: Record<string, InsiderTransaction['type']> = {
  P: 'buy',    // open market purchase — strongest bullish signal
  S: 'sell',   // open market sale
  D: 'sell',   // sale/disposition (often 10b5-1 plan)
  A: 'grant',  // award / RSU grant
  F: 'other',  // tax withholding on vesting (forced sale, not bearish)
  G: 'other',  // gift
  M: 'other',  // option exercise (in-the-money, not directional)
  X: 'other',  // option exercise (out-of-the-money)
  I: 'other',  // discretionary
  W: 'other',  // will / inheritance
  C: 'other',  // conversion
  J: 'other',  // other acquisition or disposition
  K: 'other',  // equity swap
  L: 'other',  // small acquisition exception
  Z: 'other',  // trust acquisition or disposition
};

const TX_CODE_LABEL: Record<string, string> = {
  P: 'Open Market Buy',
  S: 'Open Market Sell',
  D: 'Planned Sell (10b5-1)',
  A: 'Grant / Award',
  F: 'Tax Withholding',
  G: 'Gift',
  M: 'Option Exercise',
  X: 'Option Exercise (OTM)',
};

/* ── Exported types ─────────────────────────────────────────────── */
export interface InsiderTransaction {
  security: string;
  date: string;
  code: string;
  label: string;
  type: 'buy' | 'sell' | 'grant' | 'other';
  shares: number;
  pricePerShare: number;
  totalValue: number;
}

export interface InsiderFiling {
  fileDate: string;
  periodDate: string;
  reporterName: string;
  isDirector: boolean;
  isOfficer: boolean;
  officerTitle: string;
  role: string;            // computed display string
  transactions: InsiderTransaction[];
}

export interface InsiderSummary {
  openMarketBuys: number;       // count of P transactions
  openMarketSells: number;      // count of S+D transactions
  totalBuyShares: number;
  totalSellShares: number;
  totalBuyValue: number;
  totalSellValue: number;
  grants: number;               // count of A (RSU/option awards)
  sentiment: 'bullish' | 'bearish' | 'neutral';
  verdict: string;
  period: string;               // e.g. "last 90 days"
}

export interface InsiderData {
  symbol: string;
  filings: InsiderFiling[];
  summary: InsiderSummary;
  fetchedAt: string;
}

/* ── Helpers ────────────────────────────────────────────────────── */
function parseNum(v: string): number {
  return parseFloat(v.replace(/,/g, '')) || 0;
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Extract a simple tag value — handles bare and <value>-wrapped formats. */
function tag(xml: string, name: string): string {
  // Handles: <name>VALUE</name> and <name><value>VALUE</value>...
  const m = xml.match(new RegExp(`<${name}>\\s*(?:<value>)?([^<]+?)(?:</value>)?\\s*<`, 's'));
  return m ? m[1].trim() : '';
}

/** Parse a single <nonDerivativeTransaction> block. */
function parseNDTx(block: string): InsiderTransaction | null {
  const security = tag(block, 'securityTitle') || 'Common Stock';
  const date     = tag(block, 'transactionDate');

  // Transaction code — no <value> wrapper in recent schemas
  const codeM = block.match(/<transactionCode>([A-Z])<\/transactionCode>/)
             ?? block.match(/<transactionCode>\s*<value>([A-Z])<\/value>/);
  const code = codeM?.[1] ?? '';
  if (!code) return null;

  const sharesM = block.match(/<transactionShares>\s*<value>([\d,.-]+)<\/value>/);
  const shares  = sharesM ? Math.abs(parseNum(sharesM[1])) : 0;
  if (shares <= 0) return null;

  const priceM        = block.match(/<transactionPricePerShare>\s*<value>([\d,.]+)<\/value>/);
  const pricePerShare = priceM ? parseNum(priceM[1]) : 0;

  const type  = TX_TYPE_MAP[code] ?? 'other';
  const label = TX_CODE_LABEL[code] ?? `Code ${code}`;

  return {
    security, date, code, label, type, shares,
    pricePerShare,
    totalValue: shares * pricePerShare,
  };
}

/** Parse a Form 4 XML string into a structured filing. */
function parseForm4(xml: string, fileDate: string, periodDate: string): InsiderFiling | null {
  // Reporter info
  const ownBlock = xml.match(/<reportingOwner>([\s\S]+?)<\/reportingOwner>/)?.[1] ?? '';
  if (!ownBlock) return null;

  const reporterName = (ownBlock.match(/<rptOwnerName>([^<]+)<\/rptOwnerName>/) ?? [])[1]?.trim() ?? 'Unknown';
  const isDirector   = (ownBlock.match(/<isDirector>([01])<\/isDirector>/) ?? [])[1] === '1';
  const isOfficer    = (ownBlock.match(/<isOfficer>([01])<\/isOfficer>/) ?? [])[1] === '1';
  const officerTitle = (ownBlock.match(/<officerTitle>([^<]*)<\/officerTitle>/) ?? [])[1]?.trim() ?? '';

  let role = '';
  if (isOfficer && officerTitle) role = officerTitle;
  else if (isDirector && isOfficer) role = 'Director & Officer';
  else if (isDirector) role = 'Director';
  else if (isOfficer) role = 'Officer';
  else role = '10% Owner';

  // Non-derivative transactions (common stock)
  const ndBlocks = xml.match(/<nonDerivativeTransaction>([\s\S]+?)<\/nonDerivativeTransaction>/g) ?? [];
  const transactions: InsiderTransaction[] = [];
  for (const block of ndBlocks) {
    const tx = parseNDTx(block);
    if (tx) transactions.push(tx);
  }

  if (transactions.length === 0) return null; // skip filings with no reportable transactions

  return { fileDate, periodDate, reporterName, isDirector, isOfficer, officerTitle, role, transactions };
}

/** Fetch a single XML filing from SEC EDGAR, return text or null on failure. */
async function fetchXML(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/* ── Main handler ───────────────────────────────────────────────── */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const symbol = (req.query.symbol as string)?.toUpperCase().trim();
  if (!symbol || !/^[A-Z]{1,10}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol.' });
  }

  const cacheKey = `insider:${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    /* ── 1. Search EDGAR EFTS for recent Form 4 filings ── */
    const startdt = dateNDaysAgo(90);
    const searchUrl =
      `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22` +
      `&forms=4&dateRange=custom&startdt=${startdt}&hits.hits.total=true`;

    const searchRes = await fetch(searchUrl, { headers: SEC_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!searchRes.ok) {
      return res.status(searchRes.status).json({ error: 'EDGAR search failed' });
    }

    const searchJson = await searchRes.json();
    const hits: Array<{
      _id: string;
      _source: { file_date: string; period_ending: string; ciks: string[]; display_names: string[] };
    }> = searchJson?.hits?.hits ?? [];

    if (hits.length === 0) {
      const empty = buildEmptyResult(symbol);
      cache.set(cacheKey, { data: empty, timestamp: Date.now() });
      return res.status(200).json(empty);
    }

    /* ── 2. Determine issuer CIK from entity aggregations ── */
    const entityBuckets: Array<{ key: string; doc_count: number }> =
      searchJson?.aggregations?.entity_filter?.buckets ?? [];
    // Company has the highest doc_count (appears as issuer in every filing)
    const topEntity = entityBuckets.sort((a, b) => b.doc_count - a.doc_count)[0];
    const cikMatch  = topEntity?.key?.match(/\(CIK\s+(\d+)\)/);
    const issuerCIK = cikMatch ? cikMatch[1].replace(/^0+/, '') : ''; // strip leading zeros

    if (!issuerCIK) {
      const empty = buildEmptyResult(symbol);
      cache.set(cacheKey, { data: empty, timestamp: Date.now() });
      return res.status(200).json(empty);
    }

    /* ── 3. Sort by date, take up to 12 most recent filings ── */
    const sorted = [...hits]
      .sort((a, b) => b._source.file_date.localeCompare(a._source.file_date))
      .slice(0, 12);

    /* ── 4. Build XML URLs from _id field ── */
    interface FilingMeta { url: string; fileDate: string; periodDate: string }
    const filingMetas: FilingMeta[] = sorted.map((h) => {
      const [rawAccession, filename] = h._id.split(':');
      const accNorm = rawAccession.replace(/-/g, '');
      return {
        url: `https://www.sec.gov/Archives/edgar/data/${issuerCIK}/${accNorm}/${filename}`,
        fileDate:   h._source.file_date,
        periodDate: h._source.period_ending ?? h._source.file_date,
      };
    }).filter((m) => m.url.endsWith('.xml'));

    /* ── 5. Fetch XMLs in parallel (max 8) ── */
    const xmlResults = await Promise.all(
      filingMetas.slice(0, 8).map((m) => fetchXML(m.url).then((xml) => ({ ...m, xml })))
    );

    /* ── 6. Parse filings ── */
    const filings: InsiderFiling[] = [];
    for (const { xml, fileDate, periodDate } of xmlResults) {
      if (!xml) continue;
      const filing = parseForm4(xml, fileDate, periodDate);
      if (filing) filings.push(filing);
    }

    /* ── 7. Aggregate summary ── */
    const allTx = filings.flatMap((f) => f.transactions);

    const buys  = allTx.filter((t) => t.type === 'buy');
    const sells = allTx.filter((t) => t.type === 'sell');
    const grants = allTx.filter((t) => t.type === 'grant').length;

    const totalBuyShares  = buys.reduce((s, t) => s + t.shares, 0);
    const totalSellShares = sells.reduce((s, t) => s + t.shares, 0);
    const totalBuyValue   = buys.reduce((s, t) => s + t.totalValue, 0);
    const totalSellValue  = sells.reduce((s, t) => s + t.totalValue, 0);

    let sentiment: InsiderSummary['sentiment'] = 'neutral';
    let verdict = 'No open-market transactions in the last 90 days.';

    const buyCount  = buys.length;
    const sellCount = sells.length;

    if (buyCount > 0 || sellCount > 0) {
      if (buyCount > 0 && sellCount === 0) {
        sentiment = 'bullish';
        verdict = `Pure buying signal — ${buyCount} open-market purchase${buyCount > 1 ? 's' : ''} with no sales. Insiders put real money in at market prices.`;
      } else if (sellCount > 0 && buyCount === 0) {
        sentiment = 'bearish';
        verdict = `Only selling activity — ${sellCount} open-market sale${sellCount > 1 ? 's' : ''} in the last 90 days. Note: sales can reflect personal needs, not necessarily bearish views.`;
      } else if (buyCount >= sellCount) {
        sentiment = 'bullish';
        verdict = `More buying than selling (${buyCount} buys vs ${sellCount} sells). Net insider accumulation is a constructive signal.`;
      } else {
        sentiment = 'bearish';
        verdict = `More selling than buying (${sellCount} sells vs ${buyCount} buys). Elevated insider selling warrants attention.`;
      }
    } else if (grants > 0) {
      verdict = `${grants} RSU/option grant${grants > 1 ? 's' : ''} reported. No open-market directional activity — grants are scheduled compensation, not predictive.`;
    }

    const summary: InsiderSummary = {
      openMarketBuys: buyCount,
      openMarketSells: sellCount,
      totalBuyShares, totalSellShares,
      totalBuyValue, totalSellValue,
      grants, sentiment, verdict,
      period: 'last 90 days',
    };

    const data: InsiderData = {
      symbol,
      filings: filings.slice(0, 10), // cap display at 10
      summary,
      fetchedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, { data, timestamp: Date.now() });
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: 'Failed to fetch insider data' });
  }
}

function buildEmptyResult(symbol: string): InsiderData {
  return {
    symbol, filings: [],
    summary: {
      openMarketBuys: 0, openMarketSells: 0,
      totalBuyShares: 0, totalSellShares: 0,
      totalBuyValue: 0, totalSellValue: 0,
      grants: 0, sentiment: 'neutral',
      verdict: 'No Form 4 filings found in the last 90 days.',
      period: 'last 90 days',
    },
    fetchedAt: new Date().toISOString(),
  };
}
