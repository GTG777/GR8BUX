import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const cache = new Map<string, { data: OnWatchRow[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export interface OnWatchRow {
  rank: number;
  symbol: string;
  company: string;
  price: number;
  changePct: number;
  gapPct: number;
  volume: number;
  avgVolume20d: number;
  rsi: number;
  signalType: 'earnings_today' | 'earnings_tomorrow' | 'vol_surge' | 'earnings_vol_combo';
  reportDate: string | null;
  hv20: number | null;
  epsBeatStreak: number | null;
  avgSurprisePct: number | null;
  volRatio: number;
  setupType: string;
  entry: number;
  stop: number;
  target: number;
  rr: string;
  score: number;
  reason: string;
  scannedAt: string;
}

export interface OnWatchResponse {
  setups: OnWatchRow[];
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
  res: NextApiResponse<OnWatchResponse | { error: string }>,
) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cached = cache.get('onwatch');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    const scannedAt = cached.data[0]?.scannedAt ?? null;
    const stale = scannedAt ? Date.now() - new Date(scannedAt).getTime() > 20 * 60 * 1000 : true;
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json({ setups: cached.data, scannedAt, stale });
  }

  try {
    const supabase = getSupabase();

    // Get latest batch
    const { data: latest, error: latestErr } = await supabase
      .from('on_watch_setups')
      .select('batch_id')
      .order('scanned_at', { ascending: false })
      .limit(1)
      .single();

    if (latestErr || !latest) {
      return res.status(200).json({ setups: [], scannedAt: null, stale: true });
    }

    const { data: rows, error: rowsErr } = await supabase
      .from('on_watch_setups')
      .select('*')
      .eq('batch_id', latest.batch_id)
      .order('rank', { ascending: true });

    if (rowsErr) throw new Error(rowsErr.message);

    const setups: OnWatchRow[] = (rows ?? []).map(r => ({
      rank:           r.rank,
      symbol:         r.symbol,
      company:        r.company,
      price:          parseFloat(r.price),
      changePct:      parseFloat(r.change_pct),
      gapPct:         parseFloat(r.gap_pct ?? 0),
      volume:         r.volume,
      avgVolume20d:   r.avg_volume_20d,
      rsi:            parseFloat(r.rsi),
      signalType:     r.signal_type,
      reportDate:     r.report_date,
      hv20:           r.hv20 != null ? parseFloat(r.hv20) : null,
      epsBeatStreak:  r.eps_beat_streak,
      avgSurprisePct: r.avg_surprise_pct != null ? parseFloat(r.avg_surprise_pct) : null,
      volRatio:       parseFloat(r.vol_ratio ?? 1),
      setupType:      r.setup_type,
      entry:          parseFloat(r.entry),
      stop:           parseFloat(r.stop),
      target:         parseFloat(r.target),
      rr:             r.rr,
      score:          r.score,
      reason:         r.reason,
      scannedAt:      r.scanned_at,
    }));

    cache.set('onwatch', { data: setups, timestamp: Date.now() });

    const scannedAt = setups[0]?.scannedAt ?? null;
    const stale = scannedAt ? Date.now() - new Date(scannedAt).getTime() > 20 * 60 * 1000 : true;

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.status(200).json({ setups, scannedAt, stale });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/market/onwatch]', message);
    return res.status(500).json({ error: message });
  }
}
