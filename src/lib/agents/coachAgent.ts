/**
 * Coach Agent — RAG-powered personal trading coach
 *
 * Retrieves semantically similar past trades from the user's journal (via pgvector)
 * and uses them as grounding context for personalized, evidence-based coaching.
 *
 * This is the only agent that uses RAG. All other agents use context stuffing.
 */

import { Agent, AgentConfig } from './baseAgent';
import { findSimilarTrades, SimilarTrade } from '@/lib/ragEmbeddings';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TradeSummary {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;         // 0-100
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  topSymbols: Array<{ symbol: string; trades: number; pnl: number }>;
  recentTrades: Array<{
    symbol: string;
    type: string;
    status: string;
    pnl: number | null;
    entryDate: string;
    exitDate: string | null;
    tags: string[];
    notes?: string | null;
    strategy?: string | null;
    // Stock fields
    stockQty?: number | null;
    stockEntryPrice?: number | null;
    stockExitPrice?: number | null;
    // Option legs
    optionLegs?: Array<{
      type: 'call' | 'put';
      direction: 'long' | 'short';
      strike: number;
      expiry: string;
      qty: number;
      entryPrice: number;
      exitPrice: number | null;
    }> | null;
  }>;
}

export interface CoachInput {
  userId: string;
  /** The user's question or trade idea they want coached on */
  userQuery: string;
  /** Aggregate stats from the trades table — always populated by the API */
  tradeSummary?: TradeSummary;
  /** Current trade context (optional — enriches retrieval query) */
  currentTrade?: {
    symbol?: string;
    type?: string;
    setupType?: string;
    pnl?: number;
    notes?: string;
    tags?: string[];
  };
  /** Conversation history for multi-turn memory */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface CoachResponse {
  reply: string;
  similarTrades: SimilarTrade[];
  patterns: {
    winRate: number;
    avgWin: number;
    avgLoss: number;
    topSetups: string[];
    riskWarnings: string[];
  };
  suggestedActions: string[];
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export class CoachAgent extends Agent {
  constructor(config: AgentConfig = {}) {
    super({ model: 'claude-sonnet-4-5', maxTokens: 2000, temperature: 0.7, ...config });
  }

  async coach(input: CoachInput): Promise<CoachResponse> {
    // ── Step 1: Build retrieval query ─────────────────────────────
    // Combine the user's question with current trade context for richer retrieval
    const retrievalQuery = this.buildRetrievalQuery(input);

    // ── Step 2: RAG — retrieve similar past trades ─────────────────
    let similarTrades: SimilarTrade[] = [];
    try {
      similarTrades = await findSimilarTrades(retrievalQuery, input.userId, {
        limit: 6,
        threshold: 0.55,
      });
    } catch (err) {
      console.warn('[CoachAgent] RAG retrieval failed, proceeding without context:', err);
    }

    // ── Step 3: Compute behavioral patterns from retrieved trades ──
    const patterns = this.analyzePatterns(similarTrades);

    // ── Step 4: Build grounded LLM prompt ─────────────────────────
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(input, similarTrades, patterns);

    // ── Step 5: LLM call with multi-turn history ──────────────────
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...(input.history ?? []),
      { role: 'user', content: userPrompt },
    ];

    const rawReply = await this.queryWithHistory(systemPrompt, messages);

    // ── Step 6: Parse structured response ─────────────────────────
    const { reply, suggestedActions } = this.parseReply(rawReply);

    return { reply, similarTrades, patterns, suggestedActions };
  }

  // ─── Private helpers ────────────────────────────────────────────

  private buildRetrievalQuery(input: CoachInput): string {
    const parts = [input.userQuery];
    const ct = input.currentTrade;
    if (ct?.symbol) parts.push(`symbol: ${ct.symbol}`);
    if (ct?.setupType) parts.push(`setup: ${ct.setupType}`);
    if (ct?.type) parts.push(`type: ${ct.type}`);
    if (ct?.tags?.length) parts.push(`tags: ${ct.tags.join(', ')}`);
    return parts.join('. ');
  }

  private analyzePatterns(trades: SimilarTrade[]): CoachResponse['patterns'] {
    if (trades.length === 0) {
      return { winRate: 0, avgWin: 0, avgLoss: 0, topSetups: [], riskWarnings: [] };
    }

    const closed = trades.filter((t) => t.pnl != null);
    const wins = closed.filter((t) => t.outcome === 'win');
    const losses = closed.filter((t) => t.outcome === 'loss');

    const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + (t.pnl ?? 0), 0) / losses.length : 0;

    // Top setups by frequency
    const setupCounts: Record<string, number> = {};
    for (const t of trades) {
      const key = t.setup_type ?? 'untagged';
      setupCounts[key] = (setupCounts[key] ?? 0) + 1;
    }
    const topSetups = Object.entries(setupCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([s]) => s);

    // Risk warnings
    const riskWarnings: string[] = [];
    if (winRate < 40 && closed.length >= 3) riskWarnings.push('Low win rate on similar setups');
    if (avgLoss < -500) riskWarnings.push('Large average losses on similar setups');
    if (Math.abs(avgLoss) > avgWin * 2) riskWarnings.push('Poor risk/reward ratio on similar setups');
    const lossClusters = losses.filter((t) => t.pnl != null && t.pnl < -1000);
    if (lossClusters.length >= 2) riskWarnings.push('Multiple large losses on this type of setup');

    return { winRate, avgWin, avgLoss, topSetups, riskWarnings };
  }

  private buildSystemPrompt(): string {
    return `You are a personal trading coach with deep knowledge of technical analysis, options, and behavioral finance.
Your role is to give traders personalized, evidence-based coaching grounded in their actual past trade history.
You have access to the user's full trade portfolio statistics AND semantically similar trades from their journal.
Use the Portfolio Summary as ground truth for what trades exist. Use similar trades for detailed pattern analysis.

Options P&L calculation context (for your reference when reasoning):
- Long call/put: P&L = (exitPrice - entryPrice) × qty × 100 per contract
- Short call/put: P&L = (entryPrice - exitPrice) × qty × 100 per contract
- Expired worthless: exitPrice = $0, so long = full premium loss, short = full premium gain
- "Premium paid" for open long options = entryPrice × qty × 100

Be direct, specific, and honest. Reference actual symbols, strikes, P&L numbers, and dates from the data provided.
Never say you cannot see the user's trades — the portfolio summary always reflects the real database state.
Format your response as JSON with exactly these fields:
{
  "reply": "Your coaching response in 2-4 paragraphs. Reference specific trades and numbers from the context.",
  "suggestedActions": ["Action 1", "Action 2", "Action 3"]
}`;
  }

  private buildUserPrompt(
    input: CoachInput,
    similarTrades: SimilarTrade[],
    patterns: CoachResponse['patterns']
  ): string {
    const parts: string[] = [];

    // User's question
    parts.push(`## User Question\n${input.userQuery}`);

    // Portfolio summary from direct DB query (always accurate, no embeddings needed)
    if (input.tradeSummary) {
      const s = input.tradeSummary;
      const topSymbolsText = s.topSymbols
        .slice(0, 8)
        .map((x) => `${x.symbol} (${x.trades} trades, P&L: $${x.pnl.toFixed(2)})`)
        .join(', ');
      const recentText = s.recentTrades
        .slice(0, 15)
        .map((t) => {
          let line = `${t.symbol} ${t.type} ${t.status}`;
          if (t.pnl != null) line += ` P&L:$${t.pnl.toFixed(2)}`;
          line += ` entry:${t.entryDate.slice(0, 10)}`;
          if (t.exitDate) line += ` exit:${t.exitDate.slice(0, 10)}`;
          if (t.strategy) line += ` strategy:${t.strategy}`;
          // Stock detail
          if (t.type === 'stock' && t.stockQty != null) {
            line += ` qty:${t.stockQty} @$${t.stockEntryPrice}`;
            if (t.stockExitPrice != null) line += `→$${t.stockExitPrice}`;
          }
          // Option legs
          if (t.optionLegs?.length) {
            const legStrs = t.optionLegs.map((l) => {
              let ls = `${l.direction} ${l.qty}x ${l.type} $${l.strike} exp:${l.expiry} @$${l.entryPrice}`;
              if (l.exitPrice != null) {
                ls += `→$${l.exitPrice}`;
                const legPnl = l.direction === 'long'
                  ? (l.exitPrice - l.entryPrice) * l.qty * 100
                  : (l.entryPrice - l.exitPrice) * l.qty * 100;
                ls += ` legP&L:$${legPnl.toFixed(2)}`;
              } else if (t.status === 'open') {
                ls += ` (open — premium paid: $${(l.entryPrice * l.qty * 100).toFixed(2)})`;
              }
              return ls;
            });
            line += ` [${legStrs.join('; ')}]`;
          }
          return line;
        })
        .join('\n  ');
      parts.push(`## Portfolio Summary (live from database)
Total Trades: ${s.totalTrades} (${s.closedTrades} closed, ${s.openTrades} open)
Win Rate: ${s.winRate}% (${s.winCount} wins / ${s.lossCount} losses on closed trades)
Total P&L: $${s.totalPnl.toFixed(2)}
Avg Win: $${s.avgWin.toFixed(2)} | Avg Loss: $${s.avgLoss.toFixed(2)}
Most Traded Symbols: ${topSymbolsText || 'N/A'}
Recent Trades (with option leg detail):
  ${recentText || 'N/A'}`);
    }

    // Current trade context
    if (input.currentTrade) {
      parts.push(`## Current Trade Context\n${JSON.stringify(input.currentTrade, null, 2)}`);
    }

    // Behavioral patterns from RAG results
    if (similarTrades.length > 0) {
      parts.push(`## Patterns from Semantically Similar Trades (${similarTrades.length} retrieved)
Win Rate: ${patterns.winRate}%
Avg Win: $${patterns.avgWin.toFixed(2)}
Avg Loss: $${patterns.avgLoss.toFixed(2)}
Top Setups: ${patterns.topSetups.join(', ') || 'N/A'}
Risk Warnings: ${patterns.riskWarnings.join('; ') || 'None'}`);

      const tradeContext = similarTrades
        .map((t, i) =>
          `Trade ${i + 1} (${Math.round(t.similarity * 100)}% similar):
  Symbol: ${t.symbol} | Outcome: ${t.outcome} | P&L: $${t.pnl?.toFixed(2) ?? 'N/A'}
  Setup: ${t.setup_type ?? 'untagged'} | Tags: ${t.tags?.join(', ') || 'none'}
  Journal: ${t.embedded_text.substring(0, 300)}`
        )
        .join('\n\n');
      parts.push(`## Retrieved Similar Trades\n${tradeContext}`);
    } else {
      parts.push(`## Retrieved Similar Trades\nSemantic search returned no results (embeddings may still be processing). Use the Portfolio Summary above as your primary data source.`);
    }

    return parts.join('\n\n');
  }

  private async queryWithHistory(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: systemPrompt,
      messages,
    });
    if (response.content[0].type === 'text') return response.content[0].text;
    throw new Error('Unexpected response type from Claude');
  }

  private parseReply(raw: string): { reply: string; suggestedActions: string[] } {
    try {
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || raw.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          reply: parsed.reply ?? raw,
          suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [],
        };
      }
    } catch {
      // fallback — return the raw text as the reply
    }
    return { reply: raw, suggestedActions: [] };
  }
}

// Singleton
let _instance: CoachAgent | null = null;
export function getCoachAgent(config?: AgentConfig): CoachAgent {
  if (!_instance) _instance = new CoachAgent(config);
  return _instance;
}
