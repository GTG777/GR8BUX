import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient } from '@/lib/supabase';
import { Trade, TradeAnalytics, ApiResponse } from '@/types';
import { convertTradeFromDatabase } from '@/lib/tradeConverters';
import { requireAuth } from '@/lib/apiAuth';
import {
  calculateTradePnL,
  calculateWinRate,
  calculateConsecutiveWinsLosses,
  findLargestWinLoss,
  calculateProfitFactor,
  calculateAverageWinLoss,
  calculateMaxDrawdown,
  groupTradesBySymbol,
  groupTradesByStrategy,
} from '@/utils/analytics';

/**
 * GET: Calculate analytics for trades
 * Query params:
 *  - symbol: Filter by specific symbol
 *  - startDate: Filter trades after this date
 *  - endDate: Filter trades before this date
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<TradeAnalytics>>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const { symbol, startDate, endDate } = req.query;

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    // Fetch only the authenticated user's trades
    let query = supabase.from('trades').select('*').eq('user_id', user.id);

    // Apply filters
    if (symbol) {
      query = query.eq('symbol', symbol as string);
    }

    if (startDate) {
      query = query.gte('entry_date', startDate as string);
    }

    if (endDate) {
      query = query.lte('entry_date', endDate as string);
    }

    const { data: trades, error } = await query;

    if (error) {
      throw error;
    }

    // Convert database records to camelCase
    const convertedTrades = (trades || []).map(convertTradeFromDatabase);

    // Calculate analytics
    const analytics = calculateAnalytics(convertedTrades);

    return res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (error: any) {
    console.error('[Analytics API Error]', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}

function calculateAnalytics(trades: Trade[]): TradeAnalytics {
  const closedTrades = trades.filter((t) => t.status === 'closed');

  // Calculate basic metrics
  const totalTrades = trades.length;
  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const winRate = calculateWinRate(trades);
  const { wins: consecutiveWins, losses: consecutiveLosses } =
    calculateConsecutiveWinsLosses(trades);
  const { largestWin, largestLoss } = findLargestWinLoss(trades);
  const { avgWin, avgLoss } = calculateAverageWinLoss(trades);
  const profitFactor = calculateProfitFactor(trades);
  const maxDrawdown = calculateMaxDrawdown(trades);

  // Risk-reward ratio
  const riskRewardRatio = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

  // By strategy (using tags)
  const byStrategy: Record<string, any> = {};
  const tradesByStrategy = groupTradesByStrategy(trades);
  
  for (const [strategy, strategyTrades] of Object.entries(tradesByStrategy)) {
    const wins = strategyTrades.filter((t) => (t.pnl || 0) > 0).length;
    const losses = strategyTrades.filter((t) => (t.pnl || 0) < 0).length;
    
    byStrategy[strategy] = {
      name: strategy,
      totalTrades: strategyTrades.length,
      wins,
      losses,
      winRate: (wins / strategyTrades.length) * 100,
      totalPnL: strategyTrades.reduce((sum, t) => sum + (t.pnl || 0), 0),
    };
  }

  // By symbol
  const bySymbol: Record<string, any> = {};
  const tradesBySymbol = groupTradesBySymbol(trades);
  
  for (const [symbolName, symbolTrades] of Object.entries(tradesBySymbol)) {
    const wins = symbolTrades.filter((t) => (t.pnl || 0) > 0).length;
    const losses = symbolTrades.filter((t) => (t.pnl || 0) < 0).length;
    const symbolTotalPnL = symbolTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    
    bySymbol[symbolName] = {
      symbol: symbolName,
      totalTrades: symbolTrades.length,
      wins,
      losses,
      totalPnL: symbolTotalPnL,
      avgPnL: symbolTotalPnL / symbolTrades.length,
    };
  }

  // By period (daily)
  const byPeriod: Record<string, any> = {};
  for (const trade of closedTrades) {
    const date = new Date(trade.entryDate).toISOString().split('T')[0];
    
    if (!byPeriod[date]) {
      byPeriod[date] = {
        period: date,
        trades: 0,
        pnl: 0,
      };
    }

    byPeriod[date].trades++;
    byPeriod[date].pnl += trade.pnl || 0;
  }

  return {
    totalTrades,
    totalPnL,
    winRate,
    avgWinSize: avgWin,
    avgLossSize: avgLoss,
    largestWin,
    largestLoss,
    consecutiveWins,
    consecutiveLosses,
    profitFactor,
    riskRewardRatio,
    maxDrawdown,
    byStrategy,
    bySymbol,
    byPeriod,
  };
}
