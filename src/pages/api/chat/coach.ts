/**
 * POST /api/chat/coach
 *
 * RAG-powered personal trading coach.
 *
 * Hot path (cache hit):
 *   Reads pre-built compact portfolio summary from coach_context_cache.
 *   Skips the full DB aggregation — saves ~400-500 tokens per message.
 *
 * Fallback (cache miss / stale):
 *   Falls back to live DB aggregation, same as before.
 *
 * Body:  { query, currentTrade?, history? }
 * Returns: { reply, similarTrades, patterns, suggestedActions, usage }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { getCoachAgent } from '@/lib/agents/coachAgent';
import type { CoachResponse, CoachInput, TradeSummary } from '@/lib/agents/coachAgent';

const CACHE_MAX_AGE_MS = 45 * 60 * 1000; // 45 minutes

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

  const safeHistory = (history ?? []).slice(-10);
  const supabase = getSupabaseServiceRoleClient();

  // ── Try cache first ──────────────────────────────────────────────────────────
  let cachedSummary: string | undefined;
  let behavioralBrief: string | undefined;

  if (supabase) {
    try {
      const { data: cache } = await supabase
        .from('coach_context_cache')
        .select('summary_text, behavioral_brief, updated_at')
        .eq('user_id', user.id)
        .single();

      if (cache) {
        const age = Date.now() - new Date(cache.updated_at).getTime();
        if (age < CACHE_MAX_AGE_MS) {
          cachedSummary = cache.summary_text || undefined;
          behavioralBrief = cache.behavioral_brief || undefined;
        }
      }
    } catch {
      // Non-fatal — fall through to live query
    }
  }

  // ── Fallback: live DB aggregation (same as before) ───────────────────────────
  let tradeSummary: TradeSummary | undefined;

  if (!cachedSummary && supabase) {
    try {
      const { data: allTrades } = await supabase
        .from('trades')
        .select(`
          id, symbol, type, status, pnl, entry_date, exit_date, tags, notes, plan_notes,
          stock_trades(quantity, entry_price, exit_price),
          option_trades(
            strategy, total_premium,
            option_legs(type, strike_price, expiration_date, direction, quantity, entry_price, exit_price)
          )
        `)
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false });

      if (allTrades && allTrades.length > 0) {
        const closed = allTrades.filter((t: any) => t.status === 'closed');
        const open = allTrades.filter((t: any) => t.status === 'open');
        const wins = closed.filter((t: any) => (t.pnl ?? 0) > 0);
        const losses = closed.filter((t: any) => (t.pnl ?? 0) < 0);
        const totalPnl = closed.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
        const avgWin = wins.length ? wins.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0) / wins.length : 0;
        const avgLoss = losses.length ? losses.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0) / losses.length : 0;

        const byType: Record<string, { closed: number; wins: number; totalPnl: number; avgWin: number; avgLoss: number }> = {};
        for (const typ of ['stock', 'option']) {
          const tClosed = closed.filter((t: any) => t.type === typ);
          const tWins = tClosed.filter((t: any) => (t.pnl ?? 0) > 0);
          const tLosses = tClosed.filter((t: any) => (t.pnl ?? 0) < 0);
          byType[typ] = {
            closed: tClosed.length,
            wins: tWins.length,
            totalPnl: tClosed.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0),
            avgWin: tWins.length ? tWins.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0) / tWins.length : 0,
            avgLoss: tLosses.length ? tLosses.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0) / tLosses.length : 0,
          };
        }

        const openPositions = (open as any[]).map((t) => {
          const legs = t.option_trades?.option_legs ?? [];
          const premiumAtRisk = legs
            .filter((l: any) => l.direction === 'long')
            .reduce((s: number, l: any) => s + (l.entry_price ?? 0) * (l.quantity ?? 0) * 100, 0);
          return {
            symbol: t.symbol, type: t.type, entryDate: t.entry_date?.slice(0, 10),
            strategy: t.option_trades?.strategy ?? null,
            premiumAtRisk: premiumAtRisk > 0 ? premiumAtRisk : null,
            legs: legs.map((l: any) => ({
              direction: l.direction, type: l.type, strike: l.strike_price,
              expiry: l.expiration_date?.slice(0, 10), qty: l.quantity, entryPrice: l.entry_price,
            })),
            stockQty: t.stock_trades?.quantity ?? null,
            stockEntryPrice: t.stock_trades?.entry_price ?? null,
          };
        });

        const bySymbol: Record<string, { trades: number; pnl: number }> = {};
        for (const t of allTrades as any[]) {
          if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { trades: 0, pnl: 0 };
          bySymbol[t.symbol].trades++;
          bySymbol[t.symbol].pnl += t.pnl ?? 0;
        }
        const topSymbols = Object.entries(bySymbol)
          .sort((a, b) => b[1].trades - a[1].trades)
          .slice(0, 10)
          .map(([symbol, v]) => ({ symbol, ...v }));

        tradeSummary = {
          totalTrades: allTrades.length, closedTrades: closed.length, openTrades: open.length,
          winCount: wins.length, lossCount: losses.length,
          winRate: closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0,
          totalPnl, avgWin, avgLoss, byType, openPositions, topSymbols,
          recentTrades: (allTrades.slice(0, 5) as any[]).map((t) => {
            const legs = t.option_trades?.option_legs ?? [];
            return {
              symbol: t.symbol, type: t.type, status: t.status, pnl: t.pnl,
              entryDate: t.entry_date, exitDate: t.exit_date, tags: t.tags ?? [],
              notes: null, planNotes: null,
              strategy: t.option_trades?.strategy ?? null,
              stockQty: t.stock_trades?.quantity ?? null,
              stockEntryPrice: t.stock_trades?.entry_price ?? null,
              stockExitPrice: t.stock_trades?.exit_price ?? null,
              optionLegs: legs.length > 0 ? legs.map((l: any) => ({
                type: l.type, direction: l.direction, strike: l.strike_price,
                expiry: l.expiration_date?.slice(0, 10), qty: l.quantity,
                entryPrice: l.entry_price, exitPrice: l.exit_price ?? null,
              })) : null,
            };
          }),
        };
      }
    } catch {
      // Non-fatal — coach proceeds without stats
    }
  }

  // ── Load session summary for long conversations ──────────────────────────────
  let historySummary: string | undefined;
  if (supabase && safeHistory.length >= 8) {
    try {
      const { data: session } = await supabase
        .from('coach_sessions')
        .select('history_summary')
        .eq('user_id', user.id)
        .single();
      historySummary = session?.history_summary || undefined;
    } catch {
      // Non-fatal
    }
  }

  try {
    const coach = getCoachAgent();
    const result = await coach.coach({
      userId: user.id,
      userQuery: query.trim(),
      tradeSummary,
      cachedSummary,
      behavioralBrief,
      historySummary,
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
