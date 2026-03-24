-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create trades table
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(10) NOT NULL CHECK (type IN ('stock', 'option')),
  symbol VARCHAR(20) NOT NULL,
  entry_date TIMESTAMP WITH TIME ZONE NOT NULL,
  exit_date TIMESTAMP WITH TIME ZONE,
  commission NUMERIC(10, 2) NOT NULL DEFAULT 0,
  pnl NUMERIC(12, 2),
  notes TEXT,
  plan_notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_dates CHECK (exit_date IS NULL OR exit_date >= entry_date)
);

-- Create stock_trades table
CREATE TABLE IF NOT EXISTS stock_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL UNIQUE REFERENCES trades(id) ON DELETE CASCADE,
  quantity NUMERIC(12, 4) NOT NULL,
  entry_price NUMERIC(12, 4) NOT NULL,
  exit_price NUMERIC(12, 4),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create option_trades table
CREATE TABLE IF NOT EXISTS option_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL UNIQUE REFERENCES trades(id) ON DELETE CASCADE,
  strategy VARCHAR(50),
  total_premium NUMERIC(12, 2) NOT NULL,
  total_cost NUMERIC(12, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create option_legs table
CREATE TABLE IF NOT EXISTS option_legs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_trade_id UUID NOT NULL REFERENCES option_trades(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  type VARCHAR(5) NOT NULL CHECK (type IN ('call', 'put')),
  strike_price NUMERIC(10, 4) NOT NULL,
  expiration_date DATE NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('long', 'short')),
  quantity NUMERIC(12, 4) NOT NULL,
  entry_price NUMERIC(12, 4) NOT NULL,
  exit_price NUMERIC(12, 4),
  delta NUMERIC(8, 6),
  gamma NUMERIC(8, 6),
  theta NUMERIC(8, 6),
  vega NUMERIC(8, 6),
  rho NUMERIC(8, 6),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create news_articles table
CREATE TABLE IF NOT EXISTS news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  source VARCHAR(50) NOT NULL,
  source_url TEXT NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL,
  symbols TEXT[] NOT NULL,
  sentiment VARCHAR(20) CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, source_url)
);

-- Create stock_setups table
CREATE TABLE IF NOT EXISTS stock_setups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(20) NOT NULL,
  setup_type VARCHAR(50) NOT NULL,
  rsi NUMERIC(8, 2),
  bb_upper NUMERIC(12, 4),
  bb_middle NUMERIC(12, 4),
  bb_lower NUMERIC(12, 4),
  bb_percentage NUMERIC(8, 4),
  consolidation_strength NUMERIC(4, 2),
  volatility NUMERIC(8, 4),
  volume NUMERIC(16, 0),
  price_high NUMERIC(12, 4),
  price_low NUMERIC(12, 4),
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  community_mentions INTEGER DEFAULT 0,
  news_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create community_sources table
CREATE TABLE IF NOT EXISTS community_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(20) NOT NULL,
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('reddit', 'stocktwits', 'other')),
  sentiment NUMERIC(4, 2) NOT NULL,
  mention_count INTEGER NOT NULL DEFAULT 0,
  source_name VARCHAR(100),
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(symbol, source_type, source_name)
);

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  date_format VARCHAR(50) DEFAULT 'MM/DD/YYYY',
  timezone VARCHAR(50) DEFAULT 'UTC',
  currency_symbol VARCHAR(5) DEFAULT '$',
  theme VARCHAR(20) DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create functions for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stock_trades_updated_at BEFORE UPDATE ON stock_trades
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_option_trades_updated_at BEFORE UPDATE ON option_trades
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_option_legs_updated_at BEFORE UPDATE ON option_legs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stock_setups_updated_at BEFORE UPDATE ON stock_setups
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_created_at ON trades(created_at DESC);
CREATE INDEX idx_news_articles_symbols ON news_articles USING GIN(symbols);
CREATE INDEX idx_stock_setups_symbol ON stock_setups(symbol);
CREATE INDEX idx_community_sources_symbol ON community_sources(symbol);
