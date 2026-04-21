/**
 * POST /api/chat/coach
 *
 * RAG-powered personal trading coach.
 * Retrieves semantically similar past trades via pgvector,
 * then uses Claude to give personalized, evidence-based coaching.
 *
 * Body:
 *   { query, currentTrade?, history? }
 *
 * Returns:
 *   { reply, similarTrades, patterns, suggestedActions }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient, getSupabaseClient } from '@/lib/supabase';
import { getCoachAgent } from '@/lib/agents/coachAgent';
import type { CoachResponse } from '@/lib/agents/coachAgent';

interface ApiResponse {
  success: boolean;
  data?: CoachResponse;
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { query, currentTrade, history } = req.body as {
    query?: string;
    currentTrade?: Record<string, unknown>;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!query || typeof query !== 'string' || query.trim().length < 3) {
    return res.status(400).json({ success: false, error: 'Query is required' });
  }

  // Enforce safe history size (last 10 messages max)
  const safeHistory = (history ?? []).slice(-10);

  try {
    const coach = getCoachAgent();
    const result = await coach.coach({
      userId: user.id,
      userQuery: query.trim(),
      currentTrade: currentTrade as CoachResponse['similarTrades'][0] | undefined,
      history: safeHistory,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Coach agent error';
    console.error('[Coach API]', err);
    return res.status(500).json({ success: false, error: message });
  }
}
