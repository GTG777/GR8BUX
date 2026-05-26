-- Trading agent approvals + paper positions

CREATE TABLE IF NOT EXISTS trading_agent_signal_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id   TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('approved', 'rejected', 'paper_filled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, signal_id)
);

CREATE TABLE IF NOT EXISTS trading_agent_paper_positions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id   TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  side        TEXT NOT NULL CHECK (side IN ('long', 'short')),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  entry_price NUMERIC(14, 4) NOT NULL CHECK (entry_price > 0),
  stop_price  NUMERIC(14, 4),
  target_price NUMERIC(14, 4),
  thesis      TEXT NOT NULL DEFAULT '',
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ,
  exit_price  NUMERIC(14, 4),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trading_agent_signal_actions_user_id
  ON trading_agent_signal_actions (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_trading_agent_paper_positions_user_id
  ON trading_agent_paper_positions (user_id, opened_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_agent_paper_positions_open_signal
  ON trading_agent_paper_positions (user_id, signal_id)
  WHERE status = 'open';

CREATE OR REPLACE FUNCTION set_trading_agent_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trading_agent_signal_actions_updated_at ON trading_agent_signal_actions;
CREATE TRIGGER trading_agent_signal_actions_updated_at
  BEFORE UPDATE ON trading_agent_signal_actions
  FOR EACH ROW EXECUTE FUNCTION set_trading_agent_updated_at();

DROP TRIGGER IF EXISTS trading_agent_paper_positions_updated_at ON trading_agent_paper_positions;
CREATE TRIGGER trading_agent_paper_positions_updated_at
  BEFORE UPDATE ON trading_agent_paper_positions
  FOR EACH ROW EXECUTE FUNCTION set_trading_agent_updated_at();

ALTER TABLE trading_agent_signal_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_agent_paper_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trading_agent_signal_actions: owner all" ON trading_agent_signal_actions;
CREATE POLICY "trading_agent_signal_actions: owner all"
  ON trading_agent_signal_actions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "trading_agent_paper_positions: owner all" ON trading_agent_paper_positions;
CREATE POLICY "trading_agent_paper_positions: owner all"
  ON trading_agent_paper_positions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
