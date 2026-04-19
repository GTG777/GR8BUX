import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient, getSupabaseServiceRoleClient } from '@/lib/supabase';
import { Trade, ApiResponse } from '@/types';
import { convertTradeFromDatabase } from '@/lib/tradeConverters';
import { requireAuth } from '@/lib/apiAuth';

/**
 * GET: Fetch all trades for authenticated user
 * POST: Create a new trade
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<Trade | Trade[]>>
) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' });
  }

  const { method } = req;

  try {
    if (method === 'GET') {
      return handleGetTrades(req, res, user.id);
    } else if (method === 'POST') {
      return handleCreateTrade(req, res, user.id);
    } else {
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
      });
    }
  } catch (error: any) {
    console.error('[Trades API Error]', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}

async function handleGetTrades(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<Trade[]>>,
  userId: string
) {
  const supabase = getSupabaseServiceRoleClient() || getSupabaseClient()!;
  const { symbol, status, limit = 50, offset = 0 } = req.query;

  let query = supabase
    .from('trades')
    .select('*, stock_trades(quantity, entry_price, exit_price), option_trades(strategy, total_premium, total_cost, option_legs(id, symbol, type, strike_price, expiration_date, direction, quantity, entry_price, exit_price))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Apply filters
  if (symbol) {
    query = query.eq('symbol', symbol);
  }

  if (status) {
    query = query.eq('status', status);
  }

  // Apply pagination
  query = query.range(parseInt(offset as string) || 0, (parseInt(offset as string) || 0) + (parseInt(limit as string) || 50) - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[Get Trades Error]', error);
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }

  res.setHeader('X-Total-Count', count || 0);
  res.setHeader('X-Total-Count', count || 0);
  return res.status(200).json({
    success: true,
    data: (data as any[])?.map((row) => {
      // Supabase returns one-to-many joins as arrays even with unique FK
      const stRow = Array.isArray(row.stock_trades) ? row.stock_trades[0] : row.stock_trades;
      const optTrade = Array.isArray(row.option_trades) ? row.option_trades[0] : row.option_trades;
      const legs: any[] = optTrade?.option_legs ?? [];
      const expiryDate = legs.length
        ? legs.map((l: any) => l.expiration_date).sort()[0]
        : undefined;
      return convertTradeFromDatabase({
        ...row,
        stockData: stRow ?? undefined,
        optionData: optTrade ?? undefined,
        expiryDate,
      });
    }) || [],
  });
}

async function handleCreateTrade(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<Trade>>,
  userId: string
) {
  // Use service role client for API operations to bypass RLS
  const supabase = getSupabaseServiceRoleClient() || getSupabaseClient()!;
  const trade = req.body;

  // Validation
  if (!trade.symbol || !trade.entryDate || !trade.type) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: symbol, entryDate, type',
    });
  }

  if (!['stock', 'option'].includes(trade.type)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid type. Must be "stock" or "option"',
    });
  }

  try {
    // 1. Insert base trade record
    // Convert tags from comma-separated string to array if needed
    let tagsArray: string[] = [];
    if (trade.tags) {
      if (typeof trade.tags === 'string') {
        tagsArray = trade.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean);
      } else if (Array.isArray(trade.tags)) {
        tagsArray = trade.tags;
      }
    }

    const baseTradeData = {
      symbol: trade.symbol,
      type: trade.type,
      entry_date: trade.entryDate,
      exit_date: trade.exitDate || null,
      status: trade.status || 'open',
      commission: trade.commission || 0,
      notes: trade.notes || '',
      plan_notes: trade.planNotes || '', 
      tags: tagsArray,
      user_id: userId,
    };

    const { data: tradeData, error: tradeError } = await supabase
      .from('trades')
      .insert([baseTradeData])
      .select();

    if (tradeError) {
      console.error('[Create Trade Error]', tradeError);
      return res.status(400).json({
        success: false,
        error: tradeError.message,
      });
    }

    const tradeId = tradeData[0].id;

    // 2. Insert type-specific data
    if (trade.type === 'stock') {
      const entryPrice = trade.entryPrice || 0;
      const exitPrice = trade.exitPrice ? parseFloat(trade.exitPrice) : null;
      const quantity = trade.quantity || 0;
      const commission = trade.commission || 0;

      const { error: stockError } = await supabase
        .from('stock_trades')
        .insert([{
          trade_id: tradeId,
          quantity,
          entry_price: entryPrice,
          exit_price: exitPrice,
        }]);

      if (stockError) {
        console.error('[Create Stock Trade Error]', stockError);
        return res.status(400).json({
          success: false,
          error: stockError.message,
        });
      }

      // Calculate and persist P&L for closed trades
      if (exitPrice !== null) {
        const pnl = (exitPrice - entryPrice) * quantity - commission;
        await supabase.from('trades').update({ pnl, status: 'closed' }).eq('id', tradeId);
      }
    } else if (trade.type === 'option') {
      const { data: optionTradeData, error: optionError } = await supabase
        .from('option_trades')
        .insert([{
          trade_id: tradeId,
          strategy: trade.strategy || null,
          total_premium: trade.totalPremium || null,
          total_cost: trade.totalCost || null,
        }])
        .select('id')
        .single();

      if (optionError) {
        console.error('[Create Option Trade Error]', optionError);
        return res.status(400).json({
          success: false,
          error: optionError.message,
        });
      }

      // Insert individual option legs (supports spreads, condors, etc.)
      if (optionTradeData && Array.isArray(trade.legs) && trade.legs.length > 0) {
        const legsToInsert = trade.legs.map((leg: any) => ({
          option_trade_id: optionTradeData.id,
          symbol: trade.symbol,
          type: leg.type,
          strike_price: leg.strikePrice,
          expiration_date: leg.expirationDate,
          direction: leg.direction,
          quantity: leg.quantity,
          entry_price: leg.entryPrice,
          exit_price: leg.exitPrice || null,
        }));

        const { error: legsError } = await supabase
          .from('option_legs')
          .insert(legsToInsert);

        if (legsError) {
          console.error('[Create Option Legs Error]', legsError);
          // Non-fatal: base trade is saved; log and continue
        }

        // Calculate option P&L if all legs have exit prices
        const allLegsExited = trade.legs.every((l: any) => l.exitPrice != null);
        if (allLegsExited) {
          const optPnl = trade.legs.reduce((sum: number, l: any) => {
            const diff = l.direction === 'long'
              ? (l.exitPrice - l.entryPrice) * l.quantity * 100
              : (l.entryPrice - l.exitPrice) * l.quantity * 100;
            return sum + diff;
          }, 0) - (trade.commission || 0);
          await supabase.from('trades').update({ pnl: optPnl, status: 'closed' }).eq('id', tradeId);
        }
      }
    }

    // 3. Fetch complete trade record with type-specific data
    const { data: completeTradeData, error: fetchError } = await supabase
      .from('trades')
      .select('*, stock_trades(quantity, entry_price, exit_price), option_trades(strategy, total_premium, total_cost, option_legs(id, symbol, type, strike_price, expiration_date, direction, quantity, entry_price, exit_price))')
      .eq('id', tradeId)
      .single();

    if (fetchError) {
      console.error('[Fetch Trade Error]', fetchError);
      return res.status(400).json({
        success: false,
        error: fetchError.message,
      });
    }

    const row = completeTradeData as any;
    const stRow = Array.isArray(row.stock_trades) ? row.stock_trades[0] : row.stock_trades;
    const optRow = Array.isArray(row.option_trades) ? row.option_trades[0] : row.option_trades;
    return res.status(201).json({
      success: true,
      data: convertTradeFromDatabase({ ...row, stockData: stRow ?? undefined, optionData: optRow ?? undefined }),
    });
  } catch (error: any) {
    console.error('[Trade Creation Exception]', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
