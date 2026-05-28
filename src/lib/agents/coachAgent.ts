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
import { generateText, getDefaultOpenAIModel } from '@/lib/openaiResponses';

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
  // Stats broken down by trade type
  byType: Record<string, { closed: number; wins: number; totalPnl: number; avgWin: number; avgLoss: number }>;
  // All open positions with leg detail
  openPositions: Array<{
    symbol: string;
    type: string;
    entryDate: string;
    strategy?: string | null;
    premiumAtRisk?: number | null;
    legs?: Array<{ direction: string; type: string; strike: number; expiry: string; qty: number; entryPrice: number }>;
    stockQty?: number | null;
    stockEntryPrice?: number | null;
  }>;
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
    planNotes?: string | null;
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
  /** Pre-built compact summary from coach_context_cache (preferred over tradeSummary) */
  cachedSummary?: string;
  /** Pre-generated nightly behavioral brief from coach_context_cache */
  behavioralBrief?: string;
  /** Compressed summary of long conversation histories (replaces full history when length >= 8) */
  historySummary?: string;
  /** Aggregate stats from the trades table — used only when cachedSummary is absent */
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

export interface CoachTokenUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
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
  usage?: CoachTokenUsage;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export class CoachAgent extends Agent {
  constructor(config: AgentConfig = {}) {
    super({ model: getDefaultOpenAIModel(), maxTokens: 2000, temperature: 0.7, ...config });
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

    const { text: rawReply, usage } = await this.queryWithHistory(systemPrompt, messages, input.historySummary);

    // ── Step 6: Parse structured response ─────────────────────────
    const { reply, suggestedActions } = this.parseReply(rawReply);

    return { reply, similarTrades, patterns, suggestedActions, usage };
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

    parts.push(`## User Question\n${input.userQuery}`);

    // ── Portfolio context: cached compact summary (preferred) ──────────────────
    // The cron job pre-builds this every 30 min. ~100-150 tokens vs ~500-600.
    if (input.cachedSummary) {
      parts.push(`## Portfolio Summary\n${input.cachedSummary}`);
    } else if (input.tradeSummary) {
      // Fallback: live summary (cache miss). Compact format, 5 trades, no notes.
      const s = input.tradeSummary;
      const fmt = (n: number) => (n >= 0 ? `+$${n.toFixed(0)}` : `-$${Math.abs(n).toFixed(0)}`);
      const wr = s.winRate;
      const typeLines = Object.entries(s.byType ?? {})
        .filter(([, v]) => v.closed > 0)
        .map(([typ, v]) => `${typ.toUpperCase()} ${v.closed}cl wr:${Math.round((v.wins / v.closed) * 100)}% pnl:${fmt(v.totalPnl)}`);
      const topSyms = s.topSymbols.slice(0, 4).map((x) => `${x.symbol}(${x.trades}t ${fmt(x.pnl)})`);
      const recentText = s.recentTrades.slice(0, 5).map((t) => {
        let line = `${t.symbol} ${t.type} ${t.status}`;
        if (t.pnl != null) line += ` ${fmt(t.pnl)}`;
        line += ` [${t.entryDate.slice(0, 10)}]`;
        if (t.optionLegs?.length) {
          const l = t.optionLegs[0];
          line += ` ${l.direction} ${l.qty}x $${l.strike}${l.type[0]}`;
        }
        return line;
      });

      let summary = `stats: ${s.totalTrades}T ${s.closedTrades}cl ${s.openTrades}op | wr:${wr}% pnl:${fmt(s.totalPnl)} avgW:${fmt(s.avgWin)} avgL:${fmt(s.avgLoss)}`;
      if (typeLines.length) summary += `\ntype: ${typeLines.join(' | ')}`;
      if (topSyms.length) summary += `\ntop: ${topSyms.join(' ')}`;
      if (s.openPositions?.length) {
        const openStr = s.openPositions.slice(0, 3).map((p) => {
          let o = `${p.symbol} ${p.type}`;
          if (p.stockQty) o += ` ${p.stockQty}sh@$${p.stockEntryPrice}`;
          if (p.legs?.length) o += ` ${p.legs[0].direction} ${p.legs[0].qty}x $${p.legs[0].strike}${p.legs[0].type[0]}`;
          return o;
        }).join(' | ');
        summary += `\nopen(${s.openPositions.length}): ${openStr}`;
      }
      summary += `\nrecent: ${recentText.join(' | ')}`;
      parts.push(`## Portfolio Summary\n${summary}`);
    }

    if (input.currentTrade) {
      parts.push(`## Current Trade\n${JSON.stringify(input.currentTrade)}`);
    }

    // ── Behavioral brief: pre-generated nightly (preferred) or inline patterns ──
    if (input.behavioralBrief) {
      parts.push(`## Behavioral Analysis\n${input.behavioralBrief}`);
    } else if (similarTrades.length > 0) {
      const patternLine = `wr:${patterns.winRate}% avgW:$${patterns.avgWin.toFixed(0)} avgL:$${patterns.avgLoss.toFixed(0)} setups:${patterns.topSetups.join(',') || 'N/A'}${patterns.riskWarnings.length ? ` WARN:${patterns.riskWarnings.join(';')}` : ''}`;
      parts.push(`## Patterns from Similar Trades\n${patternLine}`);
    }

    // ── RAG: 4 trades × 150 chars (was 6 × 300) ───────────────────────────────
    if (similarTrades.length > 0) {
      const tradeContext = similarTrades.slice(0, 4)
        .map((t, i) =>
          `T${i + 1}(${Math.round(t.similarity * 100)}%): ${t.symbol} ${t.outcome} P&L:$${t.pnl?.toFixed(0) ?? 'N/A'} setup:${t.setup_type ?? '?'} — ${t.embedded_text.substring(0, 150)}`
        )
        .join('\n');
      parts.push(`## Similar Past Trades\n${tradeContext}`);
    } else {
      parts.push(`## Similar Past Trades\nNone retrieved. Use portfolio summary as primary source.`);
    }

    return parts.join('\n\n');
  }

  private async queryWithHistory(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    historySummary?: string
  ): Promise<{ text: string; usage: CoachTokenUsage }> {
    // When history is long and a rolling summary exists, prepend it and drop
    // the full message array so we only send the current user turn.
    let effectiveMessages = messages;
    if (historySummary && messages.length >= 8) {
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      effectiveMessages = [
        { role: 'user', content: `[Previous conversation summary: ${historySummary}]` },
        { role: 'assistant', content: 'Understood. Continuing with context.' },
        ...(lastUserMessage ? [lastUserMessage] : []),
      ];
    }

    const response = await generateText({
      model: this.model,
      maxOutputTokens: this.maxTokens,
      temperature: this.temperature,
      instructions: systemPrompt,
      messages: effectiveMessages,
    });

    return { text: response.text, usage: response.usage };
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
