/**
 * API Endpoint: /api/agents/analyze
 * Analyzes technical setups using AI agents
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getAIOrchestrator } from '@/lib/agents/orchestrator';
import { OrchestratorResponse } from '@/types/agents';
import { ApiResponse } from '@/types';

interface SetupAnalysisRequest {
  symbol: string;
  setupType: string;
  currentPrice: number;
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
  detectedAt: string;
  // For LEAPS-specific analysis
  ivRank?: number;
  hv20?: number;
  delta?: number;
  premium?: number;
  // Optional price history for context
  priceHistory?: Array<{ date: string; close: number; volume: number; rsi: number }>;
}

/**
 * POST /api/agents/analyze
 * Analyzes a trading setup using AI agents
 *
 * Body: SetupAnalysisRequest
 * Response: OrchestratorResponse
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<OrchestratorResponse | string>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  // Check for API key auth (optional but recommended)
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (apiKey && apiKey !== process.env.GR8BUX_API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
  }

  try {
    const setupData: SetupAnalysisRequest = req.body;

    // Validate required fields
    if (!setupData.symbol || !setupData.setupType || setupData.currentPrice === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, setupType, currentPrice',
      });
    }

    if (!setupData.detectedAt) {
      setupData.detectedAt = new Date().toISOString();
    }

    // Determine which agents to run
    const agents = ['technical'];

    // For LEAPS context, use LEAPS-specific analysis
    let analysis: OrchestratorResponse;

    if (setupData.ivRank !== undefined && setupData.hv20 !== undefined) {
      // Use LEAPS-specific technical analysis
      const technicalAnalyst = require('@/lib/agents/technicalAnalyst').getTechnicalAnalyst();
      const leapsAnalysis = await technicalAnalyst.scoreLeapsSetup(setupData);
      analysis = {
        setupId: `${setupData.symbol}_${setupData.setupType}_${Date.now()}`,
        timestamp: new Date().toISOString(),
        analyses: { technical: leapsAnalysis },
        consensusRecommendation: {
          action: leapsAnalysis.recommendation as any,
          confidence: leapsAnalysis.confidence,
          reasoning: leapsAnalysis.reasoning,
          cautions: leapsAnalysis.redFlags || [],
          nextSteps: generateNextSteps(leapsAnalysis.recommendation),
        },
        explanations: {
          technicalReasoning: `LEAPS Quality: ${leapsAnalysis.qualityScore}/100 (${(leapsAnalysis.confidence * 100).toFixed(0)}% confidence). ${leapsAnalysis.reasoning}`,
        },
      };
    } else {
      // Standard technical analysis
      const orchestrator = getAIOrchestrator({ agents });
      analysis = await orchestrator.analyzeSetup(setupData, agents);
    }

    return res.status(200).json({
      success: true,
      data: analysis,
    });
  } catch (error: any) {
    console.error('[Analyze Setup Error]', error);

    // Handle specific error types
    if (error.message?.includes('API rate limit')) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please try again in a moment.',
      });
    }

    if (error.message?.includes('API key')) {
      return res.status(401).json({
        success: false,
        error: 'AI API key not configured',
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error during analysis',
    });
  }
}

/**
 * Helper: Generate next steps based on recommendation
 */
function generateNextSteps(recommendation: string): string[] {
  const steps: string[] = [];

  if (recommendation === 'STRONG_BUY' || recommendation === 'BUY') {
    steps.push('Prepare trade entry with recommended position size');
    steps.push('Set stop loss at technical support level');
    steps.push('Define profit targets at resistance levels');
  } else if (recommendation === 'WAIT') {
    steps.push('Monitor setup for volume confirmation');
    steps.push('Wait for trigger signal before entry');
    steps.push('Set price alerts at key technical levels');
  } else if (recommendation === 'AVOID') {
    steps.push('Skip this setup or reassess later');
    steps.push('Look for setups with stronger confluence');
  }

  return steps;
}
