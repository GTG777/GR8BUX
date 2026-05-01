-- Earnings enrichment cache: HV20 + EPS beat streak for any symbol
-- Populated nightly by /api/cron/refresh-earnings-enrichment
-- Separate from market_data so all-earnings tab works for any ticker

CREATE TABLE IF NOT EXISTS earnings_enrichment (
  symbol            TEXT PRIMARY KEY,
  hv20              NUMERIC(8, 2),          -- 20-day historical volatility (annualised %)
  eps_beat_streak   INTEGER,                 -- consecutive quarters beating EPS consensus
  avg_surprise_pct  NUMERIC(8, 2),           -- avg absolute EPS surprise % last 8Q
  hv20_refreshed_at  TIMESTAMP WITH TIME ZONE,
  streak_refreshed_at TIMESTAMP WITH TIME ZONE,
  refreshed_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_earnings_enrichment_refreshed ON earnings_enrichment (refreshed_at DESC);

ALTER TABLE earnings_enrichment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read earnings_enrichment"   ON earnings_enrichment FOR SELECT USING (true);
CREATE POLICY "service write earnings_enrichment" ON earnings_enrichment FOR ALL USING (auth.role() = 'service_role');
