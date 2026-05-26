import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import type { ApiResponse } from '@/types';
import type { TradingAgentExecutionState, TradingAgentPaperPosition, TradingAgentPersistedStatus } from '@/types/tradingAgent';

type PaperPositionRow = {
  id: string;
  signal_id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entry_price: number | string;
  opened_at: string;
  closed_at: string | null;
  exit_price: number | string | null;
  status: 'open' | 'closed';
  thesis: string | null;
};

type SignalStatusRequest = {
  type: 'signal_status';
  signalId: string;
  symbol: string;
  status: Exclude<TradingAgentPersistedStatus, 'paper_filled'>;
};

type FillPositionRequest = {
  type: 'fill_position';
  signalId: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  stopPrice?: number | null;
  targetPrice?: number | null;
  thesis?: string;
};

type DeletePositionRequest = {
  type: 'delete_position';
  signalId: string;
};

type ClosePositionRequest = {
  type: 'close_position';
  signalId: string;
  exitPrice: number;
};

type ClearSignalRequest = {
  type: 'clear_signal';
  signalId: string;
};

type ExecutionMutationRequest =
  | SignalStatusRequest
  | FillPositionRequest
  | DeletePositionRequest
  | ClosePositionRequest
  | ClearSignalRequest;

function isMissingRelationError(message: string) {
  return /relation .* does not exist/i.test(message) || /Could not find the table/i.test(message);
}

function mapPosition(row: PaperPositionRow): TradingAgentPaperPosition {
  return {
    id: row.id,
    signalId: row.signal_id,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    entryPrice: Number(row.entry_price),
    markPrice: Number(row.entry_price),
    unrealizedPnl: 0,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    exitPrice: row.exit_price == null ? null : Number(row.exit_price),
    status: row.status,
    thesis: row.thesis ?? '',
  };
}

async function loadExecutionState(userId: string): Promise<TradingAgentExecutionState> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) throw new Error('DB not configured');

  const [statusesResult, positionsResult] = await Promise.all([
    supabase
      .from('trading_agent_signal_actions')
      .select('signal_id, status')
      .eq('user_id', userId),
    supabase
      .from('trading_agent_paper_positions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false }),
  ]);

  const tableError = statusesResult.error || positionsResult.error;
  if (tableError) {
    if (isMissingRelationError(tableError.message)) {
      return { statuses: {}, positions: [] };
    }
    throw tableError;
  }

  const statuses = Object.fromEntries(
    (statusesResult.data ?? []).map((row) => [row.signal_id, row.status as TradingAgentPersistedStatus]),
  );

  return {
    statuses,
    positions: (positionsResult.data ?? []).map(mapPosition),
  };
}

async function upsertOpenPosition(userId: string, payload: FillPositionRequest): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) throw new Error('DB not configured');

  const { data: existingOpen, error: existingOpenError } = await supabase
    .from('trading_agent_paper_positions')
    .select('id')
    .eq('user_id', userId)
    .eq('signal_id', payload.signalId)
    .eq('status', 'open')
    .maybeSingle();

  if (existingOpenError) throw existingOpenError;

  const nextPosition = {
    user_id: userId,
    signal_id: payload.signalId,
    symbol: payload.symbol,
    side: payload.side,
    quantity: Math.round(payload.quantity),
    entry_price: payload.entryPrice,
    stop_price: payload.stopPrice ?? null,
    target_price: payload.targetPrice ?? null,
    thesis: payload.thesis ?? '',
    opened_at: new Date().toISOString(),
    closed_at: null,
    exit_price: null,
    status: 'open' as const,
  };

  if (existingOpen?.id) {
    const { error } = await supabase
      .from('trading_agent_paper_positions')
      .update(nextPosition)
      .eq('id', existingOpen.id)
      .eq('user_id', userId);

    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('trading_agent_paper_positions').insert(nextPosition);
  if (error) throw error;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<TradingAgentExecutionState | null>>,
) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' });
  }

  try {
    if (req.method === 'GET') {
      const state = await loadExecutionState(user.id);
      return res.status(200).json({ success: true, data: state });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const body = req.body as ExecutionMutationRequest;

    if (body.type === 'signal_status') {
      const { signalId, symbol, status } = body;
      if (!signalId || !symbol || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid signal status payload' });
      }

      const { error } = await supabase.from('trading_agent_signal_actions').upsert(
        {
          user_id: user.id,
          signal_id: signalId,
          symbol,
          status,
        },
        { onConflict: 'user_id,signal_id' },
      );

      if (error) throw error;
    } else if (body.type === 'fill_position') {
      const { signalId, symbol, side, quantity, entryPrice } = body;
      if (!signalId || !symbol || !['long', 'short'].includes(side) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid fill payload' });
      }

      await upsertOpenPosition(user.id, body);

      const { error: actionError } = await supabase.from('trading_agent_signal_actions').upsert(
        {
          user_id: user.id,
          signal_id: signalId,
          symbol,
          status: 'paper_filled',
        },
        { onConflict: 'user_id,signal_id' },
      );

      if (actionError) throw actionError;
    } else if (body.type === 'delete_position') {
      if (!body.signalId) {
        return res.status(400).json({ success: false, error: 'signalId is required' });
      }

      const { error: deletePositionError } = await supabase
        .from('trading_agent_paper_positions')
        .delete()
        .eq('user_id', user.id)
        .eq('signal_id', body.signalId)
        .eq('status', 'open');

      if (deletePositionError) throw deletePositionError;

      const { error: deleteActionError } = await supabase
        .from('trading_agent_signal_actions')
        .delete()
        .eq('user_id', user.id)
        .eq('signal_id', body.signalId);

      if (deleteActionError) throw deleteActionError;
    } else if (body.type === 'close_position') {
      if (!body.signalId || !Number.isFinite(body.exitPrice) || body.exitPrice <= 0) {
        return res.status(400).json({ success: false, error: 'Valid signalId and exitPrice are required' });
      }

      const { error: closeError } = await supabase
        .from('trading_agent_paper_positions')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          exit_price: body.exitPrice,
        })
        .eq('user_id', user.id)
        .eq('signal_id', body.signalId)
        .eq('status', 'open');

      if (closeError) throw closeError;

      const { error: clearActionError } = await supabase
        .from('trading_agent_signal_actions')
        .delete()
        .eq('user_id', user.id)
        .eq('signal_id', body.signalId);

      if (clearActionError) throw clearActionError;
    } else if (body.type === 'clear_signal') {
      if (!body.signalId) {
        return res.status(400).json({ success: false, error: 'signalId is required' });
      }

      const { error } = await supabase
        .from('trading_agent_signal_actions')
        .delete()
        .eq('user_id', user.id)
        .eq('signal_id', body.signalId);

      if (error) throw error;
    } else {
      return res.status(400).json({ success: false, error: 'Unknown execution mutation type' });
    }

    const state = await loadExecutionState(user.id);
    return res.status(200).json({ success: true, data: state });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update agent execution';
    if (isMissingRelationError(message)) {
      return res.status(200).json({ success: true, data: { statuses: {}, positions: [] } });
    }
    return res.status(500).json({ success: false, error: message });
  }
}
