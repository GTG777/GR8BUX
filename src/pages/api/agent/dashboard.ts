import type { NextApiRequest, NextApiResponse } from 'next';
import { getTradingAgentDashboard } from '@/lib/agents/tradingAgent';
import type { ApiResponse } from '@/types';
import type { TradingAgentDashboard, TradingAgentDashboardRequest, TradingAgentMode } from '@/types/tradingAgent';

function parsePositiveNumber(raw: unknown, min: number, max: number): number | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

function parseBoolean(raw: unknown): boolean | undefined {
  if (typeof raw !== 'string') return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

function parseWatchlist(raw: unknown): string[] | undefined {
  if (typeof raw !== 'string') return undefined;
  const symbols = raw
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, ''))
    .filter(Boolean);
  return symbols.length ? Array.from(new Set(symbols)).slice(0, 20) : undefined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<TradingAgentDashboard>>,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use GET.' });
  }

  try {
    const mode = typeof req.query.mode === 'string' ? (req.query.mode as TradingAgentMode) : undefined;
    const watchlist = parseWatchlist(req.query.watchlist);
    const overrides: TradingAgentDashboardRequest = {
      ...(mode && ['signals_only', 'manual_paper', 'auto_paper'].includes(mode) ? { mode } : {}),
      ...(watchlist ? { watchlist } : {}),
      ...(parsePositiveNumber(req.query.accountSize, 1000, 10000000) !== undefined
        ? { accountSize: parsePositiveNumber(req.query.accountSize, 1000, 10000000) }
        : {}),
      ...(parsePositiveNumber(req.query.maxRiskPerTradePct, 0.1, 10) !== undefined
        ? { maxRiskPerTradePct: parsePositiveNumber(req.query.maxRiskPerTradePct, 0.1, 10) }
        : {}),
      ...(parsePositiveNumber(req.query.maxDailyLossPct, 0.5, 20) !== undefined
        ? { maxDailyLossPct: parsePositiveNumber(req.query.maxDailyLossPct, 0.5, 20) }
        : {}),
      ...(parsePositiveNumber(req.query.maxOpenPositions, 1, 20) !== undefined
        ? { maxOpenPositions: Math.round(parsePositiveNumber(req.query.maxOpenPositions, 1, 20) ?? 0) }
        : {}),
      ...(parseBoolean(req.query.requireManualApproval) !== undefined
        ? { requireManualApproval: parseBoolean(req.query.requireManualApproval) }
        : {}),
      ...(parseBoolean(req.query.allowOptions) !== undefined
        ? { allowOptions: parseBoolean(req.query.allowOptions) }
        : {}),
    };
    const dashboard = await getTradingAgentDashboard(overrides);

    return res.status(200).json({ success: true, data: dashboard });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load trading agent dashboard';
    return res.status(500).json({ success: false, error: message });
  }
}
