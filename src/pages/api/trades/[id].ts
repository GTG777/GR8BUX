import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient, getSupabaseServiceRoleClient } from '@/lib/supabase';
import { Trade, ApiResponse } from '@/types';
import { convertTradeFromDatabase } from '@/lib/tradeConverters';
import { requireAuth } from '@/lib/apiAuth';
import { embedTrade } from '@/lib/ragEmbeddings';

/**
 * GET: Fetch a specific trade by ID
 * PUT: Update a trade
 * DELETE: Delete a trade
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<Trade>>
) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;
  const { method } = req;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Trade ID is required',
    });
  }

  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }
    if (method === 'GET') {
      return handleGetTrade(id, user.id, res);
    } else if (method === 'PUT') {
      return handleUpdateTrade(id, user.id, req, res);
    } else if (method === 'DELETE') {
      return handleDeleteTrade(id, user.id, res);
    } else {
      return res.status(405).json({
        success: false,
        error: 'Method not allowed',
      });
    }
  } catch (error: any) {
    console.error('[Trade Detail API Error]', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}

async function handleGetTrade(
  id: string,
  userId: string,
  res: NextApiResponse<ApiResponse<Trade>>
) {
  const supabase = getSupabaseServiceRoleClient() || getSupabaseClient()!;
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error) {
    return res.status(404).json({
      success: false,
      error: 'Trade not found',
    });
  }

  // Fetch type-specific data
  let optionData = null;
  let stockData = null;

  if (data.type === 'option') {
    const { data: optTrade } = await supabase
      .from('option_trades')
      .select('*, option_legs(*)')
      .eq('trade_id', id)
      .single();
    if (optTrade) optionData = optTrade;
  } else if (data.type === 'stock') {
    const { data: stTrade } = await supabase
      .from('stock_trades')
      .select('*')
      .eq('trade_id', id)
      .single();
    if (stTrade) stockData = stTrade;
  }

  return res.status(200).json({
    success: true,
    data: convertTradeFromDatabase({ ...data, optionData, stockData }),
  });
}

async function handleUpdateTrade(
  id: string,
  userId: string,
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<Trade>>
) {
  const supabase = getSupabaseServiceRoleClient() || getSupabaseClient()!;
  const { stockData, legUpdates, ...rest } = req.body;

  // Don't allow updating id or timestamps
  delete rest.id;
  delete rest.createdAt;
  delete rest.updatedAt;

  // Update the base trades table
  const { data, error } = await supabase
    .from('trades')
    .update(rest)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  // Update stock_trades if stockData provided, then recalculate P&L
  if (stockData) {
    await supabase
      .from('stock_trades')
      .update({
        quantity: stockData.quantity,
        entry_price: stockData.entryPrice,
        exit_price: stockData.exitPrice ?? null,
      })
      .eq('trade_id', id);

    // Recalculate P&L for closed stock trades
    if (stockData.exitPrice != null) {
      const qty = stockData.quantity || 0;
      const commission = data.commission || 0;
      const pnl = (stockData.exitPrice - stockData.entryPrice) * qty - commission;
      await supabase.from('trades').update({ pnl, status: 'closed' }).eq('id', id);
    }
  }

  // Update individual option legs if provided, then recalculate P&L
  if (Array.isArray(legUpdates) && legUpdates.length > 0) {
    for (const leg of legUpdates) {
      if (!leg.id) continue;
      // Only update exit_price; preserve entry_price/quantity as-is
      if (leg.exitPrice !== undefined) {
        await supabase
          .from('option_legs')
          .update({ exit_price: leg.exitPrice })
          .eq('id', leg.id);
      }
    }

    // Recalculate option P&L if all legs now have exit prices
    const allExited = legUpdates.every((l: any) => l.exitPrice != null);
    if (allExited) {
      const optPnl = legUpdates.reduce((sum: number, l: any) => {
        const diff = l.direction === 'long'
          ? (l.exitPrice - l.entryPrice) * l.quantity * 100
          : (l.entryPrice - l.exitPrice) * l.quantity * 100;
        return sum + diff;
      }, 0) - (data.commission || 0);
      await supabase.from('trades').update({ pnl: optPnl, status: 'closed' }).eq('id', id);
    }
  }

  // Trigger embedding if the trade is now closed (fire-and-forget — does not block response)
  const { data: latestTrade } = await supabase.from('trades').select('*').eq('id', id).single();
  if (latestTrade?.status === 'closed') {
    embedTrade({
      id: latestTrade.id,
      user_id: latestTrade.user_id,
      symbol: latestTrade.symbol,
      type: latestTrade.type,
      status: latestTrade.status,
      pnl: latestTrade.pnl,
      notes: latestTrade.notes ?? null,
      plan_notes: latestTrade.plan_notes ?? null,
      tags: latestTrade.tags ?? null,
      entry_date: latestTrade.entry_date ?? new Date().toISOString(),
      exit_date: latestTrade.exit_date ?? null,
      setup_type: latestTrade.setup_type ?? null,
    }).catch((err) => console.error('[embedTrade] update trigger failed:', err));
  }

  // Re-fetch with all related data so caller gets fresh optionData/stockData
  return handleGetTrade(id, userId, res);
}

async function handleDeleteTrade(
  id: string,
  userId: string,
  res: NextApiResponse<ApiResponse<Trade>>
) {
  const supabase = getSupabaseServiceRoleClient() || getSupabaseClient()!;
  const { error } = await supabase.from('trades').delete().eq('id', id).eq('user_id', userId);

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }

  return res.status(200).json({
    success: true,
    data: {} as Trade,
  });
}
