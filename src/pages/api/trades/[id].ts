import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient } from '@/lib/supabase';
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
  const supabase = getSupabaseClient()!;
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
  const supabase = getSupabaseClient()!;
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

  // Update stock_trades if stockData provided
  if (stockData) {
    await supabase
      .from('stock_trades')
      .update({
        quantity: stockData.quantity,
        entry_price: stockData.entryPrice,
        exit_price: stockData.exitPrice ?? null,
      })
      .eq('trade_id', id);
  }

  // Update individual option legs if provided
  if (Array.isArray(legUpdates)) {
    for (const leg of legUpdates) {
      if (!leg.id) continue;
      await supabase
        .from('option_legs')
        .update({
          exit_price: leg.exitPrice ?? null,
          quantity: leg.quantity,
          entry_price: leg.entryPrice,
        })
        .eq('id', leg.id);
    }
  }

  // Re-fetch with all related data so caller gets fresh optionData/stockData
  return handleGetTrade(id, userId, res);
}

async function handleDeleteTrade(
  id: string,
  userId: string,
  res: NextApiResponse<ApiResponse<Trade>>
) {
  const supabase = getSupabaseClient()!;
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
