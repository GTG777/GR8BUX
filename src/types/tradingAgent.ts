export type TradingAgentAction = 'BUY' | 'SELL' | 'HOLD' | 'AVOID';
export type TradingAgentAssetType = 'stock' | 'option';
export type TradingAgentMode = 'signals_only' | 'manual_paper' | 'auto_paper';

export interface TradingAgentRuleSet {
  mode: TradingAgentMode;
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  requireManualApproval: boolean;
  allowOptions: boolean;
  watchlist: string[];
}

export interface TradingAgentSignal {
  id: string;
  symbol: string;
  assetType: TradingAgentAssetType;
  action: TradingAgentAction;
  confidence: number;
  generatedAt: string;
  entry: number | null;
  stop: number | null;
  target: number | null;
  riskReward: number | null;
  maxRiskDollars: number;
  thesis: string;
  invalidation: string;
  supportingSignals: string[];
  riskFlags: string[];
  dataSource: 'massive' | 'fallback';
  status: 'new' | 'watching' | 'approved' | 'paper_filled' | 'rejected';
}

export interface TradingAgentPaperPosition {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  openedAt: string;
  thesis: string;
}

export interface TradingAgentReview {
  id: string;
  reviewForDate: string;
  createdAt: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: string;
  whatWentRight: string[];
  whatWentWrong: string[];
  improvements: string[];
  nextRulesToTest: string[];
}

export interface TradingAgentDashboard {
  fetchedAt: string;
  nextReviewAt: string;
  paperEquity: number;
  dayPnl: number;
  mode: TradingAgentMode;
  brokerStatus: 'not_connected' | 'paper_connected' | 'error';
  dataStatus: 'massive_live' | 'fallback_demo';
  rules: TradingAgentRuleSet;
  signals: TradingAgentSignal[];
  positions: TradingAgentPaperPosition[];
  latestReview: TradingAgentReview;
  warnings: string[];
}
