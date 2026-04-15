/**
 * Sentiment Analyst Agent
 * Synthesizes news sentiment, insider activity, and social signals
 */

import { Agent, AgentConfig } from './baseAgent';
import { SentimentAnalysis } from '@/types/agents';

export interface SentimentData {
  symbol: string;
  // News items (from newsService)
  recentHeadlines?: Array<{ title: string; source: string; publishedAt?: string }>;
  // Insider activity summary
  insiderActivity?: {
    recentBuys: number;
    recentSells: number;
    netSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    notableTransactions?: string[];
  };
  // Community data (from communityService)
  communityData?: {
    mentionCount?: number;
    bullBearRatio?: number; // > 1 = more bulls
    platforms?: string[];
    topThemes?: string[];
  };
  // Market context
  sector?: string;
  marketRegime?: 'BULL' | 'BEAR' | 'SIDEWAYS';
  // Upcoming catalysts
  upcomingEvents?: Array<{ event: string; date: string }>;
}

export class SentimentAnalyst extends Agent {
  constructor(config: AgentConfig = {}) {
    super({ model: 'claude-sonnet-4-5', maxTokens: 1500, ...config });
  }

  async analyzeSentiment(data: SentimentData): Promise<SentimentAnalysis> {
    const systemPrompt = `Market sentiment analyst. Score -1.0 (very bearish) to +1.0 (very bullish). Insider buys=bullish, catalysts dominate short-term. Respond with valid JSON only.`;

    const context = this.formatTechnicalContext({
      symbol: data.symbol,
      sector: data.sector ?? 'Unknown',
      marketRegime: data.marketRegime ?? 'Unknown',
      newsContext: data.recentHeadlines?.length
        ? data.recentHeadlines.slice(0, 8).map(h => h.title)
        : ['No recent headlines provided'],
      insiderActivity: data.insiderActivity ?? 'No insider data provided',
      communitySignals: data.communityData ?? 'No community data provided',
      upcomingCatalysts: data.upcomingEvents ?? [],
    });

    const prompt = `Analyze the overall market sentiment for ${data.symbol}:

${context}

If data is limited, make reasonable inferences and flag low confidence clearly.

Respond with this JSON:
{
  "overallSentiment": "<VERY_BULLISH|BULLISH|NEUTRAL|BEARISH|VERY_BEARISH>",
  "sentimentScore": <-1.0 to 1.0>,
  "sources": {
    "news": {
      "score": <-1.0 to 1.0>,
      "count": <number of headlines analyzed>,
      "topThemes": ["<theme1>", "<theme2>"]
    },
    "social": {
      "score": <-1.0 to 1.0>,
      "mentionCount": <number or 0 if unknown>,
      "platforms": ["Reddit", "StockTwits"]
    },
    "insider": {
      "score": <-1.0 to 1.0>,
      "buyCount": <number>,
      "sellCount": <number>
    }
  },
  "keyDrivers": ["<driver1>", "<driver2>"],
  "conflictingSignals": ["<conflict1>"],
  "catalysts": [
    { "date": "<date or 'upcoming'>", "event": "<event name>", "expectedImpact": "<POSITIVE|NEGATIVE|NEUTRAL>" }
  ],
  "marketConsensus": "<1-2 sentence summary of overall market view on this stock>"
}`;

    try {
      const response = await this.query(prompt, systemPrompt);
      const parsed = this.parseJsonResponse<any>(response);

      return {
        agentType: 'sentiment',
        symbol: data.symbol,
        overallSentiment: parsed.overallSentiment || 'NEUTRAL',
        sentimentScore: Math.min(1, Math.max(-1, parsed.sentimentScore ?? 0)),
        sources: parsed.sources || {
          news: { score: 0, count: 0, topThemes: [] },
          social: { score: 0, mentionCount: 0, platforms: [] },
          insider: { score: 0, buyCount: 0, sellCount: 0 },
        },
        keyDrivers: parsed.keyDrivers || [],
        conflictingSignals: parsed.conflictingSignals || [],
        catalysts: parsed.catalysts || [],
        marketConsensus: parsed.marketConsensus || 'Insufficient data for consensus.',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[SentimentAnalyst Error]', error);
      throw error;
    }
  }
}

let sentimentAnalystInstance: SentimentAnalyst | null = null;

export function getSentimentAnalyst(config?: AgentConfig): SentimentAnalyst {
  if (!sentimentAnalystInstance) {
    sentimentAnalystInstance = new SentimentAnalyst(config);
  }
  return sentimentAnalystInstance;
}
