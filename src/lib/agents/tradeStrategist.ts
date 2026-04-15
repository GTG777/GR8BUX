/**
 * Trade Strategist Agent
 * Synthesizes all agent inputs into a complete, actionable trade plan
 */

import { Agent, AgentConfig } from './baseAgent';
import { TradeStrategy, TechnicalAnalysis, GreeksAnalysis, RiskAssessment, SentimentAnalysis } from '@/types/agents';

export interface StrategyInput {
  symbol: string;
  currentPrice: number;
  setupType: string;
  // Results from other agents (pass what's available)
  technicalAnalysis?: TechnicalAnalysis;
  greeksAnalysis?: GreeksAnalysis;
  riskAssessment?: RiskAssessment;
  sentimentAnalysis?: SentimentAnalysis;
  // Raw data fallback if agents not run
  rsi?: number;
  ivRank?: number;
  support?: number;
  resistance?: number;
}

export class TradeStrategist extends Agent {
  constructor(config: AgentConfig = {}) {
    super(config);
  }

  async buildStrategy(input: StrategyInput): Promise<TradeStrategy> {
    const systemPrompt = `You are an elite trade strategist who synthesizes technical, options, risk, and sentiment signals into a single coherent trade plan.

Your job is to take all available analysis and produce:
1. A specific, executable trade idea with exact entry trigger
2. Two profit targets (conservative + aggressive) 
3. A clearly defined stop loss
4. A confluence score (how many signals align)
5. Risk warnings for this specific trade

Rules:
- Only recommend a trade if confluence >= 60 (multiple signals must agree)
- Be specific: exact strategy type, approximate strikes, timing
- Entry trigger must be actionable (e.g. "break above $X on volume > Y")
- Stop loss must be at a meaningful technical level (not arbitrary %)
- Profit targets should use resistance levels from technical analysis
- Match strategy complexity to signal strength (strong signal = simple directional, weak = defined risk spread)

Always respond with valid JSON.`;

    // Build rich context from all available agent outputs
    const contextParts: Record<string, unknown> = {
      symbol: input.symbol,
      currentPrice: input.currentPrice,
      setupType: input.setupType,
    };

    if (input.technicalAnalysis) {
      contextParts.technicalSignal = {
        qualityScore: input.technicalAnalysis.qualityScore,
        recommendation: input.technicalAnalysis.recommendation,
        confidence: input.technicalAnalysis.confidence,
        positives: input.technicalAnalysis.keySignals.positive,
        cautions: input.technicalAnalysis.keySignals.negative,
        technicalTarget: input.technicalAnalysis.targetPrice,
        technicalStop: input.technicalAnalysis.stopPrice,
        riskReward: input.technicalAnalysis.riskRewardRatio,
      };
    }

    if (input.greeksAnalysis) {
      contextParts.optionsSignal = {
        recommendedStrategy: input.greeksAnalysis.recommendedStrategy.name,
        strategyDescription: input.greeksAnalysis.recommendedStrategy.description,
        ivEnvironment: input.greeksAnalysis.ivAnalysis.interpretation,
        ivRank: input.greeksAnalysis.ivAnalysis.currentIVRank,
        estimatedDelta: input.greeksAnalysis.greeksAtEntry.delta,
        scenarios: input.greeksAnalysis.scenarioAnalysis,
      };
    }

    if (input.riskAssessment) {
      contextParts.riskSignal = {
        recommendedContracts: input.riskAssessment.recommendedPositionSize,
        maxLoss: input.riskAssessment.maxLossScenario,
        maxProfit: input.riskAssessment.maxProfitScenario,
        alerts: input.riskAssessment.exposureAlerts,
      };
    }

    if (input.sentimentAnalysis) {
      contextParts.sentimentSignal = {
        overall: input.sentimentAnalysis.overallSentiment,
        score: input.sentimentAnalysis.sentimentScore,
        keyDrivers: input.sentimentAnalysis.keyDrivers,
        conflicts: input.sentimentAnalysis.conflictingSignals,
        catalysts: input.sentimentAnalysis.catalysts,
      };
    }

    // Raw fallbacks
    if (input.rsi) contextParts.rsi = input.rsi;
    if (input.ivRank) contextParts.ivRank = input.ivRank;
    if (input.support) contextParts.support = input.support;
    if (input.resistance) contextParts.resistance = input.resistance;

    const context = this.formatTechnicalContext(contextParts);

    const prompt = `Synthesize all available signals for ${input.symbol} and produce the definitive trade plan:

${context}

Respond with this JSON:
{
  "tradeIdea": {
    "type": "<CALL_SPREAD|PUT_SPREAD|CALENDAR|IRON_CONDOR|STOCK|OTHER>",
    "description": "<specific trade description with strikes if applicable>"
  },
  "confluenceScore": <0-100, how many signals agree>,
  "entry": {
    "signal": "<exact entry trigger>",
    "triggerPrice": <price>,
    "timing": "<e.g. 'On market open', 'Wait for hourly close above X'>"
  },
  "targets": {
    "target1": { "price": <price>, "profitPercent": <percent> },
    "target2": { "price": <price>, "profitPercent": <percent> }
  },
  "stopLoss": {
    "price": <price>,
    "lossPercent": <percent>
  },
  "historicalSimilarity": {
    "matchCount": <estimated trades like this>,
    "winRate": <estimated win rate 0-1 based on setup quality>,
    "avgRiskReward": <estimated avg R:R>
  },
  "reasoning": "<2-3 sentence synthesis of why this is the right trade>",
  "riskWarnings": ["<warning1>", "<warning2>"]
}`;

    try {
      const response = await this.query(prompt, systemPrompt);
      const parsed = this.parseJsonResponse<any>(response);

      return {
        agentType: 'strategist',
        symbol: input.symbol,
        tradeIdea: parsed.tradeIdea || { type: 'OTHER', description: 'Review signals manually' },
        confluenceScore: Math.min(100, Math.max(0, parsed.confluenceScore ?? 50)),
        entry: parsed.entry || { signal: 'Manual review required', triggerPrice: input.currentPrice, timing: 'TBD' },
        targets: parsed.targets || {
          target1: { price: input.resistance ?? input.currentPrice * 1.05, profitPercent: 5 },
          target2: { price: input.resistance ? input.resistance * 1.05 : input.currentPrice * 1.1, profitPercent: 10 },
        },
        stopLoss: parsed.stopLoss || { price: input.support ?? input.currentPrice * 0.95, lossPercent: 5 },
        historicalSimilarity: parsed.historicalSimilarity || { matchCount: 0, winRate: 0.5, avgRiskReward: 1.5 },
        reasoning: parsed.reasoning || 'Insufficient data for full synthesis.',
        riskWarnings: parsed.riskWarnings || [],
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[TradeStrategist Error]', error);
      throw error;
    }
  }
}

let tradeStrategistInstance: TradeStrategist | null = null;

export function getTradeStrategist(config?: AgentConfig): TradeStrategist {
  if (!tradeStrategistInstance) {
    tradeStrategistInstance = new TradeStrategist(config);
  }
  return tradeStrategistInstance;
}
