import type { NextApiRequest, NextApiResponse } from 'next';

let cache: { tickers: string[]; fetchedAt: number } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000;

function parseTickersFromWikipediaHtml(html: string): string[] {
  const start = html.indexOf('id="constituents"');
  if (start < 0) throw new Error('S&P 500 constituents table not found');
  const sub = html.slice(start);
  const end = sub.indexOf('</table>');
  if (end < 0) throw new Error('S&P 500 constituents table end not found');
  const table = sub.slice(0, end);

  const rx = /<tr>\s*<td>\s*<a[^>]*>([A-Z.]{1,8})<\/a>\s*<\/td>/gms;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(table))) out.push(m[1]);

  // Unique + stable sort (A..Z)
  return Array.from(new Set(out)).sort();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return res.status(200).json({ success: true, source: 'wikipedia', fetchedAt: cache.fetchedAt, tickers: cache.tickers });
  }

  try {
    const url = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies';
    const r = await fetch(url, { headers: { Accept: 'text/html' } });
    if (!r.ok) throw new Error(`Failed to fetch S&P 500 list (${r.status})`);
    const html = await r.text();
    const tickers = parseTickersFromWikipediaHtml(html);

    cache = { tickers, fetchedAt: Date.now() };
    return res.status(200).json({ success: true, source: 'wikipedia', fetchedAt: cache.fetchedAt, tickers: cache.tickers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return res.status(500).json({ success: false, error: msg });
  }
}

