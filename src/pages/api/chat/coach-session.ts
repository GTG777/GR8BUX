import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { generateText } from '@/lib/openaiResponses';
import type { ApiResponse } from '@/types';
import type { CoachChatMessage } from '@/types/agents';

const SUMMARY_THRESHOLD = 8; // compress history once it exceeds this many messages

async function buildHistorySummary(messages: CoachChatMessage[]): Promise<string> {
  const transcript = messages
    .slice(-SUMMARY_THRESHOLD)
    .map((m) => `${m.role === 'user' ? 'Trader' : 'Coach'}: ${m.content.slice(0, 300)}`)
    .join('\n');

  const { text } = await generateText({
    model: 'gpt-4.1-nano',
    maxOutputTokens: 120,
    temperature: 0.3,
    instructions: 'Summarize this trading coach conversation in 2 sentences, capturing the key topics discussed and any conclusions reached. Be concise.',
    messages: [{ role: 'user', content: transcript }],
  });
  return text.trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse<unknown>>) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return res.status(500).json({ success: false, error: 'DB not configured' });

  // ── GET: load session ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('coach_sessions')
      .select('messages, history_summary')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[coach-session GET]', error.message);
      return res.status(200).json({ success: true, data: { messages: [], historySummary: null } });
    }

    return res.status(200).json({
      success: true,
      data: {
        messages: (data?.messages as CoachChatMessage[]) ?? [],
        historySummary: (data as any)?.history_summary ?? null,
      },
    });
  }

  // ── PUT: save session ──────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { messages } = req.body as { messages: CoachChatMessage[] };
    if (!Array.isArray(messages)) {
      return res.status(400).json({ success: false, error: 'messages must be an array' });
    }

    const trimmed = messages.slice(-100);

    // When conversation grows long, compress history into a rolling summary
    let historySummary: string | undefined;
    if (trimmed.length >= SUMMARY_THRESHOLD) {
      try {
        historySummary = await buildHistorySummary(trimmed);
      } catch {
        // Non-fatal — summary generation failure doesn't block saving
      }
    }

    const upsertPayload: Record<string, unknown> = {
      user_id: user.id,
      messages: trimmed,
      updated_at: new Date().toISOString(),
    };
    if (historySummary) upsertPayload.history_summary = historySummary;

    const { error } = await supabase
      .from('coach_sessions')
      .upsert(upsertPayload, { onConflict: 'user_id' });

    if (error) {
      console.warn('[coach-session PUT]', error.message);
      return res.status(200).json({ success: true, data: null });
    }

    return res.status(200).json({ success: true, data: null });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
