import { Trade } from '@/types';

/**
 * Calculate P&L for a trade
 */
export function calculateTradePnL(trade: Trade): number {
  if (trade.type === 'stock' && trade.stockData) {
    const { quantity, entryPrice, exitPrice } = trade.stockData;
    if (!exitPrice) return 0; // Trade not closed

    return (exitPrice - entryPrice) * quantity - trade.commission;
  }

  if (trade.type === 'option' && trade.optionData) {
    // For options, P&L would be (exit_premium - entry_premium) * legs * 100
    // This is a simplified calculation
    const pnl = trade.pnl || 0;
    return pnl - trade.commission;
  }

  return 0;
}

/**
 * Calculate win rate from trades
 */
export function calculateWinRate(trades: Trade[]): number {
  const closedTrades = trades.filter((t) => t.status === 'closed' && t.pnl !== undefined);
  if (closedTrades.length === 0) return 0;

  const wins = closedTrades.filter((t) => (t.pnl || 0) > 0).length;
  return (wins / closedTrades.length) * 100;
}

/**
 * Calculate consecutive wins/losses
 */
export function calculateConsecutiveWinsLosses(
  trades: Trade[]
): { wins: number; losses: number } {
  const closedTrades = trades
    .filter((t) => t.status === 'closed' && t.pnl !== undefined)
    .sort((a, b) => new Date(b.exitDate || '').getTime() - new Date(a.exitDate || '').getTime());

  let consecutiveWins = 0;
  let consecutiveLosses = 0;

  for (let i = 0; i < closedTrades.length; i++) {
    const isWin = (closedTrades[i].pnl || 0) > 0;

    if (i === 0) {
      if (isWin) consecutiveWins = 1;
      else consecutiveLosses = 1;
    } else {
      const prevIsWin = (closedTrades[i - 1].pnl || 0) > 0;

      if (isWin && prevIsWin) consecutiveWins++;
      else if (!isWin && !prevIsWin) consecutiveLosses++;
      else break; // Break at the streak change
    }
  }

  return { wins: consecutiveWins, losses: consecutiveLosses };
}

/**
 * Find largest win and loss
 */
export function findLargestWinLoss(
  trades: Trade[]
): { largestWin: number; largestLoss: number } {
  const closedTrades = trades.filter((t) => t.status === 'closed' && t.pnl !== undefined);

  let largestWin = 0;
  let largestLoss = 0;

  for (const trade of closedTrades) {
    const pnl = trade.pnl || 0;
    if (pnl > largestWin) largestWin = pnl;
    if (pnl < largestLoss) largestLoss = pnl;
  }

  return { largestWin, largestLoss };
}

/**
 * Calculate profit factor
 */
export function calculateProfitFactor(trades: Trade[]): number {
  const closedTrades = trades.filter((t) => t.status === 'closed' && t.pnl !== undefined);

  let totalWins = 0;
  let totalLosses = 0;

  for (const trade of closedTrades) {
    const pnl = trade.pnl || 0;
    if (pnl > 0) totalWins += pnl;
    else totalLosses += Math.abs(pnl);
  }

  return totalLosses === 0 ? 0 : totalWins / totalLosses;
}

/**
 * Calculate average win/loss
 */
export function calculateAverageWinLoss(
  trades: Trade[]
): { avgWin: number; avgLoss: number } {
  const closedTrades = trades.filter((t) => t.status === 'closed' && t.pnl !== undefined);

  let wins = 0;
  let winCount = 0;
  let losses = 0;
  let lossCount = 0;

  for (const trade of closedTrades) {
    const pnl = trade.pnl || 0;
    if (pnl > 0) {
      wins += pnl;
      winCount++;
    } else if (pnl < 0) {
      losses += pnl;
      lossCount++;
    }
  }

  const avgWin = winCount > 0 ? wins / winCount : 0;
  const avgLoss = lossCount > 0 ? losses / lossCount : 0;

  return { avgWin, avgLoss };
}

/**
 * Calculate max drawdown
 */
export function calculateMaxDrawdown(trades: Trade[]): number {
  const sortedTrades = [...trades]
    .filter((t) => t.status === 'closed')
    .sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());

  if (sortedTrades.length === 0) return 0;

  let cumulativePnL = 0;
  let peak = 0;
  let maxDD = 0;

  for (const trade of sortedTrades) {
    cumulativePnL += trade.pnl || 0;
    if (cumulativePnL > peak) peak = cumulativePnL;

    const drawdown = peak - cumulativePnL;
    if (drawdown > maxDD) maxDD = drawdown;
  }

  return maxDD;
}

/**
 * Group trades by symbol
 */
export function groupTradesBySymbol(trades: Trade[]): Record<string, Trade[]> {
  return trades.reduce(
    (acc, trade) => {
      if (!acc[trade.symbol]) acc[trade.symbol] = [];
      acc[trade.symbol].push(trade);
      return acc;
    },
    {} as Record<string, Trade[]>
  );
}

/**
 * Group trades by strategy/tag
 */
export function groupTradesByStrategy(trades: Trade[]): Record<string, Trade[]> {
  const grouped: Record<string, Trade[]> = {};

  for (const trade of trades) {
    const strategy = trade.tags?.[0] || 'Untagged';
    if (!grouped[strategy]) grouped[strategy] = [];
    grouped[strategy].push(trade);
  }

  return grouped;
}

/**
 * Format currency
 */
export function formatCurrency(value: number, symbol = '$'): string {
  const absValue = Math.abs(value);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absValue);

  return `${value < 0 ? '-' : ''}${symbol}${formatted}`;
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Get color for positive/negative values
 */
export function getValueColor(value: number): string {
  if (value > 0) return 'text-green-600';
  if (value < 0) return 'text-red-600';
  return 'text-gray-600';
}
