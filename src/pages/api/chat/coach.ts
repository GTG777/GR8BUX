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
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { getCoachAgent } from '@/lib/agents/coachAgent';
import type { CoachResponse, CoachInput, TradeSummary } from '@/lib/agents/coachAgent';

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

  // ── Fetch aggregate portfolio stats directly from trades table ──────────────
  // This gives the coach ground-truth context regardless of embedding status.
  let tradeSummary: TradeSummary | undefined;
  try {
    const supabase = getSupabaseServiceRoleClient();
    if (supabase) {
      const { data: allTrades } = await supabase
        .from('trades')
        .select('id, symbol, type, status, pnl, entry_date, exit_date, tags')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false });

      if (allTrades && allTrades.length > 0) {
        const closed = allTrades.filter((t: { status: string }) => t.status === 'closed');
        const open = allTrades.filter((t: { status: string }) => t.status === 'open');
        const wins = closed.filter((t: { pnl: number | null }) => (t.pnl ?? 0) > 0);
        const losses = closed.filter((t: { pnl: number | null }) => (t.pnl ?? 0) < 0);
        const totalPnl = closed.reduce((s: number, t: { pnl: number | null }) => s + (t.pnl ?? 0), 0);
        const avgWin = wins.length ? wins.reduce((s: number, t: { pnl: number | null }) => s + (t.pnl ?? 0), 0) / wins.length : 0;
        const avgLoss = losses.length ? losses.reduce((s: number, t: { pnl: number | null }) => s + (t.pnl ?? 0), 0) / losses.length : 0;

        // Aggregate by symbol
        const bySymbol: Record<string, { trades: number; pnl: number }> = {};
        for (const t of allTrades as { symbol: string; pnl: number | null }[]) {
          if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { trades: 0, pnl: 0 };
          bySymbol[t.symbol].trades++;
          bySymbol[t.symbol].pnl += t.pnl ?? 0;
        }
        const topSymbols = Object.entries(bySymbol)
          .sort((a, b) => b[1].trades - a[1].trades)
          .slice(0, 10)
          .map(([symbol, v]) => ({ symbol, ...v }));

        tradeSummary = {
          totalTrades: allTrades.length,
          closedTrades: closed.length,
          openTrades: open.length,
          winCount: wins.length,
          lossCount: losses.length,
          winRate: closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0,
          totalPnl,
          avgWin,
          avgLoss,
          topSymbols,
          recentTrades: (allTrades.slice(0, 20) as { symbol: string; type: string; status: string; pnl: number | null; entry_date: string; exit_date: string | null; tags: string[] }[]).map((t) => ({
            symbol: t.symbol,
            type: t.type,
            status: t.status,
            pnl: t.pnl,
            entryDate: t.entry_date,
            exitDate: t.exit_date,
            tags: t.tags ?? [],
          })),
        };
      }
    }
  } catch {
    // Non-fatal — coach proceeds without stats if DB query fails
  }

  try {
    const coach = getCoachAgent();
    const result = await coach.coach({
      userId: user.id,
      userQuery: query.trim(),
      tradeSummary,
      currentTrade: currentTrade as CoachInput['currentTrade'],
      history: safeHistory,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Coach agent error';
    console.error('[Coach API]', err);
    return res.status(500).json({ success: false, error: message });
  }
}
