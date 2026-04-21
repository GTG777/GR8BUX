/**
 * POST /api/rag/embed-trade
 *
 * Generate and store an embedding for a closed trade.
 * Called automatically after a trade is closed/updated.
 * Also accepts a backfill flag to embed all of a user's closed trades.
 *
 * Body: { tradeId } or { backfill: true }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { embedTrade, backfillUserEmbeddings, TradeRecord } from '@/lib/ragEmbeddings';

interface ApiResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { tradeId, backfill } = req.body as { tradeId?: string; backfill?: boolean };

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' });
  }

  // ── Backfill: embed all closed trades for this user ──
  if (backfill) {
    try {
      const result = await backfillUserEmbeddings(user.id);
      return res.status(200).json({
        success: true,
        message: `Embedded ${result.embedded} trades, skipped ${result.skipped}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Backfill error';
      return res.status(500).json({ success: false, error: msg });
    }
  }

  // ── Single trade embed ──
  if (!tradeId) {
    return res.status(400).json({ success: false, error: 'tradeId is required' });
  }

  // Fetch the trade (must belong to this user)
  const { data: trade, error: fetchError } = await supabase
    .from('trades')
    .select('*')
    .eq('id', tradeId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !trade) {
    return res.status(404).json({ success: false, error: 'Trade not found' });
  }

  if (trade.status !== 'closed') {
    return res.status(200).json({ success: true, message: 'Trade is not closed yet — skipping embed' });
  }

  try {
    await embedTrade(trade as TradeRecord);
    return res.status(200).json({ success: true, message: 'Trade embedded successfully' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Embedding error';
    console.error('[embed-trade]', err);
    return res.status(500).json({ success: false, error: msg });
  }
}
