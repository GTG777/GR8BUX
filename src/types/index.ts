// Trade Types
export interface Trade {
  id: string;
  userId: string;
  type: 'stock' | 'option';
  symbol: string;
  entryDate: string;
  exitDate?: string;
  relatedNews?: string[]; // IDs of news articles
  commission: number;
  pnl?: number; // calculated
  notes: string;
  planNotes: string;
  tags: string[];
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;

  // Stock-specific
  stockData?: StockTrade;

  // Option-specific
  optionData?: OptionTrade;
}

export interface StockTrade {
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
}

export interface OptionTrade {
  legs: OptionLeg[];
  strategy?: string; // e.g., "call spread", "put debit spread"
  totalPremium: number;
  totalCost?: number;
}

export interface OptionLeg {
  id: string;
  symbol: string;
  type: 'call' | 'put';
  strikePrice: number;
  expirationDate: string;
  direction: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  greeks?: GreeksData;
}

export interface GreeksData {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho?: number;
}

export interface OptionGreeks extends GreeksData {
  premium?: number;
}

// News & Market Monitoring Types
export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  symbols: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  tradedByUser?: boolean;
  createdAt: string;
}

export interface StockSetup {
  id: string;
  symbol: string;
  setupType: 'coiling' | 'breakout' | 'support-bounce' | 'custom';
  technicalIndicators: TechnicalIndicators;
  detectedAt: string;
  communityMentions?: number;
  newsCount?: number;
  tradedByUser?: boolean;
  createdAt: string;
}

export interface TechnicalIndicators {
  rsi?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  bbPercentage?: number;
  consolidationStrength?: number; // 0-1 scale
  volatility?: number;
  volume?: number;
  priceRange?: {
    high: number;
    low: number;
  };
}

export interface CommunitySource {
  id: string;
  symbol: string;
  sourceType: 'reddit' | 'stocktwits' | 'other';
  sentiment: number; // -1 to 1 scale
  mentionCount: number;
  sourceName?: string;
  lastUpdated: string;
}

// Analytics Types
export interface TradeAnalytics {
  totalTrades: number;
  totalPnL: number;
  winRate: number;
  avgWinSize: number;
  avgLossSize: number;
  largestWin: number;
  largestLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  profitFactor: number;
  riskRewardRatio: number;
  maxDrawdown: number;
  byStrategy: Record<string, StrategyAnalytics>;
  bySymbol: Record<string, SymbolAnalytics>;
  byPeriod: Record<string, PeriodAnalytics>;
}

export interface StrategyAnalytics {
  name: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
}

export interface SymbolAnalytics {
  symbol: string;
  totalTrades: number;
  wins: number;
  losses: number;
  totalPnL: number;
  avgPnL: number;
}

export interface PeriodAnalytics {
  period: string;
  trades: number;
  pnl: number;
}

// Auth Types
export type UserRole = 'admin' | 'manager' | 'user';

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  role: UserRole;
  emailVerified: boolean;
  lastSignIn?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface PasswordResetInput {
  email: string;
}

// User Types
export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  displayName?: string;
  avatar?: string;
  emailVerified: boolean;
  createdAt: string;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  dateFormat?: string;
  timezone?: string;
  currencySymbol?: string;
  theme?: 'light' | 'dark';
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
