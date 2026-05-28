/**
 * GET /api/cron/refresh-coach-context
 *
 * Pre-computes a compact portfolio summary for every user who has trades.
 * Stores the result in coach_context_cache so the coach API reads a single
 * cached row instead of running a full DB aggregation on every message.
 *
 * Called by the Netlify scheduled function every 30 minutes.
 * Also callable manually with x-cron-secret header.
 *
 * Token savings: ~400-500 tokens per coach message after warming.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';

const CRON_SECRET = process.env.CRON_SECRET;

// Build a compact (~100-150 token) portfolio summary string for one user's trades.
function buildCompactSummary(trades: any[]): { summary: string; tradeCount: number } {
  if (!trades || trades.length === 0) return { summary: 'No trades recorded.', tradeCount: 0 };

  const closed = trades.filter((t) => t.status === 'closed');
  const open = trades.filter((t) => t.status === 'open');
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) < 0);
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + (t.pnl ?? 0), 0) / losses.length : 0;
  const wr = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
  const fmt = (n: number) => (n >= 0 ? `+$${n.toFixed(0)}` : `-$${Math.abs(n).toFixed(0)}`);

  // Line 1: core stats
  const line1 = `stats: ${trades.length}T ${closed.length}cl ${open.length}op | wr:${wr}% pnl:${fmt(totalPnl)} avgW:${fmt(avgWin)} avgL:${fmt(avgLoss)}`;

  // Line 2: by type
  const byTypeLines: string[] = [];
  for (const typ of ['stock', 'option']) {
    const tClosed = closed.filter((t) => t.type === typ);
    if (tClosed.length === 0) continue;
    const tWins = tClosed.filter((t) => (t.pnl ?? 0) > 0);
    const tPnl = tClosed.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const tWr = Math.round((tWins.length / tClosed.length) * 100);
    byTypeLines.push(`${typ.toUpperCase()} ${tClosed.length}cl wr:${tWr}% pnl:${fmt(tPnl)}`);
  }
  const line2 = byTypeLines.length > 0 ? `type: ${byTypeLines.join(' | ')}` : '';

  // Line 3: top 4 symbols by trade count
  const bySymbol: Record<string, { trades: number; pnl: number }> = {};
  for (const t of trades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { trades: 0, pnl: 0 };
    bySymbol[t.symbol].trades++;
    bySymbol[t.symbol].pnl += t.pnl ?? 0;
  }
  const topSymbols = Object.entries(bySymbol)
    .sort((a, b) => b[1].trades - a[1].trades)
    .slice(0, 4)
    .map(([sym, v]) => `${sym}(${v.trades}t ${fmt(v.pnl)})`);
  const line3 = `top: ${topSymbols.join(' ')}`;

  // Line 4: open positions (compact)
  const openLines = (open as any[]).slice(0, 4).map((t) => {
    let s = `${t.symbol} ${t.type}`;
    const legs = t.option_trades?.option_legs ?? [];
    if (t.type === 'stock' && t.stock_trades?.quantity) {
      s += ` ${t.stock_trades.quantity}sh@$${t.stock_trades.entry_price}`;
    } else if (legs.length > 0) {
      const leg = legs[0];
      const risk = legs
        .filter((l: any) => l.direction === 'long')
        .reduce((sum: number, l: any) => sum + (l.entry_price ?? 0) * (l.quantity ?? 0) * 100, 0);
      s += ` ${leg.direction} ${leg.quantity}x $${leg.strike_price}${leg.type[0]} exp:${(leg.expiration_date ?? '').slice(0, 7)}`;
      if (risk > 0) s += ` [$${risk.toFixed(0)}risk]`;
    }
    return s;
  });
  const line4 = open.length > 0 ? `open(${open.length}): ${openLines.join(' | ')}` : '';

  // Line 5: last 5 trades (no notes)
  const recentLines = (trades as any[]).slice(0, 5).map((t) => {
    const pnlStr = t.pnl != null ? ` ${fmt(t.pnl)}` : '';
    return `${t.symbol} ${t.type} ${t.status}${pnlStr} [${(t.entry_date ?? '').slice(0, 10)}]`;
  });
  const line5 = `recent: ${recentLines.join(' | ')}`;

  const summary = [line1, line2, line3, line4, line5].filter(Boolean).join('\n');
  return { summary, tradeCount: trades.length };
}

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

  // Get all distinct user IDs that have trades
  const { data: userRows, error: userErr } = await supabase
    .from('trades')
    .select('user_id')
    .order('user_id');

  if (userErr) return res.status(500).json({ error: userErr.message });

  const userIds = [...new Set((userRows ?? []).map((r: any) => r.user_id as string))];
  if (userIds.length === 0) return res.status(200).json({ processed: 0 });

  let ok = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      const { data: trades } = await supabase
        .from('trades')
        .select(`
          id, symbol, type, status, pnl, entry_date, exit_date, tags,
          stock_trades(quantity, entry_price, exit_price),
          option_trades(
            strategy,
            option_legs(type, strike_price, expiration_date, direction, quantity, entry_price, exit_price)
          )
        `)
        .eq('user_id', userId)
        .order('entry_date', { ascending: false });

      const { summary, tradeCount } = buildCompactSummary(trades ?? []);

      await supabase.from('coach_context_cache').upsert(
        { user_id: userId, summary_text: summary, trade_count: tradeCount, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

      ok++;
    } catch (err) {
      console.error(`[refresh-coach-context] user ${userId} failed:`, err);
      failed++;
    }
  }

  console.log(`[refresh-coach-context] Done: ${ok} ok, ${failed} failed of ${userIds.length} users`);
  return res.status(200).json({ ok, failed, total: userIds.length });
}
