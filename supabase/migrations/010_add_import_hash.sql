-- Migration 010: Add import_hash to trades for idempotent CSV imports
-- The hash is a fingerprint of: date|action|symbol|quantity|price
-- This allows the same CSV to be re-uploaded without creating duplicates
-- while correctly allowing two buys of the same stock on the same day
-- at different prices or quantities.

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS import_hash VARCHAR(64);

-- Partial unique index: only enforce uniqueness when a hash is present
-- (manually-entered trades have NULL hash and are always allowed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_import_hash
  ON trades (user_id, import_hash)
  WHERE import_hash IS NOT NULL;

COMMENT ON COLUMN trades.import_hash IS
  'SHA-256 fingerprint of the source broker transaction row. Used to skip duplicate imports.';
