import type { NextApiRequest, NextApiResponse } from 'next';
import { getTradingAgentDashboard } from '@/lib/agents/tradingAgent';
import type { ApiResponse } from '@/types';
import type { TradingAgentDashboard, TradingAgentMode } from '@/types/tradingAgent';

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
    const dashboard = await getTradingAgentDashboard({
      ...(mode && ['signals_only', 'manual_paper', 'auto_paper'].includes(mode) ? { mode } : {}),
      ...(watchlist ? { watchlist } : {}),
    });

    return res.status(200).json({ success: true, data: dashboard });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load trading agent dashboard';
    return res.status(500).json({ success: false, error: message });
  }
}
