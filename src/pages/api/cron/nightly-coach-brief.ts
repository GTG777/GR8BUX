/**
 * GET /api/cron/nightly-coach-brief
 *
 * Runs one cheap LLM call per active user after market close.
 * Reads each user's pre-built compact summary from coach_context_cache,
 * produces a ~150-token behavioral brief, and stores it back.
 *
 * The brief replaces ~300 tokens of raw pattern data injected into every
 * conversation during the day. One nightly LLM call buys back tokens on
 * every subsequent coach message.
 *
 * Called by the Netlify scheduled function nightly at midnight CT.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { generateText } from '@/lib/openaiResponses';

const CRON_SECRET = process.env.CRON_SECRET;

const BRIEF_SYSTEM_PROMPT = `You are a trading performance analyst. Given a trader's compact portfolio summary, write a behavioral brief of exactly 2-3 sentences (max 150 tokens).

Focus on:
- Their strongest repeatable pattern (with numbers)
- Their main weakness or risk (with numbers)
- One specific improvement recommendation

Be direct and specific. Reference actual symbols, win rates, and P&L figures from the data. Do not use bullet points or headers — prose only.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (CRON_SECRET) {
    const provided = req.headers['x-cron-secret'] ?? req.query.secret;
    if (provided !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  // Get all users with a cached summary (at least one trade exists)
  const { data: cacheRows, error } = await supabase
    .from('coach_context_cache')
    .select('user_id, summary_text, trade_count')
    .gt('trade_count', 0);

  if (error) return res.status(500).json({ error: error.message });
  if (!cacheRows || cacheRows.length === 0) return res.status(200).json({ processed: 0 });

  let ok = 0;
  let failed = 0;

  for (const row of cacheRows) {
    try {
      const { text: brief } = await generateText({
        model: 'gpt-4.1-nano',
        maxOutputTokens: 160,
        temperature: 0.4,
        instructions: BRIEF_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: row.summary_text }],
      });

      await supabase
        .from('coach_context_cache')
        .update({ behavioral_brief: brief.trim() })
        .eq('user_id', row.user_id);

      ok++;
    } catch (err) {
      console.error(`[nightly-coach-brief] user ${row.user_id} failed:`, err);
      failed++;
    }
  }

  console.log(`[nightly-coach-brief] Done: ${ok} ok, ${failed} failed of ${cacheRows.length} users`);
  return res.status(200).json({ ok, failed, total: cacheRows.length });
}
