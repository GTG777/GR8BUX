import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient, getSupabaseServiceRoleClient } from '@/lib/supabase';
import { Trade, ApiResponse } from '@/types';
import { convertTradeFromDatabase } from '@/lib/tradeConverters';
import { requireAuth } from '@/lib/apiAuth';

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

  // Update stock_trades if stockData provided, then recalculate P&L\n  if (stockData) {\n    await supabase\n      .from('stock_trades')\n      .update({\n        quantity: stockData.quantity,\n        entry_price: stockData.entryPrice,\n        exit_price: stockData.exitPrice ?? null,\n      })\n      .eq('trade_id', id);\n\n    // Recalculate P&L for closed stock trades\n    if (stockData.exitPrice != null) {\n      const qty = stockData.quantity || 0;\n      const commission = data.commission || 0;\n      const pnl = (stockData.exitPrice - stockData.entryPrice) * qty - commission;\n      await supabase.from('trades').update({ pnl, status: 'closed' }).eq('id', id);\n    }\n  }\n\n  // Update individual option legs if provided, then recalculate P&L\n  if (Array.isArray(legUpdates)) {\n    for (const leg of legUpdates) {\n      if (!leg.id) continue;\n      await supabase\n        .from('option_legs')\n        .update({\n          exit_price: leg.exitPrice ?? null,\n          quantity: leg.quantity,\n          entry_price: leg.entryPrice,\n        })\n        .eq('id', leg.id);\n    }\n\n    // Recalculate option P&L if all legs now have exit prices\n    const allExited = legUpdates.every((l: any) => l.exitPrice != null);\n    if (allExited && legUpdates.length > 0) {\n      const optPnl = legUpdates.reduce((sum: number, l: any) => {\n        const diff = l.direction === 'long'\n          ? (l.exitPrice - l.entryPrice) * l.quantity * 100\n          : (l.entryPrice - l.exitPrice) * l.quantity * 100;\n        return sum + diff;\n      }, 0) - (data.commission || 0);\n      await supabase.from('trades').update({ pnl: optPnl, status: 'closed' }).eq('id', id);\n    }\n  }

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
