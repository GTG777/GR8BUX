-- =============================================================================
-- Migration 004: Enable Row-Level Security with proper per-user policies
-- Replaces 003_disable_rls_for_testing.sql which left all tables public.
--
-- Run this in the Supabase SQL Editor (project: Gr8bux)
-- =============================================================================

-- ─── Enable RLS on every user-data table ─────────────────────────────────────
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_trades    ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_trades   ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_legs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_logs       ENABLE ROW LEVEL SECURITY;

-- Public reference tables (no user PII — keep open for reads, restrict writes)
ALTER TABLE news_articles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_setups    ENABLE ROW LEVEL SECURITY;

-- ─── users ───────────────────────────────────────────────────────────────────
-- Each user can only read and update their own profile row.
-- Inserts are handled server-side via the service-role key.
DROP POLICY IF EXISTS "users: owner read"   ON users;
DROP POLICY IF EXISTS "users: owner update" ON users;

CREATE POLICY "users: owner read"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users: owner update"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ─── trades ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "trades: owner all" ON trades;

CREATE POLICY "trades: owner all"
  ON trades FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── stock_trades ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "stock_trades: owner all" ON stock_trades;

CREATE POLICY "stock_trades: owner all"
  ON stock_trades FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = stock_trades.trade_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = stock_trades.trade_id
        AND t.user_id = auth.uid()
    )
  );

-- ─── option_trades ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "option_trades: owner all" ON option_trades;

CREATE POLICY "option_trades: owner all"
  ON option_trades FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = option_trades.trade_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trades t
      WHERE t.id = option_trades.trade_id
        AND t.user_id = auth.uid()
    )
  );

-- ─── option_legs ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "option_legs: owner all" ON option_legs;

CREATE POLICY "option_legs: owner all"
  ON option_legs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM option_trades ot
      JOIN trades t ON t.id = ot.trade_id
      WHERE ot.id = option_legs.option_trade_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM option_trades ot
      JOIN trades t ON t.id = ot.trade_id
      WHERE ot.id = option_legs.option_trade_id
        AND t.user_id = auth.uid()
    )
  );

-- ─── auth_logs ────────────────────────────────────────────────────────────────
-- Users can read their own audit logs. No direct inserts/updates from client.
DROP POLICY IF EXISTS "auth_logs: owner read" ON auth_logs;

CREATE POLICY "auth_logs: owner read"
  ON auth_logs FOR SELECT
  USING (auth.uid() = user_id);

-- ─── news_articles ────────────────────────────────────────────────────────────
-- All authenticated users can read news. Only service role can write.
DROP POLICY IF EXISTS "news_articles: authenticated read" ON news_articles;

CREATE POLICY "news_articles: authenticated read"
  ON news_articles FOR SELECT
  TO authenticated
  USING (true);

-- ─── stock_setups ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "stock_setups: authenticated read" ON stock_setups;

CREATE POLICY "stock_setups: authenticated read"
  ON stock_setups FOR SELECT
  TO authenticated
  USING (true);

-- =============================================================================
-- IMPORTANT: All server-side API routes that write to the DB on behalf of a
-- user should use getSupabaseServiceRoleClient() so they can bypass RLS only
-- where explicitly needed (trade creation, news ingestion, etc.).
-- The anon key must NEVER be used for writes — only reads subject to RLS.
-- =============================================================================
