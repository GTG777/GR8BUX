import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const cache = new Map<string, { data: PreBreakoutRow[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export interface PreBreakoutRow {
  rank: number;
  symbol: string;
  company: string;
  price: number;
  changePct: number;
  gapPct: number;
  volume: number;
  avgVolume20d: number;
  rsi: number;
  atrRatio: number;
  distFromHigh: number;
  signals: string[];
  setupType: string;
  entry: number;
  stop: number;
  target: number;
  rr: string;
  score: number;
  reason: string;
  scannedAt: string;
}

export interface PreBreakoutResponse {
  setups: PreBreakoutRow[];
  scannedAt: string | null;
  stale: boolean;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PreBreakoutResponse | { error: string }>,
) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get('prebreakout');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    const scannedAt = cached.data[0]?.scannedAt ?? null;
    const stale = scannedAt ? Date.now() - new Date(scannedAt).getTime() > 20 * 60 * 1000 : true;
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json({ setups: cached.data, scannedAt, stale });
  }

  try {
    const supabase = getSupabase();

    const { data: latest, error: latestErr } = await supabase
      .from('pre_breakout_setups')
      .select('batch_id, scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(1)
      .single();

    if (latestErr || !latest) {
      return res.status(200).json({ setups: [], scannedAt: null, stale: true });
    }

    const { data: rows, error: rowsErr } = await supabase
      .from('pre_breakout_setups')
      .select('*')
      .eq('batch_id', latest.batch_id)
      .order('rank', { ascending: true });

    if (rowsErr) throw rowsErr;

    const setups: PreBreakoutRow[] = (rows ?? []).map((r) => ({
      rank:         r.rank,
      symbol:       r.symbol,
      company:      r.company,
      price:        Number(r.price ?? 0),
      changePct:    Number(r.change_pct ?? 0),
      gapPct:       Number(r.gap_pct ?? 0),
      volume:       Number(r.volume ?? 0),
      avgVolume20d: Number(r.avg_volume_20d ?? 0),
      rsi:          Number(r.rsi ?? 50),
      atrRatio:     Number(r.atr_ratio ?? 1),
      distFromHigh: Number(r.dist_from_high ?? 0),
      signals:      r.signals ?? [],
      setupType:    r.setup_type ?? 'Compression',
      entry:        Number(r.entry ?? 0),
      stop:         Number(r.stop ?? 0),
      target:       Number(r.target ?? 0),
      rr:           r.rr ?? '1:3',
      score:        Number(r.score ?? 0),
      reason:       r.reason ?? '',
      scannedAt:    r.scanned_at,
    }));

    cache.set('prebreakout', { data: setups, timestamp: Date.now() });

    const scannedAt = latest.scanned_at as string;
    const stale = Date.now() - new Date(scannedAt).getTime() > 20 * 60 * 1000;

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json({ setups, scannedAt, stale });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[api/market/prebreakout]', message);
    return res.status(500).json({ error: message });
  }
}
