import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import type { ApiResponse } from '@/types';
import type { CoachChatMessage } from '@/types/agents';

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse<unknown>>) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return res.status(500).json({ success: false, error: 'DB not configured' });

  // ── GET: load session ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('coach_sessions')
      .select('messages')
      .eq('user_id', user.id)
      .maybeSingle();

    // Gracefully handle missing table (migration not yet run) — return empty
    if (error) {
      console.warn('[coach-session GET]', error.message);
      return res.status(200).json({ success: true, data: { messages: [] } });
    }

    return res.status(200).json({
      success: true,
      data: { messages: (data?.messages as CoachChatMessage[]) ?? [] },
    });
  }

  // ── PUT: save session ──────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { messages } = req.body as { messages: CoachChatMessage[] };
    if (!Array.isArray(messages)) {
      return res.status(400).json({ success: false, error: 'messages must be an array' });
    }

    // Keep only the last 100 messages to cap storage
    const trimmed = messages.slice(-100);

    const { error } = await supabase
      .from('coach_sessions')
      .upsert(
        { user_id: user.id, messages: trimmed, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.warn('[coach-session PUT]', error.message);
      // Silently succeed so the panel doesn't surface an error to the user
      return res.status(200).json({ success: true, data: null });
    }

    return res.status(200).json({ success: true, data: null });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
