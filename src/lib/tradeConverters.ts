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
  };
}
