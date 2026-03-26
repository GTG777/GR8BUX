import { Trade } from '@/types';

/**
 * Convert database record from snake_case to camelCase for API response
 */
export function convertTradeFromDatabase(dbTrade: any): Trade {
  return {
    id: dbTrade.id,
    userId: dbTrade.user_id,
    type: dbTrade.type,
    symbol: dbTrade.symbol,
    entryDate: dbTrade.entry_date,
    exitDate: dbTrade.exit_date || undefined,
    commission: dbTrade.commission,
    pnl: dbTrade.pnl,
    notes: dbTrade.notes,
    planNotes: dbTrade.plan_notes,
    tags: Array.isArray(dbTrade.tags) ? dbTrade.tags : [],
    status: dbTrade.status,
    createdAt: dbTrade.created_at,
    updatedAt: dbTrade.updated_at,
    optionData: dbTrade.optionData
      ? {
          strategy: dbTrade.optionData.strategy,
          totalPremium: dbTrade.optionData.total_premium,
          totalCost: dbTrade.optionData.total_cost,
          legs: (dbTrade.optionData.option_legs || []).map((leg: any) => ({
            id: leg.id,
            symbol: leg.symbol,
            type: leg.type,
            strikePrice: leg.strike_price,
            expirationDate: leg.expiration_date,
            direction: leg.direction,
            quantity: leg.quantity,
            entryPrice: leg.entry_price,
            exitPrice: leg.exit_price || undefined,
          })),
        }
      : undefined,
    stockData: dbTrade.stockData
      ? {
          quantity: dbTrade.stockData.quantity,
          entryPrice: dbTrade.stockData.entry_price,
          exitPrice: dbTrade.stockData.exit_price || undefined,
        }
      : undefined,
  };
}
