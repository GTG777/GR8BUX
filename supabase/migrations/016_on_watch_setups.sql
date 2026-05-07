-- On Watch setups: earnings today/tomorrow + unusual volume surges
-- Populated by scan-onwatch-background Netlify function (every 15 min market hours)

CREATE TABLE IF NOT EXISTS on_watch_setups (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         UUID        NOT NULL,
  rank             INTEGER     NOT NULL,
  symbol           TEXT        NOT NULL,
  company          TEXT        NOT NULL DEFAULT '',
  price            NUMERIC(12, 4),
  change_pct       NUMERIC(8, 4),
  gap_pct          NUMERIC(8, 4),
  volume           BIGINT,
  avg_volume_20d   BIGINT,
  rsi              NUMERIC(6, 2),
  -- Signal metadata
  signal_type      TEXT        NOT NULL, -- 'earnings_today' | 'earnings_tomorrow' | 'vol_surge' | 'earnings_vol_combo'
  report_date      DATE,                 -- populated for earnings signals
  hv20             NUMERIC(8, 2),        -- 20-day historical volatility %
  eps_beat_streak  INTEGER,              -- consecutive quarters beating EPS
  avg_surprise_pct NUMERIC(8, 2),        -- avg absolute EPS surprise % last 8Q
  vol_ratio        NUMERIC(8, 2),        -- volume / avg_volume_20d
  -- Levels
  setup_type       TEXT,
  entry            NUMERIC(12, 4),
  stop             NUMERIC(12, 4),
  target           NUMERIC(12, 4),
  rr               TEXT,
  score            INTEGER,
  reason           TEXT,
  scanned_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_on_watch_batch_id    ON on_watch_setups (batch_id);
CREATE INDEX IF NOT EXISTS idx_on_watch_scanned_at  ON on_watch_setups (scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_on_watch_symbol      ON on_watch_setups (symbol);

ALTER TABLE on_watch_setups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read on_watch_setups"   ON on_watch_setups FOR SELECT USING (true);
CREATE POLICY "service write on_watch_setups" ON on_watch_setups FOR ALL   USING (auth.role() = 'service_role');
