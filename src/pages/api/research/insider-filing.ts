import type { NextApiRequest, NextApiResponse } from 'next';

// Cache filings for 24h — they never change after filing date
const cache = new Map<string, { data: FilingDetail | null; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

const EDGAR_HEADERS = {
  'User-Agent': 'GR8BUX glorifytgod@gmail.com',
  Accept: '*/*',
};

export interface Transaction {
  type: 'A' | 'D';
  shares: number;
  pricePerShare: number;
  value: number;
  securityTitle: string;
  transactionDate: string;
}

export interface FilingDetail {
  issuerName: string;
  ticker: string;
  reporterName: string;
  role: string;
  transactions: Transaction[];
  totalBuyShares: number;
  totalBuyValue: number;
  totalSellShares: number;
  totalSellValue: number;
  dominantAction: 'BUY' | 'SELL' | 'MIXED' | 'NONE';
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function extractValueTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>\\s*<value>([^<]*)</value>`, 'i'));
  return m ? m[1].trim() : '';
}

function parseForm4XML(xml: string): FilingDetail {
  const issuerName = extractTag(xml, 'issuerName');
  const ticker = extractTag(xml, 'issuerTradingSymbol');
  const reporterName = extractTag(xml, 'rptOwnerName');
  const officerTitle = extractTag(xml, 'officerTitle');

  const isOfficer = /<isOfficer>\s*1\s*<\/isOfficer>/i.test(xml);
  const isDirector = /<isDirector>\s*1\s*<\/isDirector>/i.test(xml);
  const is10Pct = /<isTenPercentOwner>\s*1\s*<\/isTenPercentOwner>/i.test(xml);

  const role = isOfficer
    ? officerTitle || 'Officer'
    : isDirector
    ? 'Director'
    : is10Pct
    ? '10% Owner'
    : 'Insider';

  const txnBlocks =
    xml.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/gi) ?? [];

  const transactions: Transaction[] = [];
  let totalBuyShares = 0, totalBuyValue = 0;
  let totalSellShares = 0, totalSellValue = 0;

  for (const block of txnBlocks) {
    const code = extractValueTag(block, 'transactionAcquiredDisposedCode') as 'A' | 'D' | '';
    if (code !== 'A' && code !== 'D') continue;

    const shares = parseFloat(extractValueTag(block, 'transactionShares')) || 0;
    const price = parseFloat(extractValueTag(block, 'transactionPricePerShare')) || 0;
    const securityTitle = extractValueTag(block, 'securityTitle');
    const transactionDate = extractValueTag(block, 'transactionDate');
    const value = shares * price;

    transactions.push({ type: code, shares, pricePerShare: price, value, securityTitle, transactionDate });

    if (code === 'A') { totalBuyShares += shares; totalBuyValue += value; }
    else { totalSellShares += shares; totalSellValue += value; }
  }

  let dominantAction: FilingDetail['dominantAction'] = 'NONE';
  if (totalBuyShares > 0 && totalSellShares > 0) dominantAction = 'MIXED';
  else if (totalBuyShares > 0) dominantAction = 'BUY';
  else if (totalSellShares > 0) dominantAction = 'SELL';

  return {
    issuerName, ticker, reporterName, role, transactions,
    totalBuyShares, totalBuyValue, totalSellShares, totalSellValue, dominantAction,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const accessionNumber = (req.query.acc as string)?.trim();
  const entityId = (req.query.cik as string)?.trim();

  if (!accessionNumber || !entityId) {
    return res.status(400).json({ error: 'acc and cik are required' });
  }

  const cacheKey = `filing:${accessionNumber}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    if (cached.data === null) return res.status(404).json({ error: 'Filing not found' });
    return res.status(200).json(cached.data);
  }

  try {
    // Step 1: Find the primary XML document via the reporter's submissions JSON
    const paddedCIK = entityId.padStart(10, '0');
    let primaryDocument: string | null = null;

    const subResp = await fetch(
      `https://data.sec.gov/submissions/CIK${paddedCIK}.json`,
      { headers: EDGAR_HEADERS }
    );

    if (subResp.ok) {
      const sub = await subResp.json();
      const recent = sub.filings?.recent;
      if (Array.isArray(recent?.accessionNumber) && Array.isArray(recent?.primaryDocument)) {
        const idx = (recent.accessionNumber as string[]).indexOf(accessionNumber);
        if (idx !== -1) primaryDocument = (recent.primaryDocument as string[])[idx] ?? null;
      }
    }

    // Step 2: Derive the filer CIK (first segment of accession number encodes the filer)
    const filerCIK = String(parseInt(accessionNumber.split('-')[0], 10));
    const accNoDash = accessionNumber.replace(/-/g, '');

    // Step 3: Fetch XML — try primary document first, then common fallback names
    const filesToTry = primaryDocument
      ? [primaryDocument, 'form4.xml']
      : ['form4.xml', `${accNoDash}.xml`];

    let xmlText: string | null = null;

    for (const filename of filesToTry) {
      const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${filerCIK}/${accNoDash}/${filename}`;
      const xmlResp = await fetch(xmlUrl, { headers: EDGAR_HEADERS });
      if (xmlResp.ok) {
        const ct = xmlResp.headers.get('content-type') ?? '';
        if (ct.includes('xml') || ct.includes('text') || ct.includes('octet')) {
          const text = await xmlResp.text();
          // Sanity check: must look like a Form 4
          if (text.includes('ownershipDocument') || text.includes('issuerName')) {
            xmlText = text;
            break;
          }
        }
      }
    }

    if (!xmlText) {
      cache.set(cacheKey, { data: null, timestamp: Date.now() });
      return res.status(404).json({ error: 'Filing XML not found' });
    }

    const detail = parseForm4XML(xmlText);
    cache.set(cacheKey, { data: detail, timestamp: Date.now() });
    return res.status(200).json(detail);
  } catch (err) {
    console.error('[insider-filing]', err);
    return res.status(500).json({ error: 'Failed to parse filing' });
  }
}
