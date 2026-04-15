/**
 * API Endpoint: /api/agents/analyze
 * Analyzes trading setups using the full multi-agent AI system
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getAIOrchestrator, resetOrchestratorInstance, FullSetupData } from '@/lib/agents/orchestrator';
import { OrchestratorResponse } from '@/types/agents';
import { ApiResponse } from '@/types';

// All fields the endpoint accepts
interface SetupAnalysisRequest {
  symbol: string;
  setupType: string;
  currentPrice: number;
  detectedAt?: string;
  // Technical
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
  support?: number;
  resistance?: number;
  priceHistory?: Array<{ date: string; close: number; volume: number; rsi: number }>;
  // Options / Greeks
  ivRank?: number;
  hv20?: number;
  delta?: number;
  premium?: number;
  daysToExpiry?: number;
  accountSize?: number;
  // Sentiment
  recentHeadlines?: Array<{ title: string; source: string; publishedAt?: string }>;
  insiderActivity?: { recentBuys: number; recentSells: number; netSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; notableTransactions?: string[] };
  communityData?: { mentionCount?: number; bullBearRatio?: number; platforms?: string[]; topThemes?: string[] };
  sector?: string;
  upcomingEvents?: Array<{ event: string; date: string }>;
  // Agent selection override (comma-separated or array)
  agents?: string | string[];
}

const VALID_AGENTS = ['technical', 'greeks', 'risk', 'sentiment', 'strategy'] as const;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<OrchestratorResponse | string>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (apiKey && apiKey !== process.env.GR8BUX_API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const body: SetupAnalysisRequest = req.body;

    if (!body.symbol || !body.setupType || body.currentPrice === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, setupType, currentPrice',
      });
    }

    // Determine which agents to run
    let requestedAgents: string[];
    if (body.agents) {
      requestedAgents = Array.isArray(body.agents)
        ? body.agents
        : body.agents.split(',').map((a) => a.trim());
    } else {
      // Auto-select agents based on available data
      requestedAgents = ['technical'];
      if (body.ivRank != null && body.hv20 != null) requestedAgents.push('greeks', 'risk');
      requestedAgents.push('sentiment');
      requestedAgents.push('strategy');
    }

    // Filter to only valid agent names
    const agents = requestedAgents.filter((a) =>
      VALID_AGENTS.includes(a as typeof VALID_AGENTS[number])
    ) as typeof VALID_AGENTS[number][];

    // Build full setup data
    const setupData: FullSetupData = {
      symbol: body.symbol.toUpperCase(),
      setupType: body.setupType,
      currentPrice: body.currentPrice,
      detectedAt: body.detectedAt || new Date().toISOString(),
      rsi: body.rsi,
      bbUpper: body.bbUpper,
      bbMiddle: body.bbMiddle,
      bbLower: body.bbLower,
      bbPercentage: body.bbPercentage,
      consolidationStrength: body.consolidationStrength,
      volatility: body.volatility,
      volume: body.volume,
      priceHigh: body.priceHigh,
      priceLow: body.priceLow,
      support: body.support,
      resistance: body.resistance,
      priceHistory: body.priceHistory,
      ivRank: body.ivRank,
      hv20: body.hv20,
      delta: body.delta,
      premium: body.premium,
      daysToExpiry: body.daysToExpiry,
      accountSize: body.accountSize,
      recentHeadlines: body.recentHeadlines,
      insiderActivity: body.insiderActivity,
      communityData: body.communityData,
      sector: body.sector,
      upcomingEvents: body.upcomingEvents,
    };

    // Reset singleton so each request gets fresh agent config
    resetOrchestratorInstance();
    const orchestrator = getAIOrchestrator({ agents });
    const analysis = await orchestrator.analyzeSetup(setupData, agents);

    return res.status(200).json({ success: true, data: analysis });
  } catch (error: any) {
    console.error('[Analyze Setup Error]', error);

    if (error.message?.includes('rate limit') || error.status === 429) {
      return res.status(429).json({ success: false, error: 'Rate limit exceeded. Please try again in a moment.' });
    }
    if (error.message?.includes('API key') || error.status === 401) {
      return res.status(401).json({ success: false, error: 'AI API key not configured or invalid.' });
    }

    return res.status(500).json({ success: false, error: error.message || 'Internal server error during analysis' });
  }
}
