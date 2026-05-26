import type { NextApiRequest, NextApiResponse } from 'next';
import { getTradingAgentDashboard } from '@/lib/agents/tradingAgent';
import type { ApiResponse } from '@/types';
import type { TradingAgentDashboardRequest, TradingAgentMode, TradingAgentReview } from '@/types/tradingAgent';

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
    return res.status(200).json({ success: true, data: dashboard.latestReview });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to run trading agent review';
    return res.status(500).json({ success: false, error: message });
  }
}
