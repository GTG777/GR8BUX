/**
 * AI Orchestrator
 * Coordinates multiple AI agents to provide comprehensive consensus recommendations
 */

import { getTechnicalAnalyst, TechnicalSetupData } from './technicalAnalyst';
import { OrchestratorResponse, TechnicalAnalysis } from '@/types/agents';

export interface OrchestrationConfig {
  agents: ('technical' | 'greeks' | 'risk' | 'sentiment' | 'strategy' | 'coach')[];
  timeout?: number; // milliseconds per agent
}

export class AIOrchestrator {
  private config: OrchestrationConfig;

  constructor(config: OrchestrationConfig = { agents: ['technical'] }) {
    this.config = config;
  }

  /**
   * Orchestrate analysis of a technical setup
   * Currently implements Technical Analyst; others similar on demand
   */
  async analyzeSetup(setupData: TechnicalSetupData, agents: string[] = ['technical']): Promise<OrchestratorResponse> {
    const setupId = `${setupData.symbol}_${setupData.setupType}_${Date.now()}`;
    const timestamp = new Date().toISOString();
    const analyses: any = {};
    const explanations: any = {};

    try {
      // Run Technical Analyst
      if (agents.includes('technical')) {
        const technical = await getTechnicalAnalyst().analyzeSetup(setupData);
        analyses.technical = technical;
        explanations.technicalReasoning = this.explainTechnicalRecommendation(technical);
      }

      // Future agents can be added here
      // if (agents.includes('greeks')) { ... }
      // if (agents.includes('risk')) { ... }
      // etc.

      // Generate consensus recommendation
      const consensusRecommendation = this.generateConsensus(analyses);

      return {
        setupId,
        timestamp,
        analyses,
        consensusRecommendation,
        explanations,
      };
    } catch (error) {
      console.error('[Orchestrator Error]', error);
      throw error;
    }
  }

  /**
   * Generate consensus recommendation from agent analyses
   */
  private generateConsensus(analyses: any): OrchestratorResponse['consensusRecommendation'] {
    const recommendations: string[] = [];
    let totalConfidence = 0;
    let agentCount = 0;
    const cautions: Set<string> = new Set();

    // Extract recommendations from each agent
    if (analyses.technical) {
      recommendations.push(analyses.technical.recommendation);
      totalConfidence += analyses.technical.confidence;
      agentCount++;

      if (analyses.technical.keySignals?.negative?.length > 0) {
        analyses.technical.keySignals.negative.forEach((flag: string) => cautions.add(flag));
      }
    }

    // Convert recommendation to consensus action
    const consensusAction = this.calculateConsensusAction(recommendations);
    const avgConfidence = agentCount > 0 ? totalConfidence / agentCount : 0.5;

    return {
      action: consensusAction as any,
      confidence: Math.min(1, Math.max(0, avgConfidence)),
      reasoning: this.generateReasoningStatement(analyses),
      cautions: Array.from(cautions),
      nextSteps: this.suggestNextSteps(consensusAction, analyses),
    };
  }

  /**
   * Calculate consensus action from multiple agent recommendations
   */
  private calculateConsensusAction(recommendations: string[]): string {
    if (recommendations.length === 0) return 'NEUTRAL';

    const buyVotes = recommendations.filter((r) => r === 'STRONG_BUY' || r === 'BUY').length;
    const waitVotes = recommendations.filter((r) => r === 'WAIT').length;
    const avoidVotes = recommendations.filter((r) => r === 'AVOID').length;
    const total = recommendations.length;

    if (avoidVotes >= total * 0.5) return 'AVOID';
    if (buyVotes >= total * 0.7) return 'STRONG_BUY';
    if (buyVotes >= total * 0.5) return 'BUY';
    if (waitVotes >= total * 0.5) return 'WAIT';

    return 'NEUTRAL';
  }

  /**
   * Generate human-readable reasoning for recommendation
   */
  private generateReasoningStatement(analyses: any): string {
    if (analyses.technical) {
      const tech = analyses.technical;
      return `Technical setup scores ${tech.qualityScore}/100 (${tech.confidence * 100}% confidence). ${tech.reasoning}`;
    }

    return 'Analysis in progress';
  }

  /**
   * Suggest next steps based on recommendation
   */
  private suggestNextSteps(action: string, analyses: any): string[] {
    const steps: string[] = [];

    if (action === 'BUY' || action === 'STRONG_BUY') {
      steps.push('Prepare trade entry with recommended position size');
      steps.push('Set stop loss at technical support level');
      steps.push('Define profit targets at resistance levels');
    } else if (action === 'WAIT') {
      steps.push('Monitor setup for volume confirmation');
      steps.push('Wait for trigger signal before entry');
      steps.push('Set price alerts at key technical levels');
    } else if (action === 'AVOID') {
      steps.push('Skip this setup or reassess later');
      steps.push('Look for setups with stronger confluence');
    }

    if (analyses.technical?.redFlags?.length > 0) {
      steps.push('Review cautions listed above before trading');
    }

    return steps;
  }

  /**
   * Explain technical recommendation in detail
   */
  private explainTechnicalRecommendation(analysis: TechnicalAnalysis): string {
    const parts = [
      `Setup Quality: ${analysis.qualityScore}/100`,
      `Confidence Level: ${(analysis.confidence * 100).toFixed(0)}%`,
      `Recommendation: ${analysis.recommendation}`,
    ];

    if (analysis.keySignals.positive.length > 0) {
      parts.push(`Positive Signals: ${analysis.keySignals.positive.join(', ')}`);
    }

    if (analysis.keySignals.negative.length > 0) {
      parts.push(`Caution Signals: ${analysis.keySignals.negative.join(', ')}`);
    }

    if (analysis.riskRewardRatio) {
      parts.push(`Risk/Reward Ratio: 1:${analysis.riskRewardRatio.toFixed(1)}`);
    }

    return parts.join(' | ');
  }
}

// Singleton instance
let orchestratorInstance: AIOrchestrator | null = null;

export function getAIOrchestrator(config?: OrchestrationConfig): AIOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new AIOrchestrator(config || { agents: ['technical'] });
  }
  return orchestratorInstance;
}
