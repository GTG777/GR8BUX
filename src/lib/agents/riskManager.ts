/**
 * Risk Manager Agent
 * Validates position sizing and portfolio risk exposure
 */

import { Agent, AgentConfig } from './baseAgent';
import { RiskAssessment } from '@/types/agents';

export interface RiskData {
  symbol: string;
  proposedStrategy: string;   // e.g. 'LEAPS Call', 'Call Debit Spread'
  proposedContracts: number;
  estimatedCostPerContract: number; // in dollars (e.g. 1250 = $12.50 premium * 100)
  maxLossPerContract: number;       // in dollars
  currentPrice: number;
  support?: number;
  stopPrice?: number;
  // Portfolio context (optional — provide what's known)
  accountSize?: number;
  portfolioDelta?: number;    // current net delta exposure
  portfolioVega?: number;
  portfolioTheta?: number;
  openPositionCount?: number;
  // Risk parameters
  maxRiskPerTrade?: number;   // e.g. 0.02 = 2% of account per trade
  maxPortfolioDelta?: number; // max total delta
}

export class RiskManager extends Agent {
  constructor(config: AgentConfig = {}) {
    super({ model: 'claude-sonnet-4-5', maxTokens: 1500, ...config });
  }

  async assessRisk(data: RiskData): Promise<RiskAssessment> {
    const systemPrompt = `Options risk manager. Max 2-5% risk per trade. Size = floor(maxRisk * account / maxLoss). Flag Greeks imbalance. Respond with valid JSON only.`;

    const totalMaxLoss = data.proposedContracts * data.maxLossPerContract;
    const totalCost = data.proposedContracts * data.estimatedCostPerContract;
    const riskPct = data.accountSize ? (totalMaxLoss / data.accountSize * 100).toFixed(1) : null;

    const context = this.formatTechnicalContext({
      symbol: data.symbol,
      proposedTrade: {
        strategy: data.proposedStrategy,
        contracts: data.proposedContracts,
        costPerContract: `$${data.estimatedCostPerContract}`,
        maxLossPerContract: `$${data.maxLossPerContract}`,
        totalMaxLoss: `$${totalMaxLoss}`,
        totalCost: `$${totalCost}`,
        riskAsPercentOfAccount: riskPct ? `${riskPct}%` : 'Unknown (no account size)',
      },
      currentPortfolio: {
        accountSize: data.accountSize ? `$${data.accountSize}` : 'Not provided',
        netDelta: data.portfolioDelta ?? 'Not provided',
        netVega: data.portfolioVega ?? 'Not provided',
        netTheta: data.portfolioTheta ?? 'Not provided',
        openPositions: data.openPositionCount ?? 'Not provided',
      },
      riskParameters: {
        maxRiskPerTrade: data.maxRiskPerTrade ? `${(data.maxRiskPerTrade * 100).toFixed(0)}%` : '2% (default)',
        stopPrice: data.stopPrice ?? data.support ?? 'Not defined',
      },
    });

    const prompt = `Assess the risk of this proposed trade for ${data.symbol}:

${context}

Provide a comprehensive risk assessment:
{
  "recommendedPositionSize": <number of contracts>,
  "rationale": "<clear explanation of sizing recommendation>",
  "portfolioImpact": {
    "deltaBefore": <current portfolio delta or 0>,
    "deltaAfter": <estimated delta after adding this position>,
    "vegaBefore": <current vega or 0>,
    "vegaAfter": <estimated vega after>,
    "thetaBefore": <current theta or 0>,
    "thetaAfter": <estimated theta after>
  },
  "exposureAlerts": [
    { "severity": "<HIGH|MEDIUM|LOW>", "message": "<alert message>" }
  ],
  "hedgeSuggestions": [
    { "instrument": "<hedge instrument>", "rationale": "<why>", "expectedCost": <dollars> }
  ],
  "maxLossScenario": <total max loss in dollars for recommended size>,
  "maxProfitScenario": <estimated max profit in dollars>
}`;

    try {
      const response = await this.query(prompt, systemPrompt);
      const parsed = this.parseJsonResponse<any>(response);

      return {
        agentType: 'risk_manager',
        recommendedPositionSize: parsed.recommendedPositionSize ?? 1,
        rationale: parsed.rationale || 'Use conservative position sizing.',
        portfolioImpact: parsed.portfolioImpact || {
          deltaBefore: 0, deltaAfter: 0,
          vegaBefore: 0, vegaAfter: 0,
          thetaBefore: 0, thetaAfter: 0,
        },
        exposureAlerts: parsed.exposureAlerts || [],
        hedgeSuggestions: parsed.hedgeSuggestions,
        maxLossScenario: parsed.maxLossScenario ?? totalMaxLoss,
        maxProfitScenario: parsed.maxProfitScenario ?? 0,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[RiskManager Error]', error);
      throw error;
    }
  }
}

let riskManagerInstance: RiskManager | null = null;

export function getRiskManager(config?: AgentConfig): RiskManager {
  if (!riskManagerInstance) {
    riskManagerInstance = new RiskManager(config);
  }
  return riskManagerInstance;
}
