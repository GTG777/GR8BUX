import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';

export interface ChatIntent {
  goalAmount: number;
  timeframe: 'today' | 'week' | 'month' | 'year';
  riskLevel: 'low' | 'moderate' | 'aggressive';
  sectors: string[] | null;
  strategy: 'long_calls' | 'pmcc' | 'spread';
  summary: string;
}

export interface LeapsCandidate {
  rank: number;
  symbol: string;
  name: string;
  sector: string;
  price: number;
  strike: number;
  expiry: string;
  dte: number;
  delta: number;
  mid: number;
  costPerContract: number;
  ivRank: number;
  rsi: number;
  hv20: number;
  inTheMoney: boolean;
  contractsNeeded: number;
  totalCost: number;
  gainAt2Pct: number;
  gainAt3Pct: number;
  gainAt5Pct: number;
  probITM: number;
  aiConsensus: string;
  aiConfidence: number;
  aiScore: number;
  compositeScore: number;
}

export interface ChatResponse {
  intent: ChatIntent;
  message: string;
  candidates: LeapsCandidate[];
  dataAge: string;
}

const CONSENSUS_WEIGHT: Record<string, number> = {
  STRONG_BUY: 5,
  BUY: 4,
  NEUTRAL: 3,
  WAIT: 2,
  AVOID: 1,
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, history = [] } = req.body as {
    message: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message required' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  // ── 1. Parse user intent ─────────────────────────────────────────────────
  let intent: ChatIntent = {
    goalAmount: 1000,
    timeframe: 'today',
    riskLevel: 'moderate',
    sectors: null,
    strategy: 'long_calls',
    summary: message.trim(),
  };

  try {
    const intentRes = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 256,
      temperature: 0,
      system: `Parse trading intent. Return ONLY valid JSON:
{"goalAmount":number,"timeframe":"today"|"week"|"month"|"year","riskLevel":"low"|"moderate"|"aggressive","sectors":string[]|null,"strategy":"long_calls"|"pmcc"|"spread","summary":string}
Defaults: goalAmount=1000, timeframe="today", riskLevel="moderate", sectors=null, strategy="long_calls".
"summary" is a 1-sentence plain English rephrase of the goal.`,
      messages: [{ role: 'user', content: message }],
    });
    const raw =
      intentRes.content[0].type === 'text'
        ? intentRes.content[0].text.replace(/```[a-z]*\n?|\n?```/g, '').trim()
        : '{}';
    intent = { ...intent, ...JSON.parse(raw) };
  } catch {
    // keep defaults on parse failure
  }

  // ── 2. Load market data from Supabase cache ──────────────────────────────
  const supabase = getSupabaseServiceRoleClient();
  let marketRows: any[] = [];
  const aiMap: Record<string, any> = {};
  let latestRefresh = '';

  if (supabase) {
    const [mdRes, aiRes] = await Promise.all([
      supabase
        .from('market_data')
        .select(
          'symbol, name, sector, price, hv20, rsi, ivr, raw_payload, refreshed_at'
        )
        .eq('fetch_error', false)
        .not('price', 'is', null),
      supabase
        .from('ai_analyses')
        .select('symbol, consensus, confidence, result')
        .eq('setup_type', 'LEAPS_CANDIDATE'),
    ]);
    marketRows = mdRes.data ?? [];
    for (const r of aiRes.data ?? []) aiMap[r.symbol] = r;
    latestRefresh = marketRows.reduce(
      (latest, r) => (r.refreshed_at > latest ? r.refreshed_at : latest),
      ''
    );
  }

  if (marketRows.length === 0) {
    return res.status(200).json({
      intent,
      message:
        "I don't have fresh market data yet — the cron refreshes every 15 minutes during market hours (9 AM–5 PM ET). Check back shortly, or ask your admin to trigger a manual refresh.",
      candidates: [],
      dataAge: 'unavailable',
    } satisfies ChatResponse);
  }

  // ── 3. Build and score candidates ────────────────────────────────────────
  const targetDelta =
    intent.riskLevel === 'low'
      ? 0.60
      : intent.riskLevel === 'aggressive'
      ? 0.78
      : 0.70;

  const candidates: LeapsCandidate[] = [];

  for (const row of marketRows) {
    // Sector filter
    if (intent.sectors?.length) {
      const matched = intent.sectors.some((s) =>
        row.sector?.toLowerCase().includes(s.toLowerCase())
      );
      if (!matched) continue;
    }

    const price = Number(row.price);
    if (!price) continue;

    // Find best call contract from cached raw_payload
    const allContracts: any[] = row.raw_payload?.contracts ?? [];
    const eligible = allContracts.filter(
      (c: any) =>
        c.type === 'call' &&
        c.delta >= 0.40 &&
        c.delta <= 0.92 &&
        (c.openInterest ?? 0) >= 5 &&
        c.mid > 0
    );

    if (!eligible.length) continue;

    // Pick contract closest to target delta
    const best = [...eligible].sort(
      (a, b) =>
        Math.abs(a.delta - targetDelta) - Math.abs(b.delta - targetDelta)
    )[0];

    const delta = Number(best.delta);
    const mid = Number(best.mid);
    const dte = Number(best.daysToExpiry) || 365;

    // First-order delta approximation for a given % move
    const gainAt2Pct = Math.round(delta * price * 0.02 * 100);
    const gainAt3Pct = Math.round(delta * price * 0.03 * 100);
    const gainAt5Pct = Math.round(delta * price * 0.05 * 100);

    const contractsNeeded = gainAt3Pct > 0 ? Math.ceil(intent.goalAmount / gainAt3Pct) : 99;
    const totalCost = Math.round(contractsNeeded * mid * 100);

    const ai = aiMap[row.symbol];
    const aiConsensus = ai?.consensus ?? 'NEUTRAL';
    const aiConfidence = Number(ai?.confidence) || 0.5;
    const aiScore = Number(ai?.result?.analyses?.technical?.qualityScore) || 50;

    // Composite score: consensus weight + technical score + IVR quality + RSI momentum
    const ivrPenalty = Math.min(Number(row.ivr) || 30, 60);
    const rsiBonus = (() => {
      const r = Number(row.rsi);
      if (r > 40 && r < 65) return 15;
      if (r >= 65 && r < 75) return 8;
      return 0;
    })();
    const composite =
      (CONSENSUS_WEIGHT[aiConsensus] ?? 3) * 10 +
      aiScore * 0.25 +
      (50 - ivrPenalty) +
      rsiBonus;

    candidates.push({
      rank: 0,
      symbol: row.symbol,
      name: row.name ?? row.symbol,
      sector: row.sector ?? '',
      price,
      strike: Number(best.strike) || 0,
      expiry: best.expirationStr ?? best.expiration ?? '',
      dte,
      delta,
      mid,
      costPerContract: Math.round(mid * 100),
      ivRank: Number(row.ivr) || 0,
      rsi: Number(row.rsi) || 50,
      hv20: Number(row.hv20) || 0,
      inTheMoney: !!best.inTheMoney,
      contractsNeeded,
      totalCost,
      gainAt2Pct,
      gainAt3Pct,
      gainAt5Pct,
      probITM: Math.round(delta * 100),
      aiConsensus,
      aiConfidence,
      aiScore,
      compositeScore: Math.round(composite),
    });
  }

  candidates.sort((a, b) => b.compositeScore - a.compositeScore);
  const top = candidates.slice(0, 12).map((c, i) => ({ ...c, rank: i + 1 }));

  // ── 4. Generate conversational narrative ─────────────────────────────────
  let narrative = '';
  try {
    const summaryLines = top.slice(0, 5).map(
      (c) =>
        `${c.rank}. ${c.symbol} (${c.name}): $${c.price.toFixed(0)} stock, $${c.strike} strike ${c.expiry} (${c.dte}d), δ${c.delta.toFixed(2)}, $${c.costPerContract.toLocaleString()}/contract, need ${c.contractsNeeded}x = $${c.totalCost.toLocaleString()} capital → ≈$${(c.gainAt3Pct * c.contractsNeeded).toLocaleString()} at 3% move, IVR:${c.ivRank.toFixed(0)} RSI:${c.rsi.toFixed(0)}, AI:${c.aiConsensus} (score ${c.aiScore})`
    );

    const narrativeRes = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 450,
      temperature: 0.65,
      system:
        'You are a LEAPS options advisor. Be direct, specific, and practical. No filler phrases. Use exact numbers. 3–5 sentences max.',
      messages: [
        ...(history.slice(-4) as any),
        {
          role: 'user',
          content: `User goal: "${intent.summary}"
Params: $${intent.goalAmount.toLocaleString()} profit target, ${intent.timeframe} timeframe, ${intent.riskLevel} risk, strategy: ${intent.strategy.replace('_', ' ')}.

Top candidates ranked by composite AI score:
${summaryLines.join('\n')}

Write a brief analysis: which ticker to prioritize and why, realistic capital required, what % move is needed, and 1 key risk to watch. Be specific with numbers.`,
        },
      ],
    });
    narrative =
      narrativeRes.content[0].type === 'text'
        ? narrativeRes.content[0].text
        : '';
  } catch {
    const c = top[0];
    if (c) {
      narrative = `Top pick: **${c.symbol}** — buy ${c.contractsNeeded} call(s) at the $${c.strike} strike expiring ${c.expiry} (δ${c.delta.toFixed(2)}) for ~$${c.totalCost.toLocaleString()} total capital. That yields ≈$${(c.gainAt3Pct * c.contractsNeeded).toLocaleString()} at a 3% move in ${c.symbol}. All ${top.length} ranked candidates are in the table below.`;
    } else {
      narrative =
        'No candidates matched your criteria. Try broadening your sector filter or adjusting your goal amount.';
    }
  }

  return res.status(200).json({
    intent,
    message: narrative,
    candidates: top,
    dataAge: latestRefresh ? timeAgo(latestRefresh) : 'unknown',
  } satisfies ChatResponse);
}
