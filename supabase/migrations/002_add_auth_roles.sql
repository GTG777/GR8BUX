-- Add role-based authentication fields to users table

-- Add role column
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user'));

-- Add email_verified column
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- Add last_sign_in column
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sign_in TIMESTAMP WITH TIME ZONE;

-- Create index for faster role queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Create index for email verification queries
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);

-- Create audit log table for authentication events
CREATE TABLE IF NOT EXISTS auth_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('sign_up', 'sign_in', 'sign_out', 'password_reset', 'email_verified', 'role_changed')),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for auth logs
CREATE INDEX IF NOT EXISTS idx_auth_logs_user_id ON auth_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_logs_email ON auth_logs(email);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created_at ON auth_logs(created_at);

-- Function to update last_sign_in
CREATE OR REPLACE FUNCTION update_user_last_sign_in()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_sign_in = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update last_sign_in on user update
DROP TRIGGER IF EXISTS trigger_update_last_sign_in ON users;
CREATE TRIGGER trigger_update_last_sign_in
BEFORE UPDATE ON users
FOR EACH ROW
WHEN (OLD.email IS DISTINCT FROM NEW.email OR OLD.email_verified IS DISTINCT FROM NEW.email_verified)
EXECUTE FUNCTION update_user_last_sign_in();
