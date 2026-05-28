-- Coach context cache: pre-computed portfolio summary and behavioral brief per user.
-- Populated by scheduled cron jobs, read by the coach API on every message.
-- Eliminates the live DB aggregation + verbose text building from the hot path.

CREATE TABLE IF NOT EXISTS coach_context_cache (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_text     TEXT NOT NULL DEFAULT '',        -- compact portfolio summary string (~100-150 tokens)
  behavioral_brief TEXT,                            -- nightly LLM-generated behavioral analysis (~150 tokens)
  trade_count      INTEGER NOT NULL DEFAULT 0,      -- used to detect stale cache
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE coach_context_cache ENABLE ROW LEVEL SECURITY;

-- Users can read their own cache entry (for potential client-side display)
CREATE POLICY "Users can read own coach cache"
  ON coach_context_cache FOR SELECT
  USING (auth.uid() = user_id);

-- Service role (used by cron jobs and API routes) bypasses RLS
-- No additional policy needed — service role client ignores RLS by design.

-- Rolling conversation summary on coach_sessions table.
-- Stores a compressed version of long conversation histories
-- so the coach does not re-send full message arrays after 8+ messages.
ALTER TABLE coach_sessions
  ADD COLUMN IF NOT EXISTS history_summary TEXT;
