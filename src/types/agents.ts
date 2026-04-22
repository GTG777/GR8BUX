/**
 * AI Agent Types & Response Schemas
 * Defines the structure for all agent responses across GR8BUX
 */

// Agent Types
export type AgentType = 'technical' | 'greeks' | 'risk_manager' | 'sentiment' | 'strategist' | 'coach';

// Coach Agent — RAG-powered
export interface CoachSimilarTrade {
  trade_id: string;
  symbol: string;
  setup_type: string | null;
  outcome: 'win' | 'loss' | 'breakeven';
  pnl: number | null;
  tags: string[];
  similarity: number;
  embedded_text: string;
}

export interface CoachPatterns {
  winRate: number;
  avgWin: number;
  avgLoss: number;
  topSetups: string[];
  riskWarnings: string[];
}

export interface CoachTokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Estimated cost in USD based on claude-sonnet-4-5 pricing */
  estimatedCostUsd: number;
}

export interface CoachChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  similarTrades?: CoachSimilarTrade[];
  patterns?: CoachPatterns;
  suggestedActions?: string[];
  usage?: CoachTokenUsage;
}

// Technical Analyst Responses
export interface TechnicalAnalysis {
  agentType: 'technical';
  symbol: string;
  setupType: string;
  qualityScore: number; // 0-100
  confidence: number; // 0-1
  reasoning: string;
  keySignals: {
    positive: string[];
    negative: string[];
    neutral: string[];
  };
  redFlags: string[];
  recommendation: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'WAIT' | 'AVOID';
  riskRewardRatio?: number;
  targetPrice?: number;
  stopPrice?: number;
  timestamp: string;
}

// Greeks Advisor Responses
export interface GreeksAnalysis {
  agentType: 'greeks';
  symbol: string;
  recommendedStrategy: {
    name: string;
    strikes: number[];
    directions: ('long' | 'short')[];
    expirationDaysToExpiry: number;
    description: string;
  };
  greeksAtEntry: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho?: number;
  };
  scenarioAnalysis: {
    moveUp5pct: number;
    moveUp10pct: number;
    moveDown5pct: number;
    moveDown10pct: number;
  };
  ivAnalysis: {
    currentIVRank: number;
    historical: number;
    interpretation: string;
  };
  risks: string[];
  optimization: string;
  timestamp: string;
}

// Risk Manager Responses
export interface RiskAssessment {
  agentType: 'risk_manager';
  recommendedPositionSize: number; // contracts or shares
  rationale: string;
  portfolioImpact: {
    deltaBefore: number;
    deltaAfter: number;
    vegaBefore: number;
    vegaAfter: number;
    thetaBefore: number;
    thetaAfter: number;
  };
  exposureAlerts: {
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    message: string;
  }[];
  hedgeSuggestions?: {
    instrument: string;
    rationale: string;
    expectedCost: number;
  }[];
  maxLossScenario: number;
  maxProfitScenario: number;
  timestamp: string;
}

// Sentiment Analyst Responses
export interface SentimentAnalysis {
  agentType: 'sentiment';
  symbol: string;
  overallSentiment: 'VERY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'VERY_BEARISH';
  sentimentScore: number; // -1 (very bearish) to +1 (very bullish)
  sources: {
    news: {
      score: number;
      count: number;
      topThemes: string[];
    };
    social: {
      score: number;
      mentionCount: number;
      platforms: string[];
    };
    insider: {
      score: number;
      buyCount: number;
      sellCount: number;
    };
  };
  keyDrivers: string[];
  conflictingSignals: string[];
  catalysts: {
    date: string;
    event: string;
    expectedImpact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  }[];
  marketConsensus: string;
  timestamp: string;
}

// Trade Strategist Responses
export interface TradeStrategy {
  agentType: 'strategist';
  symbol: string;
  tradeIdea: {
    type: 'CALL_SPREAD' | 'PUT_SPREAD' | 'CALENDAR' | 'IRON_CONDOR' | 'STOCK' | 'OTHER';
    description: string;
  };
  confluenceScore: number; // 0-100 (how many signals align)
  entry: {
    signal: string;
    triggerPrice: number;
    timing: string;
  };
  targets: {
    target1: { price: number; profitPercent: number };
    target2: { price: number; profitPercent: number };
  };
  stopLoss: {
    price: number;
    lossPercent: number;
  };
  historicalSimilarity: {
    matchCount: number;
    winRate: number;
    avgRiskReward: number;
  };
  reasoning: string;
  riskWarnings: string[];
  timestamp: string;
}

// Learning Coach Responses
export interface CoachingInsight {
  agentType: 'coach';
  tradeId: string;
  outcome: 'WIN' | 'LOSS' | 'BREAK_EVEN';
  profitPercent: number;
  analysis: {
    whatWorked: string[];
    whatCouldImprove: string[];
    emotionalFactors: string[];
  };
  patterns: {
    pattern: string;
    frequency: string;
    impact: string;
    trend: 'IMPROVING' | 'DEGRADING' | 'STABLE';
  }[];
  blindSpots: string[];
  recommendations: {
    focus: string;
    reason: string;
    action: string;
  }[];
  drillSuggestion?: {
    exercise: string;
    duration: string;
  };
  timestamp: string;
}

// Union type for all agent responses
export type AgentResponse =
  | TechnicalAnalysis
  | GreeksAnalysis
  | RiskAssessment
  | SentimentAnalysis
  | TradeStrategy
  | CoachingInsight;

// AI Orchestrator Response (combines multiple agents)
export interface OrchestratorResponse {
  setupId: string;
  timestamp: string;
  analyses: {
    technical?: TechnicalAnalysis;
    greeks?: GreeksAnalysis;
    risk?: RiskAssessment;
    sentiment?: SentimentAnalysis;
    strategy?: TradeStrategy;
  };
  consensusRecommendation: {
    action: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'WAIT' | 'AVOID';
    confidence: number; // 0-1, average of constituent agents
    reasoning: string;
    cautions: string[];
    nextSteps: string[];
  };
  explanations: {
    // Each section explains its recommendation
    technicalReasoning?: string;
    greeksReasoning?: string;
    riskReasoning?: string;
    sentimentReasoning?: string;
    strategyReasoning?: string;
  };
}

// UI Component Props for displaying responses
export interface AgentResponseDisplayProps {
  response: AgentResponse;
  isLoading?: boolean;
  error?: string;
  onTradeClick?: () => void;
}

export interface OrchestratorResponseDisplayProps {
  response: OrchestratorResponse;
  isLoading?: boolean;
  error?: string;
  onExecute?: () => void;
  onRefine?: () => void;
}
