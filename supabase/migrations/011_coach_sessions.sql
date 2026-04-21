-- Coach Sessions: persist chat history per user
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS coach_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  messages    JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_coach_sessions_user_id ON coach_sessions(user_id);

-- RLS
ALTER TABLE coach_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own coach session"
  ON coach_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own coach session"
  ON coach_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own coach session"
  ON coach_sessions FOR UPDATE
  USING (auth.uid() = user_id);
