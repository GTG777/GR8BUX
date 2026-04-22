import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServiceRoleClient, getSupabaseClient } from '@/lib/supabase';
import { ApiResponse } from '@/types';
import { requireAuth } from '@/lib/apiAuth';

/**
 * DELETE /api/trades/delete-all
 * Deletes ALL trades (and cascaded child rows) for the authenticated user.
 * Returns { deleted: number }.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<{ deleted: number }>>
) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const supabase = getSupabaseServiceRoleClient() || getSupabaseClient()!;
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' });
  }

  // Count first so we can report back
  const { count, error: countErr } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (countErr) {
    return res.status(500).json({ success: false, error: countErr.message });
  }

  const { error: deleteErr } = await supabase
    .from('trades')
    .delete()
    .eq('user_id', user.id);

  if (deleteErr) {
    return res.status(500).json({ success: false, error: deleteErr.message });
  }

  return res.status(200).json({ success: true, data: { deleted: count ?? 0 } });
}
