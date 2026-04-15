/**
 * Greeks Advisor Agent
 * Recommends optimal options strategies using Greeks and IV analysis
 */

import { Agent, AgentConfig } from './baseAgent';
import { GreeksAnalysis } from '@/types/agents';

export interface GreeksSetupData {
  symbol: string;
  currentPrice: number;
  ivRank: number;        // 0-100
  hv20: number;          // historical vol as decimal (e.g. 0.31 = 31%)
  delta?: number;        // best available delta on chain
  premium?: number;      // best available premium (mid price)
  rsi?: number;
  support?: number;
  resistance?: number;
  setupType: string;     // e.g. 'leaps_opportunity', 'support_bounce'
  accountSize?: number;  // optional, for position sizing context
  daysToExpiry?: number; // if known
}

export class GreeksAdvisor extends Agent {
  constructor(config: AgentConfig = {}) {
    super({ model: 'claude-sonnet-4-5', maxTokens: 1500, ...config });
  }

  async analyzeGreeks(setup: GreeksSetupData): Promise<GreeksAnalysis> {
    const systemPrompt = `Options Greeks specialist. Rules: IV<25=buy premium, IV>50=sell premium, LEAPS=deep ITM calls (0.70+ delta). Respond with valid JSON only.`;

    const context = this.formatTechnicalContext({
      symbol: setup.symbol,
      currentPrice: setup.currentPrice,
      optionsEnvironment: {
        ivRank: setup.ivRank,
        historicalVolatility20: setup.hv20,
        ivVsHvRatio: setup.hv20 > 0 ? ((setup.ivRank / 100) / setup.hv20).toFixed(2) : null,
        premiumEnvironment: setup.ivRank < 25 ? 'CHEAP' : setup.ivRank < 50 ? 'FAIR' : 'EXPENSIVE',
      },
      bestContractOnChain: {
        delta: setup.delta ?? null,
        premium: setup.premium ?? null,
        daysToExpiry: setup.daysToExpiry ?? null,
      },
      priceStructure: {
        support: setup.support ?? null,
        resistance: setup.resistance ?? null,
        rsi: setup.rsi ?? null,
      },
      setupType: setup.setupType,
      accountContext: setup.accountSize ? `Account size: $${setup.accountSize}` : 'Account size not provided',
    });

    const prompt = `Analyze the options Greeks and IV environment for ${setup.symbol} and recommend the best strategy:

${context}

Respond with this JSON:
{
  "recommendedStrategy": {
    "name": "<e.g. 'LEAPS Call' | 'Call Debit Spread' | 'Put Credit Spread' | 'Iron Condor'>",
    "strikes": [<strike1>, <strike2>],
    "directions": ["long" or "short" per leg],
    "expirationDaysToExpiry": <number>,
    "description": "<1-2 sentence rationale>"
  },
  "greeksAtEntry": {
    "delta": <estimated net delta 0-1>,
    "gamma": <estimated gamma>,
    "theta": <estimated daily theta in dollars per contract>,
    "vega": <estimated vega per contract>
  },
  "scenarioAnalysis": {
    "moveUp5pct": <estimated P&L change in dollars per contract>,
    "moveUp10pct": <estimated P&L change>,
    "moveDown5pct": <estimated P&L change>,
    "moveDown10pct": <estimated P&L change>
  },
  "ivAnalysis": {
    "currentIVRank": ${setup.ivRank},
    "historical": ${setup.hv20},
    "interpretation": "<concise interpretation of IV environment>"
  },
  "risks": ["<risk1>", "<risk2>"],
  "optimization": "<one key optimization tip for this specific setup>"
}`;

    try {
      const response = await this.query(prompt, systemPrompt);
      const parsed = this.parseJsonResponse<any>(response);

      return {
        agentType: 'greeks',
        symbol: setup.symbol,
        recommendedStrategy: parsed.recommendedStrategy || {
          name: 'LEAPS Call',
          strikes: [Math.round(setup.currentPrice * 0.95)],
          directions: ['long'],
          expirationDaysToExpiry: 365,
          description: 'Deep ITM LEAPS for stock replacement with defined risk.',
        },
        greeksAtEntry: parsed.greeksAtEntry || { delta: 0.7, gamma: 0.002, theta: -0.05, vega: 0.15 },
        scenarioAnalysis: parsed.scenarioAnalysis || {
          moveUp5pct: 0,
          moveUp10pct: 0,
          moveDown5pct: 0,
          moveDown10pct: 0,
        },
        ivAnalysis: parsed.ivAnalysis || {
          currentIVRank: setup.ivRank,
          historical: setup.hv20,
          interpretation: 'IV analysis unavailable',
        },
        risks: parsed.risks || [],
        optimization: parsed.optimization || '',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[GreeksAdvisor Error]', error);
      throw error;
    }
  }
}

let greeksAdvisorInstance: GreeksAdvisor | null = null;

export function getGreeksAdvisor(config?: AgentConfig): GreeksAdvisor {
  if (!greeksAdvisorInstance) {
    greeksAdvisorInstance = new GreeksAdvisor(config);
  }
  return greeksAdvisorInstance;
}
