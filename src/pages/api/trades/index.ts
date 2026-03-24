import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient } from '@/lib/supabase';
import { Trade, ApiResponse } from '@/types';

/**
 * GET: Fetch all trades for authenticated user
 * POST: Create a new trade
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<Trade | Trade[]>>
) {
  // TODO: Add proper authentication middleware
  // For now, we'll skip auth but you should add it later
  
  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' });
  }

  const { method } = req;

  try {
    if (method === 'GET') {
      return handleGetTrades(req, res);
    } else if (method === 'POST') {
      return handleCreateTrade(req, res);
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
  res: NextApiResponse<ApiResponse<Trade[]>>
) {
  const supabase = getSupabaseClient()!;
  const { symbol, status, limit = 50, offset = 0 } = req.query;

  let query = supabase.from('trades').select('*').order('created_at', { ascending: false });

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
  return res.status(200).json({
    success: true,
    data: (data as Trade[]) || [],
  });
}

async function handleCreateTrade(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<Trade>>
) {
  const supabase = getSupabaseClient()!;
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

  // Add defaults
  const newTrade = {
    ...trade,
    status: trade.status || 'open',
    commission: trade.commission || 0,
    pnl: trade.pnl || null,
    notes: trade.notes || '',
    planNotes: trade.planNotes || '',
    tags: trade.tags || [],
    // TODO: Add userId when authentication is implemented
    userId: 'temp-user-id',
  };

  const { data, error } = await supabase.from('trades').insert([newTrade]).select();

  if (error) {
    console.error('[Create Trade Error]', error);
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }

  return res.status(201).json({
    success: true,
    data: data[0] as Trade,
  });
}
