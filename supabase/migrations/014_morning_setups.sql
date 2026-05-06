-- Morning Setups scanner cache
-- Populated every 15 min market hours by scan-setups-background Netlify fn.
-- The API /api/market/setups reads from here and returns the most recent batch.

CREATE TABLE IF NOT EXISTS morning_setups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        UUID NOT NULL,              -- groups all rows from one scan run
  rank            INTEGER NOT NULL,
  symbol          TEXT NOT NULL,
  company         TEXT NOT NULL,
  sector          TEXT,
  price           NUMERIC(12, 4),
  change_pct      NUMERIC(8, 4),
  gap_pct         NUMERIC(8, 4),
  volume          BIGINT,
  avg_volume_20d  BIGINT,
  rsi             NUMERIC(6, 2),
  catalyst        TEXT,                       -- 'Volume Spike' | 'Gap + Hold' | 'Breakout' | 'Technical'
  catalyst_detail TEXT,
  setup_type      TEXT,                       -- 'Breakout' | 'Pullback' | 'VWAP Reclaim' | 'Gap + Hold' | 'Earnings Play'
  entry           NUMERIC(12, 4),
  stop            NUMERIC(12, 4),
  target          NUMERIC(12, 4),
  rr              TEXT,
  score           INTEGER,
  reason          TEXT,                       -- AI-generated sentence
  scanned_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_morning_setups_batch    ON morning_setups (batch_id);
CREATE INDEX IF NOT EXISTS idx_morning_setups_scanned  ON morning_setups (scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_morning_setups_rank     ON morning_setups (rank ASC);

ALTER TABLE morning_setups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read morning_setups"    ON morning_setups FOR SELECT USING (true);
CREATE POLICY "service write morning_setups"  ON morning_setups FOR ALL   USING (auth.role() = 'service_role');
