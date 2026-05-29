-- =============================================================================
-- Migration 019: Subscriptions + Usage Metrics
--
-- Creates:
--   subscriptions   — one row per user, tracks plan + Stripe IDs + billing dates
--   usage_metrics   — monthly per-user usage counters (AI coach messages, etc.)
--
-- Triggers:
--   on_user_created → auto-creates a free subscription row when a new user is
--   inserted into public.users (which itself is created by the auth trigger in 006)
--
-- Run this in the Supabase SQL Editor (project: Gr8bux)
-- =============================================================================

-- ─── subscriptions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                TEXT        NOT NULL DEFAULT 'free'
                         CHECK (plan_id IN ('free', 'starter', 'pro', 'elite')),
  status                 TEXT        NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  billing_cycle          TEXT        CHECK (billing_cycle IN ('monthly', 'annual')),
  stripe_customer_id     TEXT        UNIQUE,
  stripe_subscription_id TEXT        UNIQUE,
  stripe_price_id        TEXT,
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN     NOT NULL DEFAULT FALSE,
  trial_end              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Service role writes only (no client-side inserts/updates)
-- (No INSERT/UPDATE/DELETE policy — only service role key bypasses RLS)

-- ─── usage_metrics ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_metrics (
  id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start            DATE    NOT NULL,  -- first day of billing month, e.g. 2026-05-01
  trade_coach_messages    INT     NOT NULL DEFAULT 0,
  stock_coach_messages    INT     NOT NULL DEFAULT 0,
  options_coach_messages  INT     NOT NULL DEFAULT 0,
  leaps_queries           INT     NOT NULL DEFAULT 0,
  trades_logged           INT     NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_start)
);

ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage"
  ON usage_metrics FOR SELECT
  USING (auth.uid() = user_id);

-- ─── Trigger: auto-create free subscription on user creation ─────────────────
CREATE OR REPLACE FUNCTION public.create_free_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan_id, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_created_subscription ON public.users;
CREATE TRIGGER on_user_created_subscription
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.create_free_subscription();

-- ─── Backfill: create free subscriptions for all existing users ───────────────
-- Only insert rows where the user also exists in auth.users (the FK target).
-- Orphaned rows in public.users with no auth record are skipped.
INSERT INTO public.subscriptions (user_id, plan_id, status)
SELECT u.id, 'free', 'active'
FROM public.users u
WHERE EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- ─── RPC: atomic usage increment ─────────────────────────────────────────────
-- Called server-side after each AI coach response to track monthly usage.
-- Uses INSERT ... ON CONFLICT DO UPDATE to atomically upsert the counter.
CREATE OR REPLACE FUNCTION public.increment_usage_metric(
  p_user_id UUID,
  p_period  DATE,
  p_metric  TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_metric = 'trade_coach_messages' THEN
    INSERT INTO usage_metrics (user_id, period_start, trade_coach_messages, updated_at)
    VALUES (p_user_id, p_period, 1, now())
    ON CONFLICT (user_id, period_start)
    DO UPDATE SET trade_coach_messages = usage_metrics.trade_coach_messages + 1, updated_at = now();

  ELSIF p_metric = 'stock_coach_messages' THEN
    INSERT INTO usage_metrics (user_id, period_start, stock_coach_messages, updated_at)
    VALUES (p_user_id, p_period, 1, now())
    ON CONFLICT (user_id, period_start)
    DO UPDATE SET stock_coach_messages = usage_metrics.stock_coach_messages + 1, updated_at = now();

  ELSIF p_metric = 'options_coach_messages' THEN
    INSERT INTO usage_metrics (user_id, period_start, options_coach_messages, updated_at)
    VALUES (p_user_id, p_period, 1, now())
    ON CONFLICT (user_id, period_start)
    DO UPDATE SET options_coach_messages = usage_metrics.options_coach_messages + 1, updated_at = now();

  ELSIF p_metric = 'leaps_queries' THEN
    INSERT INTO usage_metrics (user_id, period_start, leaps_queries, updated_at)
    VALUES (p_user_id, p_period, 1, now())
    ON CONFLICT (user_id, period_start)
    DO UPDATE SET leaps_queries = usage_metrics.leaps_queries + 1, updated_at = now();

  ELSIF p_metric = 'trades_logged' THEN
    INSERT INTO usage_metrics (user_id, period_start, trades_logged, updated_at)
    VALUES (p_user_id, p_period, 1, now())
    ON CONFLICT (user_id, period_start)
    DO UPDATE SET trades_logged = usage_metrics.trades_logged + 1, updated_at = now();
  END IF;
END;
$$;
