/**
 * POST /api/chat/options-coach
 *
 * Options Coach — context-stuffing with live IV environment + optional trade context.
 * Uses OpenAI to give actionable options strategy advice.
 *
 * Body:
 *   {
 *     symbol:         string
 *     optionsContext: OptionsContext
 *     tradeContext?:  TradeContext | null
 *     query:          string
 *     history?:       Array<{ role: 'user'|'assistant'; content: string }>
 *   }
 *
 * Returns:
 *   { success, reply, usage: { inputTokens, outputTokens, estimatedCostUsd } }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { generateText, getDefaultOpenAIModel, type ChatMessage } from '@/lib/openaiResponses';
import { requirePlanFeature, requireUsageQuota } from '@/lib/planGate';
import { incrementUsage } from '@/lib/usageTracking';

/* ── Types ───────────────────────────────────────────────────────── */
export interface OptionsContext {
  price: number;
  hv20: number | null;
  avgIV: number | null;
  ivr: number | null;
  ivHvSpread: number | null;
  gexPositive: boolean | null;
  maxPainPct: number | null;
  nearestExpiry: string | null;
  topOIStrike: number | null;
}

export interface TradeContext {
  stratName: string;
  netCost: number;          // positive = debit, negative = credit (per contract × qty)
  maxProfit: number | null;
  maxLoss: number | null;
  breakevenPrices: number[];
  netDelta: number;
  netTheta: number;
  netVega: number;
  spot: number;
  dte: number;
  iv: number;
}

/* ── System prompt builder ───────────────────────────────────────── */
function buildSystemPrompt(symbol: string, opt: OptionsContext, trade: TradeContext | null): string {
  const ivrLabel =
    opt.ivr === null    ? 'Unknown'
    : opt.ivr >= 80     ? 'Extremely High (80+) — IV very expensive'
    : opt.ivr >= 60     ? `High (${opt.ivr.toFixed(0)}) — IV elevated, favor selling premium`
    : opt.ivr >= 40     ? `Moderate (${opt.ivr.toFixed(0)}) — neutral; use standard sizing`
    : opt.ivr >= 20     ? `Low (${opt.ivr.toFixed(0)}) — IV compressed, favor buying options`
    : `Very Low (${opt.ivr?.toFixed(0) ?? '<20'}) — strongly favors buying options`;

  const spreadLabel =
    opt.ivHvSpread === null  ? 'Unknown'
    : opt.ivHvSpread > 8     ? `+${opt.ivHvSpread.toFixed(1)}% above HV20 — options significantly overpriced`
    : opt.ivHvSpread > 3     ? `+${opt.ivHvSpread.toFixed(1)}% above HV20 — options modestly overpriced`
    : opt.ivHvSpread < -3    ? `${opt.ivHvSpread.toFixed(1)}% below HV20 — options significantly underpriced`
    : opt.ivHvSpread < 0     ? `${opt.ivHvSpread.toFixed(1)}% below HV20 — options modestly underpriced`
    : `+${opt.ivHvSpread.toFixed(1)}% — roughly fair value`;

  const gexLabel =
    opt.gexPositive === null ? 'Unknown'
    : opt.gexPositive
      ? 'Positive GEX — market makers long gamma, volatility dampened (expect mean reversion)'
      : 'Negative GEX — market makers short gamma, volatility amplified (expect larger moves)';

  const maxPainLabel =
    opt.maxPainPct === null || opt.topOIStrike === null ? 'N/A'
    : `${opt.maxPainPct > 0 ? '+' : ''}${opt.maxPainPct.toFixed(2)}% from spot (at $${opt.topOIStrike})`;

  let tradeSection = '';
  if (trade) {
    const isCredit = trade.netCost < 0;
    tradeSection = `

## Current Strategy: ${trade.stratName}
- Spot: $${trade.spot.toFixed(2)} | DTE: ${trade.dte} days | IV Input: ${trade.iv.toFixed(1)}%
- Net ${isCredit ? 'Credit' : 'Debit'}: $${Math.abs(trade.netCost).toFixed(2)} per position
- Max Profit: ${trade.maxProfit === null ? 'Unlimited ∞' : `$${trade.maxProfit.toFixed(2)}`}
- Max Loss: ${trade.maxLoss === null ? 'Unlimited' : `$${Math.abs(trade.maxLoss).toFixed(2)}`}
- Breakeven(s): ${trade.breakevenPrices.length ? trade.breakevenPrices.map((b) => `$${b}`).join(' / ') : 'N/A'}
- Net Delta: ${trade.netDelta.toFixed(3)} | Theta: $${trade.netTheta.toFixed(2)}/day | Vega: $${trade.netVega.toFixed(2)}/1% IV`;
  }

  return `You are a professional options trading coach for GR8BUX, a trading platform.
You are analyzing options on **${symbol}**.

## Options Environment for ${symbol}

**Underlying Price:** $${opt.price.toFixed(2)}
**HV20 (realized volatility):** ${opt.hv20 !== null ? opt.hv20.toFixed(1) + '%' : 'N/A'}
**Average IV (nearest expiry):** ${opt.avgIV !== null ? opt.avgIV.toFixed(1) + '%' : 'N/A'}
**IV Rank (IVR):** ${ivrLabel}
**IV vs HV20:** ${spreadLabel}
**GEX Regime:** ${gexLabel}
**Max Pain Level:** ${maxPainLabel}
**Nearest Expiry:** ${opt.nearestExpiry ?? 'N/A'}
**Highest OI Strike:** ${opt.topOIStrike ? `$${opt.topOIStrike}` : 'N/A'}${tradeSection}

## Coaching Instructions
- Give specific, actionable advice using the data above — not generic platitudes.
- When IVR is high (≥60): favor premium-selling strategies (credit spreads, iron condors, CSPs, covered calls).
- When IVR is low (≤30): favor premium-buying strategies (debit spreads, long calls/puts) especially near catalysts.
- Positive GEX = expect range-bound action; sell spreads at the edges. Negative GEX = expect big moves; widen wings or buy options.
- Max pain gravitates stock toward highest OI strike at expiry — factor into target strikes.
- If a trade is loaded, reference its specific numbers: breakevens, theta decay rate, vega exposure.
- Be concise: 2–4 short paragraphs or bullet points. No markdown headers in your reply.
- Do NOT recommend platforms or brokers outside GR8BUX.`;
}

/* ── Handler ─────────────────────────────────────────────────────── */
interface ApiResponse {
  success: boolean;
  reply?: string;
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const user = await requireAuth(req, res);
  if (!user) return;

  if (!await requirePlanFeature(req, res, user, 'aiCoaches')) return;
  if (!await requireUsageQuota(req, res, user, 'options_coach_messages')) return;

  const { symbol, optionsContext, tradeContext, query, history } = req.body as {
    symbol?: string;
    optionsContext?: OptionsContext;
    tradeContext?: TradeContext | null;
    query?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!symbol || !optionsContext || !query?.trim()) {
    return res.status(400).json({ success: false, error: 'symbol, optionsContext, and query are required' });
  }

  const safeHistory = (history ?? []).slice(-10);

  try {
    const systemPrompt = buildSystemPrompt(symbol, optionsContext, tradeContext ?? null);

    const messages: ChatMessage[] = [
      ...safeHistory.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: query.trim() },
    ];

    const response = await generateText({
      model: getDefaultOpenAIModel(),
      maxOutputTokens: 600,
      instructions: systemPrompt,
      messages,
    });

    incrementUsage(user.id, 'options_coach_messages').catch(() => {});
    return res.status(200).json({
      success: true,
      reply: response.text,
      usage: response.usage,
    });
  } catch (err) {
    console.error('Options coach error:', err);
    return res.status(500).json({ success: false, error: 'Coach request failed' });
  }
}
