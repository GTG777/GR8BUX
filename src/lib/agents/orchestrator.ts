/**
 * AI Orchestrator
 * Coordinates all AI agents to provide comprehensive consensus recommendations
 */

import { getTechnicalAnalyst, TechnicalSetupData } from './technicalAnalyst';
import { getGreeksCoach, GreeksSetupData } from './greeksAdvisor';
import { getSentimentAnalyst, SentimentData } from './sentimentAnalyst';
import { getRiskManager, RiskData } from './riskManager';
import { getTradeStrategist, StrategyInput } from './tradeStrategist';
import {
  OrchestratorResponse,
  TechnicalAnalysis,
  GreeksAnalysis,
  SentimentAnalysis,
  RiskAssessment,
} from '@/types/agents';

export interface OrchestrationConfig {
  agents: ('technical' | 'greeks' | 'risk' | 'sentiment' | 'strategy' | 'coach')[];
  timeout?: number; // milliseconds per agent
}

// Extended setup data that carries all agent inputs
export interface FullSetupData extends TechnicalSetupData {
  // Greeks Coach extras
  ivRank?: number;
  hv20?: number;
  delta?: number;
  premium?: number;
  daysToExpiry?: number;
  accountSize?: number;
  // Sentiment Analyst extras
  recentHeadlines?: Array<{ title: string; source: string; publishedAt?: string }>;
  insiderActivity?: SentimentData['insiderActivity'];
  communityData?: SentimentData['communityData'];
  sector?: string;
  upcomingEvents?: Array<{ event: string; date: string }>;
}

export class AIOrchestrator {
  private config: OrchestrationConfig;

  constructor(config: OrchestrationConfig = { agents: ['technical'] }) {
    this.config = config;
  }

  /**
   * Orchestrate analysis across all requested agents, running independent ones in parallel
   */
  async analyzeSetup(setupData: FullSetupData, agents: string[] = ['technical']): Promise<OrchestratorResponse> {
    const setupId = `${setupData.symbol}_${setupData.setupType}_${Date.now()}`;
    const timestamp = new Date().toISOString();
    const analyses: OrchestratorResponse['analyses'] = {};
    const explanations: Record<string, string> = {};

    try {
      // ── Phase 1: Run independent agents in parallel ──────────────
      const parallelTasks: Promise<void>[] = [];

      if (agents.includes('technical')) {
        parallelTasks.push(
          getTechnicalAnalyst().analyzeSetup(setupData).then((result) => {
            analyses.technical = result;
            explanations.technicalReasoning = this.explainTechnical(result);
          })
        );
      }

      if (agents.includes('greeks') && setupData.ivRank != null && setupData.hv20 != null) {
        const greeksData: GreeksSetupData = {
          symbol: setupData.symbol,
          currentPrice: setupData.currentPrice,
          ivRank: setupData.ivRank,
          hv20: setupData.hv20,
          delta: setupData.delta,
          premium: setupData.premium,
          rsi: setupData.rsi,
          support: setupData.support,
          resistance: setupData.resistance,
          setupType: setupData.setupType,
          accountSize: setupData.accountSize,
          daysToExpiry: setupData.daysToExpiry,
        };
        parallelTasks.push(
          getGreeksCoach().analyzeGreeks(greeksData).then((result) => {
            analyses.greeks = result;
            explanations.greeksReasoning = this.explainGreeks(result);
          })
        );
      }

      if (agents.includes('sentiment')) {
        const sentimentData: SentimentData = {
          symbol: setupData.symbol,
          recentHeadlines: setupData.recentHeadlines,
          insiderActivity: setupData.insiderActivity,
          communityData: setupData.communityData,
          sector: setupData.sector,
          upcomingEvents: setupData.upcomingEvents,
        };
        parallelTasks.push(
          getSentimentAnalyst().analyzeSentiment(sentimentData).then((result) => {
            analyses.sentiment = result;
            explanations.sentimentReasoning = this.explainSentiment(result);
          })
        );
      }

      await Promise.all(parallelTasks);

      // ── Phase 2: Risk Manager (uses greeks result if available) ──
      if (agents.includes('risk') && analyses.greeks) {
        const greeks = analyses.greeks as GreeksAnalysis;
        const costPerContract = (setupData.premium ?? 0) * 100;
        const riskData: RiskData = {
          symbol: setupData.symbol,
          proposedStrategy: greeks.recommendedStrategy.name,
          proposedContracts: 1,
          estimatedCostPerContract: costPerContract || greeks.recommendedStrategy.strikes[0] * 0.05 * 100,
          maxLossPerContract: costPerContract || greeks.recommendedStrategy.strikes[0] * 0.05 * 100,
          currentPrice: setupData.currentPrice,
          support: setupData.support,
          stopPrice: analyses.technical?.stopPrice,
          accountSize: setupData.accountSize,
        };
        const riskResult = await getRiskManager().assessRisk(riskData);
        analyses.risk = riskResult;
        explanations.riskReasoning = this.explainRisk(riskResult);
      }

      // ── Phase 3: Trade Strategist (synthesizes everything) ────────
      if (agents.includes('strategy')) {
        const strategyInput: StrategyInput = {
          symbol: setupData.symbol,
          currentPrice: setupData.currentPrice,
          setupType: setupData.setupType,
          technicalAnalysis: analyses.technical,
          greeksAnalysis: analyses.greeks as GreeksAnalysis | undefined,
          riskAssessment: analyses.risk as RiskAssessment | undefined,
          sentimentAnalysis: analyses.sentiment as SentimentAnalysis | undefined,
          rsi: setupData.rsi,
          ivRank: setupData.ivRank,
          support: setupData.support,
          resistance: setupData.resistance,
        };
        const strategyResult = await getTradeStrategist().buildStrategy(strategyInput);
        analyses.strategy = strategyResult;
        explanations.strategyReasoning = this.explainStrategy(strategyResult);
      }

      const consensusRecommendation = this.generateConsensus(analyses);

      return { setupId, timestamp, analyses, consensusRecommendation, explanations };
    } catch (error) {
      console.error('[Orchestrator Error]', error);
      throw error;
    }
  }

  // ── Consensus generation ─────────────────────────────────────────

  private generateConsensus(analyses: OrchestratorResponse['analyses']): OrchestratorResponse['consensusRecommendation'] {
    const recommendations: string[] = [];
    let totalConfidence = 0;
    let agentCount = 0;
    const cautions: Set<string> = new Set();

    if (analyses.technical) {
      recommendations.push(analyses.technical.recommendation);
      totalConfidence += analyses.technical.confidence;
      agentCount++;
      analyses.technical.keySignals?.negative?.forEach((f) => cautions.add(f));
    }

    // Sentiment contributes a vote: very_bullish/bullish → BUY, bearish → WAIT/AVOID
    if (analyses.sentiment) {
      const s = analyses.sentiment as SentimentAnalysis;
      if (s.overallSentiment === 'VERY_BULLISH' || s.overallSentiment === 'BULLISH') {
        recommendations.push('BUY');
        totalConfidence += Math.max(0, s.sentimentScore);
        agentCount++;
      } else if (s.overallSentiment === 'BEARISH' || s.overallSentiment === 'VERY_BEARISH') {
        recommendations.push('AVOID');
        totalConfidence += 0.5;
        agentCount++;
        s.conflictingSignals?.forEach((f) => cautions.add(f));
      }
    }

    // Strategy confluenceScore > 70 → lean BUY, < 40 → lean WAIT
    if (analyses.strategy) {
      const st = analyses.strategy;
      if (st.confluenceScore >= 70) {
        recommendations.push('BUY');
        totalConfidence += st.confluenceScore / 100;
        agentCount++;
      } else if (st.confluenceScore < 40) {
        recommendations.push('WAIT');
        totalConfidence += 0.4;
        agentCount++;
      }
      st.riskWarnings?.forEach((w) => cautions.add(w));
    }

    const consensusAction = this.calculateConsensusAction(recommendations);
    const avgConfidence = agentCount > 0 ? totalConfidence / agentCount : 0.5;

    return {
      action: consensusAction as OrchestratorResponse['consensusRecommendation']['action'],
      confidence: Math.min(1, Math.max(0, avgConfidence)),
      reasoning: this.generateReasoningStatement(analyses),
      cautions: Array.from(cautions),
      nextSteps: this.suggestNextSteps(consensusAction, analyses),
    };
  }

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

  private generateReasoningStatement(analyses: OrchestratorResponse['analyses']): string {
    const parts: string[] = [];
    if (analyses.technical) {
      parts.push(`Technical: ${analyses.technical.qualityScore}/100 (${(analyses.technical.confidence * 100).toFixed(0)}% confidence) → ${analyses.technical.recommendation}`);
    }
    if (analyses.sentiment) {
      const s = analyses.sentiment as SentimentAnalysis;
      parts.push(`Sentiment: ${s.overallSentiment} (score ${s.sentimentScore.toFixed(2)})`);
    }
    if (analyses.strategy) {
      parts.push(`Confluence: ${analyses.strategy.confluenceScore}/100`);
    }
    if (analyses.greeks) {
      const g = analyses.greeks as GreeksAnalysis;
      parts.push(`Strategy: ${g.recommendedStrategy.name}`);
    }
    return parts.length > 0 ? parts.join(' | ') : 'Analysis complete.';
  }

  private suggestNextSteps(action: string, analyses: OrchestratorResponse['analyses']): string[] {
    const steps: string[] = [];

    // Prefer strategy agent's entry signal if available
    if (analyses.strategy && (action === 'BUY' || action === 'STRONG_BUY')) {
      steps.push(`Entry trigger: ${analyses.strategy.entry.signal}`);
      steps.push(`Target 1: $${analyses.strategy.targets.target1.price} (+${analyses.strategy.targets.target1.profitPercent}%)`);
      steps.push(`Stop loss: $${analyses.strategy.stopLoss.price}`);
      if (analyses.risk) {
        const r = analyses.risk as RiskAssessment;
        steps.push(`Position size: ${r.recommendedPositionSize} contract(s) — max loss $${r.maxLossScenario}`);
      }
    } else if (action === 'BUY' || action === 'STRONG_BUY') {
      steps.push('Prepare trade entry with recommended position size');
      steps.push('Set stop loss at technical support level');
      steps.push('Define profit targets at resistance levels');
    } else if (action === 'WAIT') {
      steps.push('Monitor setup for volume confirmation');
      steps.push('Wait for entry trigger signal before committing capital');
      steps.push('Set price alerts at key technical levels');
    } else if (action === 'AVOID') {
      steps.push('Skip this setup — too many conflicting signals');
      steps.push('Look for higher-confluence setups before deploying capital');
    }

    return steps;
  }

  // ── Explanation helpers ──────────────────────────────────────────

  private explainTechnical(a: TechnicalAnalysis): string {
    const parts = [`Setup Quality: ${a.qualityScore}/100`, `Confidence: ${(a.confidence * 100).toFixed(0)}%`, `→ ${a.recommendation}`];
    if (a.keySignals.positive.length > 0) parts.push(`✓ ${a.keySignals.positive.join(', ')}`);
    if (a.riskRewardRatio) parts.push(`R:R 1:${a.riskRewardRatio.toFixed(1)}`);
    return parts.join(' | ');
  }

  private explainGreeks(a: GreeksAnalysis): string {
    return `${a.recommendedStrategy.name} | IV Rank: ${a.ivAnalysis.currentIVRank} (${a.ivAnalysis.interpretation}) | ${a.recommendedStrategy.description}`;
  }

  private explainSentiment(a: SentimentAnalysis): string {
    return `${a.overallSentiment} (${a.sentimentScore >= 0 ? '+' : ''}${a.sentimentScore.toFixed(2)}) | ${a.marketConsensus}`;
  }

  private explainRisk(a: RiskAssessment): string {
    const alerts = a.exposureAlerts.filter(e => e.severity === 'HIGH').map(e => e.message).join(', ');
    return `Size: ${a.recommendedPositionSize} contract(s) | Max loss: $${a.maxLossScenario}${alerts ? ` | ⚠ ${alerts}` : ''}`;
  }

  private explainStrategy(a: ReturnType<typeof getTradeStrategist> extends { buildStrategy: (...args: any[]) => Promise<infer R> } ? R : never): string {
    return `${a.tradeIdea.description} | Confluence: ${a.confluenceScore}/100 | ${a.reasoning}`;
  }
}

// Singleton instance — reset when agents list changes
let orchestratorInstance: AIOrchestrator | null = null;

export function getAIOrchestrator(config?: OrchestrationConfig): AIOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new AIOrchestrator(config || { agents: ['technical'] });
  }
  return orchestratorInstance;
}

export function resetOrchestratorInstance(): void {
  orchestratorInstance = null;
}
