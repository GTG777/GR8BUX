import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient, getSupabaseClient } from '@/lib/supabase';

interface ApiResponse {
  success: boolean;
  data?: { id: string; status: string };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.query as { id: string };
  const { status } = req.body as { status?: string };

  if (!status || !['new', 'reviewed', 'resolved'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status value' });
  }

  const supabase = getSupabaseServiceRoleClient() || getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' });
  }

  // Verify admin
  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userRow || userRow.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const { data, error } = await supabase
    .from('feedback')
    .update({ status })
    .eq('id', id)
    .select('id, status')
    .single();

  if (error) {
    console.error('[Feedback API] update error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update status' });
  }

  return res.status(200).json({ success: true, data });
}
