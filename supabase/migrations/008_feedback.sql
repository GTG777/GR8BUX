-- Feedback table for collecting user feedback
-- Users can submit feedback; admins can read all feedback

CREATE TABLE IF NOT EXISTS feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  email        TEXT NOT NULL,
  display_name TEXT,
  category     VARCHAR(30) NOT NULL DEFAULT 'general' CHECK (category IN ('bug', 'feature', 'general', 'other')),
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message      TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 2000),
  status       VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_user_id   ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_category  ON feedback(category);
CREATE INDEX IF NOT EXISTS idx_feedback_status    ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_feedback_updated_at ON feedback;
CREATE TRIGGER trigger_feedback_updated_at
BEFORE UPDATE ON feedback
FOR EACH ROW EXECUTE FUNCTION update_feedback_updated_at();

-- Enable RLS
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can insert their own feedback
CREATE POLICY "feedback_insert_own" ON feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own feedback
CREATE POLICY "feedback_select_own" ON feedback
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all feedback
CREATE POLICY "feedback_select_admin" ON feedback
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );

-- Admins can update feedback status
CREATE POLICY "feedback_update_admin" ON feedback
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );
