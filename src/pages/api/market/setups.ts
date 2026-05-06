import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Cache for 5 minutes — the background scanner refreshes every 15 min
const cache = new Map<string, { data: SetupRow[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export interface SetupRow {
  rank: number;
  symbol: string;
  company: string;
  sector: string | null;
  price: number;
  changePct: number;
  gapPct: number;
  catalyst: string;
  catalystDetail: string;
  setupType: string;
  entry: number;
  stop: number;
  target: number;
  rr: string;
  score: number;
  reason: string;
  scannedAt: string;
}

export interface SetupsResponse {
  setups: SetupRow[];
  scannedAt: string | null;
  stale: boolean; // true if last scan is > 20 min old
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SetupsResponse | { error: string }>,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // In-memory cache
  const cached = cache.get('setups');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    const scannedAt = cached.data[0]?.scannedAt ?? null;
    const stale = scannedAt ? Date.now() - new Date(scannedAt).getTime() > 20 * 60 * 1000 : true;
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json({ setups: cached.data, scannedAt, stale });
  }

  try {
    const supabase = getSupabase();

    // Get the most recent batch_id, then return all rows from that batch
    const { data: latest, error: latestErr } = await supabase
      .from('morning_setups')
      .select('batch_id, scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(1)
      .single();

    if (latestErr || !latest) {
      // No data yet — return empty (scanner hasn't run yet)
      return res.status(200).json({ setups: [], scannedAt: null, stale: true });
    }

    const { data: rows, error: rowsErr } = await supabase
      .from('morning_setups')
      .select('*')
      .eq('batch_id', latest.batch_id)
      .order('rank', { ascending: true });

    if (rowsErr) throw rowsErr;

    const setups: SetupRow[] = (rows ?? []).map((r) => ({
      rank:           r.rank,
      symbol:         r.symbol,
      company:        r.company,
      sector:         r.sector ?? null,
      price:          Number(r.price ?? 0),
      changePct:      Number(r.change_pct ?? 0),
      gapPct:         Number(r.gap_pct ?? 0),
      catalyst:       r.catalyst ?? 'Technical',
      catalystDetail: r.catalyst_detail ?? '',
      setupType:      r.setup_type ?? 'Breakout',
      entry:          Number(r.entry ?? 0),
      stop:           Number(r.stop ?? 0),
      target:         Number(r.target ?? 0),
      rr:             r.rr ?? '1:2',
      score:          Number(r.score ?? 0),
      reason:         r.reason ?? '',
      scannedAt:      r.scanned_at,
    }));

    cache.set('setups', { data: setups, timestamp: Date.now() });

    const scannedAt = latest.scanned_at as string;
    const stale = Date.now() - new Date(scannedAt).getTime() > 20 * 60 * 1000;

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json({ setups, scannedAt, stale });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/market/setups]', message);
    return res.status(500).json({ error: message });
  }
}
