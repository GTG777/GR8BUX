-- Phase 3: Background AI Analysis Cache
-- market_data: raw Yahoo/options data per symbol (refreshed every 15 min)
-- ai_analyses: AI agent results per symbol (refreshed every 30 min)

-- ── market_data ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_data (
  symbol         TEXT PRIMARY KEY,
  name           TEXT,
  sector         TEXT,
  price          NUMERIC(12, 4),
  hv20           NUMERIC(8, 4),
  rsi            NUMERIC(6, 2),
  ivr            NUMERIC(6, 2),
  best_delta     NUMERIC(6, 4),
  best_expiry    TEXT,
  best_premium   NUMERIC(12, 2),
  raw_payload    JSONB,          -- full LeapsChainResponse for re-running agents
  fetch_error    BOOLEAN DEFAULT FALSE,
  refreshed_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── ai_analyses ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_analyses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol         TEXT NOT NULL,
  setup_type     TEXT NOT NULL DEFAULT 'LEAPS_CANDIDATE',
  result         JSONB NOT NULL,   -- full OrchestratorResponse
  model          TEXT,             -- which Claude model was used
  agents_ran     TEXT[],           -- e.g. {technical,greeks,sentiment,risk,strategy}
  consensus      TEXT,             -- STRONG_BUY | BUY | NEUTRAL | WAIT | AVOID
  confidence     NUMERIC(4, 3),    -- 0.000–1.000
  refreshed_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (symbol, setup_type)
);

-- Indexes for fast lookups from the frontend
CREATE INDEX IF NOT EXISTS idx_market_data_refreshed ON market_data (refreshed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_symbol ON ai_analyses (symbol);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_refreshed ON ai_analyses (refreshed_at DESC);

-- RLS: allow service role full access; anon can only read
ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read market_data"  ON market_data  FOR SELECT USING (true);
CREATE POLICY "public read ai_analyses"  ON ai_analyses  FOR SELECT USING (true);
CREATE POLICY "service write market_data" ON market_data FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service write ai_analyses" ON ai_analyses FOR ALL USING (auth.role() = 'service_role');
