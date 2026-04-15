import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient } from '@/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { symbol, setupType = 'LEAPS_CANDIDATE' } = req.query;

  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ success: false, error: 'symbol is required' });
  }

  const supabase = getSupabaseClient();
  if (!supabase) return res.status(200).json({ success: false });

  const { data, error } = await supabase
    .from('ai_analyses')
    .select('result, refreshed_at, consensus, confidence')
    .eq('symbol', symbol.toUpperCase())
    .eq('setup_type', typeof setupType === 'string' ? setupType : 'LEAPS_CANDIDATE')
    .single();

  if (error || !data) return res.status(200).json({ success: false });

  return res.status(200).json({
    success: true,
    data: data.result,
    refreshedAt: data.refreshed_at,
  });
}
