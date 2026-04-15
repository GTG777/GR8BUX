/**
 * Technical Analyst Agent
 * Analyzes chart patterns, technical indicators, and setup quality
 */

import { Agent, AgentConfig } from './baseAgent';
import { TechnicalAnalysis } from '@/types/agents';

export interface TechnicalSetupData {
  symbol: string;
  setupType: string;
  rsi?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  bbPercentage?: number;
  consolidationStrength?: number;
  volatility?: number;
  volume?: number;
  priceHigh?: number;
  priceLow?: number;
  currentPrice: number;
  support?: number;
  resistance?: number;
  priceHistory?: Array<{ date: string; close: number; volume: number; rsi: number }>;
  detectedAt: string;
}

export class TechnicalAnalyst extends Agent {
  constructor(config: AgentConfig = {}) {
    super(config);
  }

  /**
   * Analyze technical setup and return quality score + recommendation
   */
  async analyzeSetup(setup: TechnicalSetupData): Promise<TechnicalAnalysis> {
    const systemPrompt = `You are a professional technical analysis expert with 15+ years of trading experience. 
Your role is to objectively analyze trading setups and provide clear, data-driven recommendations.

You evaluate setups on:
1. Pattern validity: Is the setup actually forming? How many data points confirm it?
2. Signal strength: RSI levels, volume confirmation, support/resistance validity
3. Risk/reward: Calculate realistic targets and stops based on technical levels
4. Confluence: Do multiple indicators align? (e.g., RSI + price action + volume)
5. Market context: Consider current volatility, support/resistance, trend

Be honest about limitations and uncertainty. Flag ambiguous signals clearly.
Use 0-100 quality score where:
- 85-100: Excellent setup, high confidence trade
- 70-84: Good setup, moderate-high confidence
- 55-69: Acceptable setup, moderate confidence
- 40-54: Weak setup, low confidence
- Below 40: Avoid or wait

Always respond with valid JSON.`;

    const setupContext = this.formatTechnicalContext({
      symbol: setup.symbol,
      setupType: setup.setupType,
      currentPrice: setup.currentPrice,
      technicalIndicators: {
        rsi: setup.rsi,
        bollingerBands: {
          upper: setup.bbUpper,
          middle: setup.bbMiddle,
          lower: setup.bbLower,
          percentB: setup.bbPercentage,
        },
        consolidationStrength: setup.consolidationStrength,
        volatility: setup.volatility,
        volume: setup.volume,
      },
      priceStructure: {
        high: setup.priceHigh,
        low: setup.priceLow,
        support: setup.support,
        resistance: setup.resistance,
      },
      detectedAt: setup.detectedAt,
      recentPriceHistory: setup.priceHistory?.slice(-5),
    });

    const prompt = `Analyze this ${setup.setupType} setup for ${setup.symbol}:

${setupContext}

Provide a comprehensive technical analysis in this JSON format:
{
  "qualityScore": <0-100>,
  "confidence": <0-1>,
  "reasoning": "<main analysis paragraph>",
  "keySignals": {
    "positive": ["signal1", "signal2"],
    "negative": ["caution1"],
    "neutral": ["note1"]
  },
  "redFlags": ["flag1", "flag2"],
  "recommendation": "<STRONG_BUY|BUY|NEUTRAL|WAIT|AVOID>",
  "riskRewardRatio": <number or null>,
  "targetPrice": <number or null>,
  "stopPrice": <number or null>
}`;

    try {
      const response = await this.query(prompt, systemPrompt);
      const parsed = this.parseJsonResponse<any>(response);

      return {
        agentType: 'technical',
        symbol: setup.symbol,
        setupType: setup.setupType,
        qualityScore: Math.min(100, Math.max(0, parsed.qualityScore || 50)),
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || 'Analysis complete',
        keySignals: parsed.keySignals || { positive: [], negative: [], neutral: [] },
        redFlags: parsed.redFlags || [],
        recommendation: parsed.recommendation || 'NEUTRAL',
        riskRewardRatio: parsed.riskRewardRatio,
        targetPrice: parsed.targetPrice,
        stopPrice: parsed.stopPrice,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[TechnicalAnalyst Error]', error);
      throw error;
    }
  }

  /**
   * Batch analyze multiple setups
   */
  async analyzeMultipleSetups(setups: TechnicalSetupData[]): Promise<TechnicalAnalysis[]> {
    return Promise.all(setups.map((setup) => this.analyzeSetup(setup)));
  }

  /**
   * Score setup quality specifically for LEAPS screener context
   */
  async scoreLeapsSetup(setup: TechnicalSetupData & { ivRank: number; hv20: number; delta: number; premium: number }): Promise<TechnicalAnalysis> {
    const systemPrompt = `You are a LEAPS (long-dated options) technical analysis specialist. 
Your expertise is identifying high-quality long-term setups that are ideal for:
- LEAP call/put purchases for directional bets
- Multi-month income strategies
- Deep ITM/OTM speculative plays

Evaluate based on:
1. Long-term trend strength (not just short-term bounces)
2. Support/resistance zones that matter for months, not days
3. IV Rank extremes that offer good premium pricing
4. Historical reversal levels from years of data if available

LEAPS quality factors:
- 85-100: Excellent long-term setup, clear thesis, strong R:R
- 70-84: Good setup, solid thesis, reasonable R:R  
- 55-69: Acceptable, thesis is okay, R:R is marginal
- Below 55: Skip, wait for better entry

Always respond with valid JSON.`;

    const setupContext = this.formatTechnicalContext({
      symbol: setup.symbol,
      setupType: setup.setupType,
      currentPrice: setup.currentPrice,
      technicalIndicators: setup.rsi ? { rsi: setup.rsi } : {},
      leapsContext: {
        ivRank: setup.ivRank,
        historicalVolatility20: setup.hv20,
        estimatedDelta: setup.delta,
        premiumValue: setup.premium,
        priceRange: { high: setup.priceHigh, low: setup.priceLow },
      },
      timeframe: 'LEAPS (91+ days to expiration)',
    });

    const prompt = `Rate this LEAPS setup for ${setup.symbol}:

${setupContext}

Provide LEAPS-specific quality assessment:
{
  "qualityScore": <0-100 for LEAPS context>,
  "confidence": <0-1>,
  "reasoning": "<focused on long-term thesis>",
  "keySignals": {
    "positive": ["long-term positive"],
    "negative": ["long-term caution"],
    "neutral": []
  },
  "redFlags": ["LEAPS-relevant flags"],
  "recommendation": "<STRONG_BUY|BUY|NEUTRAL|WAIT|AVOID>",
  "riskRewardRatio": <reasonable for months>,
  "targetPrice": <long-term target>,
  "stopPrice": <long-term support/resistance>
}`;

    try {
      const response = await this.query(prompt, systemPrompt);
      const parsed = this.parseJsonResponse<any>(response);

      return {
        agentType: 'technical',
        symbol: setup.symbol,
        setupType: setup.setupType,
        qualityScore: Math.min(100, Math.max(0, parsed.qualityScore || 50)),
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || 'LEAPS analysis complete',
        keySignals: parsed.keySignals || { positive: [], negative: [], neutral: [] },
        redFlags: parsed.redFlags || [],
        recommendation: parsed.recommendation || 'NEUTRAL',
        riskRewardRatio: parsed.riskRewardRatio,
        targetPrice: parsed.targetPrice,
        stopPrice: parsed.stopPrice,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[TechnicalAnalyst LEAPS Error]', error);
      throw error;
    }
  }
}

// Singleton instance
let technicalAnalystInstance: TechnicalAnalyst | null = null;

export function getTechnicalAnalyst(config?: AgentConfig): TechnicalAnalyst {
  if (!technicalAnalystInstance) {
    technicalAnalystInstance = new TechnicalAnalyst(config);
  }
  return technicalAnalystInstance;
}
