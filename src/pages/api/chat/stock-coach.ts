/**
 * POST /api/chat/stock-coach
 *
 * Stock Analysis Coach — context-stuffing (no RAG).
 * Receives live indicator data + detected setups for the current symbol,
 * then uses Claude to give actionable, data-grounded analysis.
 *
 * Body:
 *   {
 *     symbol:     string
 *     indicators: StockIndicators
 *     setups:     StockSetup[]
 *     query:      string
 *     history?:   Array<{ role: 'user'|'assistant'; content: string }>
 *   }
 *
 * Returns:
 *   { reply: string; usage: { inputTokens, outputTokens, estimatedCostUsd } }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/apiAuth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

/* ── Types (mirrors stocks page) ─────────────────────────────────── */
interface StockIndicators {
  price: number;
  changePct: number;
  ema20: number;
  ema50: number;
  ema200: number;
  tsi: number;
  tsiSignal: number;
  atr14: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
  hv20: number;
  volumeRatio: number;
  high20: number;
  low20: number;
  trendScore: number;
  rsi: number;
  obvSlope: number;
}

interface StockSetup {
  id: string;
  name: string;
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  rrRatio1: number;
  rrRatio2: number;
  pop: number;
  grade: 'A' | 'B' | 'C';
  reasons: string[];
}

/* ── System prompt ───────────────────────────────────────────────── */
function buildSystemPrompt(symbol: string, ind: StockIndicators, setups: StockSetup[]): string {
  const trendLabel =
    ind.trendScore === 3  ? 'Strong Uptrend (all 3 EMAs below price)'  :
    ind.trendScore === 2  ? 'Uptrend (EMA20 + EMA50 below price)'       :
    ind.trendScore === 1  ? 'Mixed Bullish (EMA20 below price)'         :
    ind.trendScore === -1 ? 'Mixed Bearish (EMA20 above price)'         :
    ind.trendScore === -2 ? 'Downtrend (EMA20 + EMA50 above price)'     : 'Strong Downtrend (all 3 EMAs above price)';

  const tsiLabel = ind.tsi > 25 ? 'Overbought/Bullish' : ind.tsi < -25 ? 'Oversold/Bearish' : 'Neutral';
  const rsiLabel = ind.rsi > 70 ? 'Overbought' : ind.rsi < 30 ? 'Oversold' : 'Neutral';
  const bbPos = ind.price > ind.bbUpper ? 'Above upper band (extended)'
    : ind.price < ind.bbLower ? 'Below lower band (oversold stretch)'
    : 'Inside bands (normal range)';

  const setupsText = setups.length === 0
    ? 'No high-confidence setups detected at this time.'
    : setups.map((s) =>
        `• ${s.name} (${s.direction.toUpperCase()}, Grade ${s.grade}, PoS ${s.pop}%)\n` +
        `  Entry $${s.entry.toFixed(2)} | Stop $${s.stop.toFixed(2)} | T1 $${s.target1.toFixed(2)} (${s.rrRatio1}:1) | T2 $${s.target2.toFixed(2)} (${s.rrRatio2}:1)\n` +
        `  Reasons: ${s.reasons.join('; ')}`
      ).join('\n');

  return `You are a professional stock technical analysis coach for GR8BUX, a trading platform.
You are analyzing ${symbol} in real time.

## Current Market Data for ${symbol}

**Price Action**
- Last Price: $${ind.price.toFixed(2)} (${ind.changePct >= 0 ? '+' : ''}${ind.changePct.toFixed(2)}% today)
- 20-day High: $${ind.high20.toFixed(2)} | 20-day Low: $${ind.low20.toFixed(2)}
- ATR(14): $${ind.atr14.toFixed(2)} (daily range proxy)
- Volume Ratio vs 20d avg: ${ind.volumeRatio.toFixed(2)}x${ind.volumeRatio >= 1.3 ? ' ← above-average conviction' : ind.volumeRatio < 0.7 ? ' ← thin/low-conviction move' : ''}

**EMA Trend**
- EMA20: $${ind.ema20.toFixed(2)} | EMA50: $${ind.ema50.toFixed(2)} | EMA200: $${ind.ema200.toFixed(2)}
- Trend Score: ${ind.trendScore > 0 ? '+' : ''}${ind.trendScore}/3 — ${trendLabel}

**Momentum (TSI 25/13)**
- TSI: ${ind.tsi.toFixed(2)} (${tsiLabel}) | Signal: ${ind.tsiSignal.toFixed(2)}
- TSI vs Signal: ${ind.tsi > ind.tsiSignal ? 'TSI above signal → bullish crossover' : 'TSI below signal → bearish crossover'}
- OBV slope: ${ind.obvSlope > 0 ? 'Positive (accumulation)' : ind.obvSlope < 0 ? 'Negative (distribution)' : 'Flat'}

**Oscillators**
- RSI(14): ${ind.rsi.toFixed(1)} — ${rsiLabel}
- MACD Line: ${ind.macdLine.toFixed(3)} | Signal: ${ind.macdSignal.toFixed(3)} | Histogram: ${ind.macdHist.toFixed(3)}${ind.macdHist > 0 ? ' (bullish)' : ' (bearish)'}

**Volatility / Bands**
- Bollinger Bands: Upper $${ind.bbUpper.toFixed(2)} | Middle $${ind.bbMiddle.toFixed(2)} | Lower $${ind.bbLower.toFixed(2)}
- Price vs Bands: ${bbPos}
- HV20: ${ind.hv20.toFixed(1)}%

## Detected Setups
${setupsText}

## Instructions
- Answer the user's question with specific numbers from the data above — not generic advice.
- When discussing setups, reference the actual entry/stop/target levels.
- Be concise but complete. Use plain language, not jargon.
- If the user asks about risk, compute it explicitly using ATR and the setup stops.
- Do NOT suggest tools or platforms outside GR8BUX.
- Format using short paragraphs or bullet points. No markdown headers.
- Maximum 3–4 short paragraphs per response.`;
}

/* ── Handler ─────────────────────────────────────────────────────── */
interface ApiResponse {
  success: boolean;
  reply?: string;
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { symbol, indicators, setups, query, history } = req.body as {
    symbol?: string;
    indicators?: StockIndicators;
    setups?: StockSetup[];
    query?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!symbol || !indicators || !query?.trim()) {
    return res.status(400).json({ success: false, error: 'symbol, indicators, and query are required' });
  }

  const safeHistory = (history ?? []).slice(-10);

  try {
    const systemPrompt = buildSystemPrompt(symbol, indicators, setups ?? []);

    const messages: Anthropic.MessageParam[] = [
      ...safeHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: query.trim() },
    ];

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      system: systemPrompt,
      messages,
    });

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const estimatedCostUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;

    return res.status(200).json({
      success: true,
      reply,
      usage: { inputTokens, outputTokens, estimatedCostUsd },
    });
  } catch (err) {
    console.error('Stock coach error:', err);
    return res.status(500).json({ success: false, error: 'Coach request failed' });
  }
}
