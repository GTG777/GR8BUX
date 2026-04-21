/**
 * POST /api/import/schwab-csv
 *
 * Receives pre-parsed trade objects from the frontend Schwab CSV parser,
 * deduplicates via import_hash, and bulk-inserts into the database.
 *
 * The CSV parsing happens client-side (in the browser) for performance
 * and to give users a preview before committing. This endpoint only
 * handles the DB writes.
 *
 * Body: { trades: ParsedTrade[] }
 * Returns: { imported, duplicate, failed, errors }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import type { ParsedTrade } from '@/lib/importParsers/schwab';
import { embedTrade } from '@/lib/ragEmbeddings';

interface ImportResult {
  imported: number;
  duplicate: number;
  failed: number;
  errors: string[];
}

interface ApiResponse {
  success: boolean;
  data?: ImportResult;
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { trades } = req.body as { trades: ParsedTrade[] };

  if (!Array.isArray(trades) || trades.length === 0) {
    return res.status(400).json({ success: false, error: 'No trades provided' });
  }

  if (trades.length > 500) {
    return res.status(400).json({ success: false, error: 'Too many trades (max 500 per import)' });
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' });
  }

  // Collect all hashes from this batch that are already in DB
  const hashes = trades.map((t) => t.importHash).filter(Boolean);
  const { data: existing } = await supabase
    .from('trades')
    .select('import_hash')
    .eq('user_id', user.id)
    .in('import_hash', hashes);

  const existingHashes = new Set((existing ?? []).map((r: { import_hash: string }) => r.import_hash));

  const result: ImportResult = { imported: 0, duplicate: 0, failed: 0, errors: [] };
  const toEmbed: Array<{ trade: ParsedTrade; tradeId: string }> = [];

  for (const trade of trades) {
    // Skip duplicates
    if (existingHashes.has(trade.importHash)) {
      result.duplicate++;
      continue;
    }

    try {
      // 1. Insert base trade record
      const { data: tradeRow, error: tradeErr } = await supabase
        .from('trades')
        .insert({
          user_id: user.id,
          type: trade.type,
          symbol: trade.symbol,
          entry_date: trade.entryDate,
          exit_date: trade.exitDate ?? null,
          status: trade.status,
          commission: trade.commission,
          pnl: trade.pnl ?? null,
          notes: trade.notes,
          plan_notes: null,
          tags: trade.tags,
          import_hash: trade.importHash,
        })
        .select('id')
        .single();

      if (tradeErr || !tradeRow) {
        result.failed++;
        result.errors.push(`${trade.symbol}: ${tradeErr?.message ?? 'insert failed'}`);
        continue;
      }

      const tradeId = tradeRow.id;

      // 2. Insert type-specific sub-record
      if (trade.type === 'stock' && trade.stockData) {
        const { error: stockErr } = await supabase.from('stock_trades').insert({
          trade_id: tradeId,
          quantity: trade.stockData.quantity,
          entry_price: trade.stockData.entryPrice,
          exit_price: trade.stockData.exitPrice ?? null,
        });
        if (stockErr) {
          result.errors.push(`${trade.symbol} stock_trades: ${stockErr.message}`);
        }
      } else if (trade.type === 'option' && trade.optionData) {
        const { data: optRow, error: optErr } = await supabase
          .from('option_trades')
          .insert({
            trade_id: tradeId,
            strategy: trade.optionData.strategy,
            total_premium: trade.optionData.totalPremium,
            total_cost: trade.optionData.totalCost ?? null,
          })
          .select('id')
          .single();

        if (optErr || !optRow) {
          result.errors.push(`${trade.symbol} option_trades: ${optErr?.message ?? 'insert failed'}`);
        } else {
          // Insert legs
          const legs = trade.optionData.legs.map((leg) => ({
            option_trade_id: optRow.id,
            symbol: leg.symbol,
            type: leg.type,
            strike_price: leg.strikePrice,
            expiration_date: leg.expirationDate,
            direction: leg.direction,
            quantity: leg.quantity,
            entry_price: leg.entryPrice,
            exit_price: leg.exitPrice ?? null,
          }));
          const { error: legsErr } = await supabase.from('option_legs').insert(legs);
          if (legsErr) {
            result.errors.push(`${trade.symbol} option_legs: ${legsErr.message}`);
          }
        }
      }

      result.imported++;

      // Queue closed trades for RAG embedding — store actual tradeId directly
      if (trade.status === 'closed' && trade.pnl != null) {
        toEmbed.push({ trade, tradeId });
      }
    } catch (err) {
      result.failed++;
      result.errors.push(`${trade.symbol}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  // Fire-and-forget RAG embedding for all newly imported closed trades
  if (toEmbed.length > 0) {
    (async () => {
      for (const { trade: t, tradeId } of toEmbed) {
        try {
          await embedTrade({
            id: tradeId,
            user_id: user.id,
            symbol: t.symbol,
            type: t.type,
            status: t.status,
            pnl: t.pnl ?? null,
            notes: t.notes ?? null,
            plan_notes: null,
            tags: t.tags ?? null,
            entry_date: t.entryDate,
            exit_date: t.exitDate ?? null,
            setup_type: null,
          });
          await new Promise((r) => setTimeout(r, 100)); // rate limit
        } catch {
          // Non-fatal — embedding can be retried via Sync button
        }
      }
    })();
  }

  return res.status(200).json({ success: true, data: result });
}

export const config = {
  api: { bodyParser: { sizeLimit: '2mb' } },
};
