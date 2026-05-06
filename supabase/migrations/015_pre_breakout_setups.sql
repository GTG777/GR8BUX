-- Pre-Breakout Setups scanner cache
-- Populated every 15 min market hours by scan-prebreakout-background Netlify fn.
-- Finds stocks in COMPRESSION before a move, not after.
-- Signals: NR7, ATR squeeze, volume accumulation, near 20d high, gap-and-absorb.

CREATE TABLE IF NOT EXISTS pre_breakout_setups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        UUID NOT NULL,
  rank            INTEGER NOT NULL,
  symbol          TEXT NOT NULL,
  company         TEXT NOT NULL,
  price           NUMERIC(12, 4),
  change_pct      NUMERIC(8, 4),
  gap_pct         NUMERIC(8, 4),
  volume          BIGINT,
  avg_volume_20d  BIGINT,
  rsi             NUMERIC(6, 2),
  atr_ratio       NUMERIC(6, 4),              -- ATR(5)/ATR(20) — compression < 0.65
  dist_from_high  NUMERIC(8, 4),              -- % below 20d high
  signals         TEXT[],                     -- e.g. ['NR7', 'ATR Squeeze', 'Vol Accumulation']
  setup_type      TEXT,
  entry           NUMERIC(12, 4),
  stop            NUMERIC(12, 4),
  target          NUMERIC(12, 4),
  rr              TEXT,
  score           INTEGER,
  reason          TEXT,
  scanned_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pre_breakout_batch   ON pre_breakout_setups (batch_id);
CREATE INDEX IF NOT EXISTS idx_pre_breakout_scanned ON pre_breakout_setups (scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_pre_breakout_rank    ON pre_breakout_setups (rank ASC);

ALTER TABLE pre_breakout_setups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read pre_breakout_setups"   ON pre_breakout_setups FOR SELECT USING (true);
CREATE POLICY "service write pre_breakout_setups" ON pre_breakout_setups FOR ALL   USING (auth.role() = 'service_role');
