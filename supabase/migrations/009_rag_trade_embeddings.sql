-- RAG Pipeline: Enable pgvector and create trade embeddings table
-- Run this in Supabase SQL Editor before deploying

-- Step 1: Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Trade embeddings table
-- Each closed trade gets a vector embedding for semantic similarity search
CREATE TABLE IF NOT EXISTS trade_embeddings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id     UUID NOT NULL UNIQUE REFERENCES trades(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The text that was embedded (for debugging / re-embedding)
  embedded_text TEXT NOT NULL,
  -- 1536-dim vector from OpenAI text-embedding-3-small
  embedding    vector(1536),
  -- Denormalized snapshot fields for fast retrieval without joins
  symbol       VARCHAR(20),
  setup_type   TEXT,
  outcome      VARCHAR(10), -- 'win' | 'loss' | 'breakeven'
  pnl          NUMERIC(12, 2),
  tags         TEXT[],
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trade_embeddings_user_id  ON trade_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_embeddings_trade_id ON trade_embeddings(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_embeddings_outcome  ON trade_embeddings(outcome);

-- IVFFlat index for fast approximate nearest-neighbor search
-- lists=100 is good up to ~1M rows; tune higher if needed
CREATE INDEX IF NOT EXISTS idx_trade_embeddings_vector
  ON trade_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_trade_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_trade_embeddings_updated_at ON trade_embeddings;
CREATE TRIGGER trigger_trade_embeddings_updated_at
BEFORE UPDATE ON trade_embeddings
FOR EACH ROW EXECUTE FUNCTION update_trade_embeddings_updated_at();

-- RLS: users can only read their own embeddings; service role bypasses for writes
ALTER TABLE trade_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trade_embeddings_select_own" ON trade_embeddings
  FOR SELECT USING (auth.uid() = user_id);

-- Step 3: Semantic similarity search function
-- Called from the Node API using service role client
CREATE OR REPLACE FUNCTION match_trade_embeddings(
  query_embedding   vector(1536),
  match_user_id     UUID,
  match_count       INT     DEFAULT 5,
  match_threshold   FLOAT   DEFAULT 0.70
)
RETURNS TABLE (
  trade_id      UUID,
  user_id       UUID,
  embedded_text TEXT,
  symbol        VARCHAR,
  setup_type    TEXT,
  outcome       VARCHAR,
  pnl           NUMERIC,
  tags          TEXT[],
  similarity    FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    te.trade_id,
    te.user_id,
    te.embedded_text,
    te.symbol,
    te.setup_type,
    te.outcome,
    te.pnl,
    te.tags,
    1 - (te.embedding <=> query_embedding) AS similarity
  FROM trade_embeddings te
  WHERE te.user_id = match_user_id
    AND 1 - (te.embedding <=> query_embedding) > match_threshold
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
