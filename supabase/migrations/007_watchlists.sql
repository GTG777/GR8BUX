-- =============================================================================
-- Migration 007: Watchlists table
-- Each user can own multiple named watchlists, each storing an array of symbols.
--
-- Run this in the Supabase SQL Editor (project: Gr8bux)
-- =============================================================================

CREATE TABLE IF NOT EXISTS watchlists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'My Watchlist',
  symbols     TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep updated_at fresh automatically
CREATE OR REPLACE FUNCTION set_watchlist_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS watchlists_updated_at ON watchlists;
CREATE TRIGGER watchlists_updated_at
  BEFORE UPDATE ON watchlists
  FOR EACH ROW EXECUTE FUNCTION set_watchlist_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "watchlists: owner all" ON watchlists;

CREATE POLICY "watchlists: owner all"
  ON watchlists FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS watchlists_user_id_idx ON watchlists (user_id);
