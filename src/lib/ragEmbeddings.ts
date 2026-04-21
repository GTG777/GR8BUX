/**
 * RAG Embedding Service
 * Generates, stores, and retrieves trade embeddings via OpenAI + Supabase pgvector
 *
 * Model: text-embedding-3-small (1536 dims, ~$0.02/1M tokens)
 * Vector store: Supabase pgvector (match_trade_embeddings RPC)
 */

import OpenAI from 'openai';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TradeRecord {
  id: string;
  user_id: string;
  symbol: string;
  type: string;           // 'stock' | 'option'
  status: string;         // 'open' | 'closed'
  pnl: number | null;
  notes: string | null;
  plan_notes: string | null;
  tags: string[] | null;
  entry_date: string;
  exit_date: string | null;
  setup_type?: string | null;   // from tags or notes
}

export interface SimilarTrade {
  trade_id: string;
  user_id: string;
  embedded_text: string;
  symbol: string;
  setup_type: string | null;
  outcome: 'win' | 'loss' | 'breakeven';
  pnl: number | null;
  tags: string[];
  similarity: number;
}

// ─── OpenAI client (singleton) ────────────────────────────────────────────────

let _openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  _openai = new OpenAI({ apiKey });
  return _openai;
}

// ─── Text serialization ───────────────────────────────────────────────────────

/**
 * Converts a trade record into rich natural-language text for embedding.
 * The more descriptive this text, the better the semantic search results.
 */
export function serializeTrade(trade: TradeRecord): string {
  const outcome = getOutcome(trade.pnl);
  const parts: string[] = [
    `Symbol: ${trade.symbol}`,
    `Type: ${trade.type}`,
    `Outcome: ${outcome}`,
    trade.pnl != null ? `P&L: $${trade.pnl.toFixed(2)}` : '',
    trade.setup_type ? `Setup: ${trade.setup_type}` : '',
    trade.tags?.length ? `Tags: ${trade.tags.join(', ')}` : '',
    trade.plan_notes ? `Plan: ${trade.plan_notes}` : '',
    trade.notes ? `Notes: ${trade.notes}` : '',
    `Entry: ${trade.entry_date.substring(0, 10)}`,
    trade.exit_date ? `Exit: ${trade.exit_date.substring(0, 10)}` : '',
  ];
  return parts.filter(Boolean).join('. ');
}

function getOutcome(pnl: number | null): 'win' | 'loss' | 'breakeven' {
  if (pnl == null) return 'breakeven';
  if (pnl > 0) return 'win';
  if (pnl < 0) return 'loss';
  return 'breakeven';
}

// ─── Embedding generation ─────────────────────────────────────────────────────

/**
 * Generate an embedding vector for a piece of text using OpenAI.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000), // safety trim
    encoding_format: 'float',
  });
  return response.data[0].embedding;
}

// ─── Store / upsert ───────────────────────────────────────────────────────────

/**
 * Generate an embedding for a trade and upsert it into trade_embeddings.
 * Only embeds closed trades (open trades have no outcome yet).
 */
export async function embedTrade(trade: TradeRecord): Promise<void> {
  // Only embed closed trades — open trades have no outcome yet
  if (trade.status !== 'closed' || trade.pnl == null) return;

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) throw new Error('Supabase service role client unavailable');

  const text = serializeTrade(trade);
  const embedding = await generateEmbedding(text);

  const { error } = await supabase.from('trade_embeddings').upsert(
    {
      trade_id: trade.id,
      user_id: trade.user_id,
      embedded_text: text,
      embedding: JSON.stringify(embedding),   // pgvector accepts JSON array
      symbol: trade.symbol,
      setup_type: trade.setup_type ?? null,
      outcome: getOutcome(trade.pnl),
      pnl: trade.pnl,
      tags: trade.tags ?? [],
    },
    { onConflict: 'trade_id' }
  );

  if (error) {
    console.error('[embedTrade] upsert error:', error);
    throw error;
  }
}

// ─── Retrieval ────────────────────────────────────────────────────────────────

/**
 * Find the most semantically similar past trades for a given query text.
 * Uses the match_trade_embeddings Supabase RPC (cosine similarity via pgvector).
 */
export async function findSimilarTrades(
  queryText: string,
  userId: string,
  options: { limit?: number; threshold?: number } = {}
): Promise<SimilarTrade[]> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) throw new Error('Supabase service role client unavailable');

  const embedding = await generateEmbedding(queryText);

  const { data, error } = await supabase.rpc('match_trade_embeddings', {
    query_embedding: JSON.stringify(embedding),
    match_user_id: userId,
    match_count: options.limit ?? 5,
    match_threshold: options.threshold ?? 0.6,
  });

  if (error) {
    console.error('[findSimilarTrades] RPC error:', error);
    throw error;
  }

  return (data ?? []) as SimilarTrade[];
}

// ─── Batch embed (for backfill) ───────────────────────────────────────────────

/**
 * Embed all closed trades for a user that don't yet have an embedding.
 * Call this once after enabling the RAG feature.
 */
export async function backfillUserEmbeddings(userId: string): Promise<{ embedded: number; skipped: number }> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) throw new Error('Supabase service role client unavailable');

  // Fetch IDs already embedded
  const { data: alreadyEmbedded } = await supabase
    .from('trade_embeddings')
    .select('trade_id')
    .eq('user_id', userId);

  const embeddedIds = new Set((alreadyEmbedded ?? []).map((r: { trade_id: string }) => r.trade_id));

  // Fetch all closed trades for this user
  const { data: trades, error } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'closed');

  if (error) throw error;

  // Filter out already-embedded ones in JS (avoids complex subquery)
  const unembed = (trades ?? []).filter((t: { id: string }) => !embeddedIds.has(t.id));

  let embedded = 0;
  let skipped = 0;

  for (const trade of unembed) {
    try {
      await embedTrade(trade as TradeRecord);
      embedded++;
      // Small delay to avoid hitting OpenAI rate limits
      await new Promise((r) => setTimeout(r, 100));
    } catch {
      skipped++;
    }
  }

  return { embedded, skipped };
}
