import type { NextApiRequest, NextApiResponse } from 'next';
import { getOptionalAuthUser } from '@/lib/apiAuth';
import { buildTradingAgentReview, getTradingAgentDashboard } from '@/lib/agents/tradingAgent';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import type { ApiResponse } from '@/types';
import type { TradingAgentDashboardRequest, TradingAgentMode, TradingAgentPaperPosition, TradingAgentReview } from '@/types/tradingAgent';

function parsePositiveNumber(raw: unknown, min: number, max: number): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return Math.min(max, Math.max(min, raw));
}

function parseWatchlist(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const symbols = raw
    .map((value) => (typeof value === 'string' ? value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '') : ''))
    .filter(Boolean);
  return symbols.length ? Array.from(new Set(symbols)).slice(0, 20) : undefined;
}

type ReviewPositionRow = {
  id: string;
  signal_id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entry_price: number | string;
  opened_at: string;
  closed_at: string | null;
  exit_price: number | string | null;
  status: 'open' | 'closed';
  thesis: string | null;
};

function toCentralDateLabel(isoString: string | null | undefined) {
  if (!isoString) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoString));
}

function mapReviewPosition(row: ReviewPositionRow): TradingAgentPaperPosition {
  return {
    id: row.id,
    signalId: row.signal_id,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    entryPrice: Number(row.entry_price),
    markPrice: Number(row.exit_price ?? row.entry_price),
    unrealizedPnl: 0,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    exitPrice: row.exit_price == null ? null : Number(row.exit_price),
    status: row.status,
    thesis: row.thesis ?? '',
  };
}

async function loadRecentPaperTrades(userId: string, reviewDateLabel: string): Promise<TradingAgentPaperPosition[]> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('trading_agent_paper_positions')
    .select('id, signal_id, symbol, side, quantity, entry_price, opened_at, closed_at, exit_price, status, thesis')
    .eq('user_id', userId)
    .order('opened_at', { ascending: false })
    .limit(50);

  if (error) {
    if (/relation .* does not exist/i.test(error.message) || /Could not find the table/i.test(error.message)) {
      return [];
    }
    throw error;
  }

  return (data ?? [])
    .map((row) => mapReviewPosition(row as ReviewPositionRow))
    .filter((position) => {
      const openedLabel = toCentralDateLabel(position.openedAt);
      const closedLabel = toCentralDateLabel(position.closedAt);
      return openedLabel === reviewDateLabel || closedLabel === reviewDateLabel;
    });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<TradingAgentReview>>,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const mode = typeof body.mode === 'string' ? (body.mode as TradingAgentMode) : undefined;
    const overrides: TradingAgentDashboardRequest = {
      ...(mode && ['signals_only', 'manual_paper', 'auto_paper'].includes(mode) ? { mode } : {}),
      ...(parsePositiveNumber(body.accountSize, 1000, 10000000) !== undefined
        ? { accountSize: parsePositiveNumber(body.accountSize, 1000, 10000000) }
        : {}),
      ...(parsePositiveNumber(body.maxRiskPerTradePct, 0.1, 10) !== undefined
        ? { maxRiskPerTradePct: parsePositiveNumber(body.maxRiskPerTradePct, 0.1, 10) }
        : {}),
      ...(parsePositiveNumber(body.maxDailyLossPct, 0.5, 20) !== undefined
        ? { maxDailyLossPct: parsePositiveNumber(body.maxDailyLossPct, 0.5, 20) }
        : {}),
      ...(parsePositiveNumber(body.maxOpenPositions, 1, 20) !== undefined
        ? { maxOpenPositions: Math.round(parsePositiveNumber(body.maxOpenPositions, 1, 20) ?? 0) }
        : {}),
      ...(typeof body.requireManualApproval === 'boolean' ? { requireManualApproval: body.requireManualApproval } : {}),
      ...(typeof body.allowOptions === 'boolean' ? { allowOptions: body.allowOptions } : {}),
      ...(parseWatchlist(body.watchlist) ? { watchlist: parseWatchlist(body.watchlist) } : {}),
    };
    const dashboard = await getTradingAgentDashboard(overrides);
    const user = await getOptionalAuthUser(req);
    const reviewDateLabel = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const recentPositions = user ? await loadRecentPaperTrades(user.id, reviewDateLabel) : [];
    const review = buildTradingAgentReview({
      signals: dashboard.signals,
      dataStatus: dashboard.dataStatus,
      recentPositions,
    });

    return res.status(200).json({ success: true, data: review });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to run trading agent review';
    return res.status(500).json({ success: false, error: message });
  }
}
