-- Earnings calendar: stores upcoming earnings dates for all symbols from Nasdaq
-- Populated by earnings-enrichment-background Netlify function (runs on cron)
-- Replaces the per-request Nasdaq fan-out in /api/market/earnings-all

CREATE TABLE IF NOT EXISTS earnings_calendar (
  symbol               TEXT        NOT NULL,
  report_date          DATE        NOT NULL,
  name                 TEXT        NOT NULL DEFAULT '',
  fiscal_date_ending   DATE,
  estimated_eps        NUMERIC(10, 4),
  currency             TEXT        NOT NULL DEFAULT 'USD',
  refreshed_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (symbol, report_date)
);

CREATE INDEX IF NOT EXISTS idx_earnings_calendar_report_date ON earnings_calendar (report_date ASC);
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_symbol      ON earnings_calendar (symbol);
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_refreshed   ON earnings_calendar (refreshed_at DESC);

ALTER TABLE earnings_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read earnings_calendar"   ON earnings_calendar FOR SELECT USING (true);
CREATE POLICY "service write earnings_calendar" ON earnings_calendar FOR ALL   USING (auth.role() = 'service_role');
