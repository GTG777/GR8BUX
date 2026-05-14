import type { NextApiRequest, NextApiResponse } from 'next';
import { getOptionsChainPaged, getStockSnapshot, todayDateStr, type MassiveOptionContract } from '@/lib/massive';

type OptionSide = 'call' | 'put';
type IVMode = 'iv_percentile' | 'iv_rank';
type AfterHoursSpreadMode = 'disable' | 'relax';

interface DailyOptionsConfig {
  universe: {
    tickers: string[];
    includeWeeklies: boolean;
    excludeEarningsWithinDays: number;
  };
  data: {
    provider: 'placeholder';
    refreshIntervalMinutes: number;
  };
  afterHours?: {
    enabled: boolean;
    spreadFilterMode: AfterHoursSpreadMode;
    relaxedMaxBidAskSpreadPct: number;
  };
  liquidity: {
    minOpenInterest: number;
    minVolume: number;
    maxBidAskSpreadPct: number;
    minOptionPrice: number;
    maxContractsPerTicker: number;
  };
  expiry: {
    dteMin: number;
    dteMax: number;
    allow0DTE: boolean;
    allow1DTE: boolean;
  };
  greeks: {
    deltaMin: number;
    deltaMax: number;
  };
  volatility: {
    mode: IVMode;
    threshold: number;
    ivSpike: { enabled: boolean; lookbackDays: number; thresholdPct: number };
  };
  scoring: {
    weights: {
      volumeVsOI: number;
      volatility: number;
      delta: number;
      liquidity: number;
      dte: number;
    };
  };
  risk: {
    maxRiskPctPerTrade: number;
    definedRiskOnly: boolean;
    warnOnWideSpreadPct: number;
  };
  scheduler: {
    enabled: boolean;
    runEveryMinutes: number;
    dedupeWindowMinutes: number;
  };
}

interface DailyScanRequestBody {
  config: DailyOptionsConfig;
  accountSize?: number; // used only for sizing math
  side?: 'calls' | 'puts' | 'both';
}

interface ChainContract {
  contractSymbol: string;
  strike: number;
  expiration: number; // unix seconds
  expirationStr: string;
  type: OptionSide;
  bid: number;
  ask: number;
  mid: number;
  lastPrice: number;
  impliedVolatility: number; // 0-1
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  openInterest: number;
  volume: number;
  inTheMoney: boolean;
}

interface CandidateSignal {
  id: string;
  ticker: string;
  contractSymbol: string;
  type: OptionSide;
  strike: number;
  expiry: string;
  dte: number;
  underlyingPrice: number;
  bid: number;
  ask: number;
  mid: number;
  spreadPct: number | null;
  iv: number; // percent (0-100)
  ivMetric: { mode: IVMode; value: number | null; note?: string };
  greeks: { delta: number | null; gamma: number | null; theta: number | null };
  liquidity: { openInterest: number; volume: number; volumeOiRatio: number; liquidityScore: number };
  score: { total: number; breakdown: Record<string, number>; weights: DailyOptionsConfig['scoring']['weights'] };
  rationale: string[];
  risk: {
    maxLossPerContract: number | null;
    maxRiskPctPerTrade: number;
    positionSizing: {
      method: 'percent_of_account';
      accountSize?: number;
      maxRiskDollars?: number;
      suggestedContracts?: number;
      riskPerContract?: number;
    };
  };
  warnings: string[];
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeTicker(raw: string) {
  const symbol = raw.toUpperCase().trim().replace(/[^A-Z0-9.-]/g, '');
  if (!symbol || !/^[A-Z][A-Z0-9.-]{0,10}$/.test(symbol)) return null;
  return symbol;
}

function pctRank(values: number[], x: number): number | null {
  const valid = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (valid.length < 2) return null;
  let lo = 0;
  let hi = valid.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (valid[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  // lo is first index where value >= x
  const idx = lo;
  return clamp((idx / (valid.length - 1)) * 100, 0, 100);
}

function mapContract(raw: MassiveOptionContract, underlyingPrice: number): ChainContract {
  const { details, day, last_quote, last_trade, greeks, implied_volatility, open_interest } = raw;
  const bid = last_quote?.bid ?? 0;
  const ask = last_quote?.ask ?? 0;
  const mid = last_quote?.midpoint
    ? parseFloat(last_quote.midpoint.toFixed(2))
    : bid > 0 && ask > 0
      ? parseFloat(((bid + ask) / 2).toFixed(2))
      : bid > 0
        ? parseFloat(bid.toFixed(2))
        : 0;
  const lastPrice = last_trade?.price ?? 0;
  const expDate = details.expiration_date;
  const expEpoch = Math.floor(new Date(expDate + 'T21:00:00Z').getTime() / 1000);

  const spotPrice = raw.underlying_asset?.price ?? underlyingPrice;
  const inTheMoney =
    details.contract_type === 'call' ? spotPrice > details.strike_price : spotPrice < details.strike_price;

  return {
    contractSymbol: details.ticker,
    strike: details.strike_price,
    expiration: expEpoch,
    expirationStr: expDate,
    type: details.contract_type,
    bid: parseFloat(bid.toFixed(2)),
    ask: parseFloat(ask.toFixed(2)),
    mid,
    lastPrice: parseFloat(lastPrice.toFixed(2)),
    impliedVolatility: implied_volatility ?? 0,
    delta: greeks?.delta ?? null,
    gamma: greeks?.gamma ?? null,
    theta: greeks?.theta ?? null,
    openInterest: open_interest ?? 0,
    volume: day?.volume ?? 0,
    inTheMoney,
  };
}

function spreadPct(c: ChainContract): number | null {
  if (c.mid <= 0 || c.ask <= 0 || c.bid < 0) return null;
  const sp = ((c.ask - c.bid) / c.mid) * 100;
  if (!Number.isFinite(sp)) return null;
  return clamp(parseFloat(sp.toFixed(2)), 0, 1000);
}

function isMissingQuote(c: ChainContract): boolean {
  return c.bid <= 0 || c.ask <= 0 || c.mid <= 0;
}

function dteFromExpiration(expirationUnixSeconds: number): number {
  const ms = expirationUnixSeconds * 1000 - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function scoreCandidate(args: {
  c: ChainContract;
  config: DailyOptionsConfig;
  dte: number;
  spread: number | null;
  ivMetricValue: number | null;
}): { total: number; breakdown: Record<string, number>; liquidityScore: number; volumeOiRatio: number } {
  const { c, config, dte, spread, ivMetricValue } = args;

  const volumeOiRatio = c.volume / Math.max(1, c.openInterest);
  const volumeVsOIScore = clamp(volumeOiRatio, 0, 1);

  const volatilityScore = ivMetricValue === null ? 0 : clamp(ivMetricValue / 100, 0, 1);

  const delta = c.delta ?? null;
  const absDelta = delta === null ? null : Math.abs(delta);
  const deltaScore =
    absDelta === null ? 0 : absDelta >= config.greeks.deltaMin && absDelta <= config.greeks.deltaMax ? 1 : 0;

  const dteCenter = (config.expiry.dteMin + config.expiry.dteMax) / 2;
  const dteHalf = Math.max(1, (config.expiry.dteMax - config.expiry.dteMin) / 2);
  const dteScore = clamp(1 - Math.abs(dte - dteCenter) / dteHalf, 0, 1);

  const oiNorm = clamp(Math.log10(c.openInterest + 1) / Math.log10(20000), 0, 1);
  const volNorm = clamp(Math.log10(c.volume + 1) / Math.log10(20000), 0, 1);
  const spreadNorm = spread === null ? 0 : clamp(1 - spread / Math.max(1, config.liquidity.maxBidAskSpreadPct), 0, 1);
  const priceNorm = clamp(c.mid / 5, 0, 1);
  const liquidityScore = clamp((oiNorm + volNorm + spreadNorm + priceNorm) / 4, 0, 1);

  const weights = config.scoring.weights;
  const wSum = Math.max(0.0001, weights.volumeVsOI + weights.volatility + weights.delta + weights.liquidity + weights.dte);

  const breakdown = {
    liquidity: liquidityScore,
    volume_vs_oi: volumeVsOIScore,
    volatility: volatilityScore,
    delta_fit: deltaScore,
    dte: dteScore,
  };
  const total =
    (weights.liquidity * breakdown.liquidity +
      weights.volumeVsOI * breakdown.volume_vs_oi +
      weights.volatility * breakdown.volatility +
      weights.delta * breakdown.delta_fit +
      weights.dte * breakdown.dte) /
    wSum;

  return { total: parseFloat(total.toFixed(4)), breakdown, liquidityScore: parseFloat(liquidityScore.toFixed(4)), volumeOiRatio: parseFloat(volumeOiRatio.toFixed(4)) };
}

async function processTicker(ticker: string, config: DailyOptionsConfig, side: DailyScanRequestBody['side']) {
  const today = todayDateStr();
  const afterHours = config.afterHours ?? {
    enabled: false,
    spreadFilterMode: 'relax' as const,
    relaxedMaxBidAskSpreadPct: config.liquidity.maxBidAskSpreadPct,
  };

  const { contracts: rawContracts, underlyingPrice: chainPrice } = await getOptionsChainPaged(
    ticker,
    { 'expiration_date.gte': today, sort: 'expiration_date' as const },
    10,
    6,
  );

  let underlyingPrice = chainPrice;
  if (!underlyingPrice) {
    try {
      const snap = await getStockSnapshot(ticker);
      underlyingPrice = snap.day?.c ?? snap.prevDay?.c ?? 0;
    } catch {
      underlyingPrice = 0;
    }
  }

  const mapped = rawContracts.map((c) => mapContract(c, underlyingPrice));
  const ivs = mapped.filter((c) => (c.impliedVolatility ?? 0) > 0).map((c) => c.impliedVolatility * 100);

  const candidates: Array<{
    c: ChainContract;
    dte: number;
    spread: number | null;
    ivMetricValue: number | null;
    usedFallback: boolean;
  }> = [];

  for (const c of mapped) {
    if (side === 'calls' && c.type !== 'call') continue;
    if (side === 'puts' && c.type !== 'put') continue;

    const dte = dteFromExpiration(c.expiration);
    if (dte < config.expiry.dteMin || dte > config.expiry.dteMax) continue;
    if (dte === 0 && !config.expiry.allow0DTE) continue;
    if (dte === 1 && !config.expiry.allow1DTE) continue;

    if (c.openInterest < config.liquidity.minOpenInterest) continue;
    if (c.volume < config.liquidity.minVolume) continue;
    const usedFallback = afterHours.enabled && isMissingQuote(c) && c.lastPrice > 0;
    const effectiveMid = usedFallback ? c.lastPrice : c.mid;
    const sp = usedFallback ? null : spreadPct(c);

    if (effectiveMid < config.liquidity.minOptionPrice) continue;

    if (afterHours.enabled) {
      if (afterHours.spreadFilterMode === 'relax') {
        const maxSpread = Math.max(config.liquidity.maxBidAskSpreadPct, afterHours.relaxedMaxBidAskSpreadPct);
        if (sp !== null && sp > maxSpread) continue;
      }
      if (afterHours.spreadFilterMode === 'disable') {
        // skip spread filtering entirely
      }
    } else {
      if (sp === null || sp > config.liquidity.maxBidAskSpreadPct) continue;
    }

    if (c.delta === null) continue;
    const absDelta = Math.abs(c.delta);
    if (absDelta < config.greeks.deltaMin || absDelta > config.greeks.deltaMax) continue;

    const ivMetricValue = pctRank(ivs, (c.impliedVolatility ?? 0) * 100);
    if (ivMetricValue !== null && ivMetricValue < config.volatility.threshold) continue;
    if (ivMetricValue === null) continue;

    // If we used fallback, override displayed quotes to be explicit and consistent.
    const cOut: ChainContract = usedFallback
      ? { ...c, bid: c.lastPrice, ask: c.lastPrice, mid: c.lastPrice }
      : c;

    candidates.push({ c: cOut, dte, spread: sp, ivMetricValue, usedFallback });
  }

  // Score + rank, cap per ticker
  const scored = candidates
    .map(({ c, dte, spread, ivMetricValue, usedFallback }) => {
      const scoredParts = scoreCandidate({ c, config, dte, spread, ivMetricValue });
      return { c, dte, spread, ivMetricValue, usedFallback, scoredParts };
    })
    .sort((a, b) => b.scoredParts.total - a.scoredParts.total || (a.spread ?? 999) - (b.spread ?? 999));

  return { ticker, underlyingPrice, scored: scored.slice(0, config.liquidity.maxContractsPerTicker), ivMetricNote: 'IV metric uses within-chain percentile (not true historical IV percentile/rank).' };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body: DailyScanRequestBody | null = null;
  try {
    body = typeof req.body === 'string' ? (JSON.parse(req.body) as DailyScanRequestBody) : (req.body as DailyScanRequestBody);
  } catch {
    body = null;
  }

  if (!body?.config) return res.status(400).json({ error: 'Missing config' });
  const side = body.side ?? 'both';

  const tickers = (body.config.universe?.tickers ?? [])
    .map((t) => safeTicker(String(t)))
    .filter((t): t is string => Boolean(t))
    .slice(0, 50);
  if (tickers.length === 0) return res.status(400).json({ error: 'No valid tickers' });

  const accountSize = body.accountSize && Number.isFinite(body.accountSize) ? Math.max(0, body.accountSize) : undefined;

  const config = body.config;
  const afterHours = config.afterHours ?? {
    enabled: false,
    spreadFilterMode: 'relax' as const,
    relaxedMaxBidAskSpreadPct: config.liquidity.maxBidAskSpreadPct,
  };
  const errors: Array<{ ticker: string; error: string }> = [];

  // Simple concurrency limiter
  const results: Awaited<ReturnType<typeof processTicker>>[] = [];
  const concurrency = 4;
  for (let i = 0; i < tickers.length; i += concurrency) {
    const chunk = tickers.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((t) => processTicker(t, config, side)));
    for (let j = 0; j < settled.length; j++) {
      const s = settled[j];
      if (s.status === 'fulfilled') results.push(s.value);
      else {
        const msg = s.reason instanceof Error ? s.reason.message : 'Unknown error';
        errors.push({ ticker: chunk[j] ?? 'UNKNOWN', error: msg });
      }
    }
  }

  const signals: CandidateSignal[] = [];
  let fallbackCount = 0;
  for (const r of results) {
    for (const row of r.scored) {
      const c = row.c;
      const ivPct = parseFloat(((c.impliedVolatility ?? 0) * 100).toFixed(1));

      const warnings: string[] = [];
      if (config.risk.definedRiskOnly) warnings.push('Defined-risk-only is enabled, but spread construction is not implemented yet (single-leg contract shown).');
      if (row.spread !== null && row.spread >= config.risk.warnOnWideSpreadPct) warnings.push('Bid-ask spread is wide relative to your warning threshold.');
      if (row.dte <= 1) warnings.push('Very short-dated option (0–1 DTE). Gamma and decay risk are elevated.');
      if (afterHours.enabled) {
        warnings.push('After-hours mode is enabled. Always verify live quotes before trading.');
        if (afterHours.spreadFilterMode === 'disable') warnings.push('Spread filtering disabled in after-hours mode.');
      }
      if (afterHours.enabled && row.usedFallback) {
        warnings.push('Bid/ask unavailable. Using last trade price; spread is unknown.');
      }
      if (row.usedFallback) fallbackCount += 1;

      const riskPerContract = c.mid > 0 ? parseFloat((c.mid * 100).toFixed(2)) : null;
      const maxRiskDollars = accountSize !== undefined ? parseFloat(((accountSize * config.risk.maxRiskPctPerTrade) / 100).toFixed(2)) : undefined;
      const suggestedContracts =
        riskPerContract !== null && maxRiskDollars !== undefined && riskPerContract > 0
          ? Math.max(0, Math.floor(maxRiskDollars / riskPerContract))
          : undefined;

      const rationale: string[] = [];
      rationale.push(`Liquidity score ${row.scoredParts.liquidityScore.toFixed(2)} (OI ${c.openInterest}, vol ${c.volume}, spread ${row.spread?.toFixed(2)}%).`);
      rationale.push(`IV metric ${row.ivMetricValue?.toFixed(1)}% (within-chain percentile).`);
      rationale.push(`Volume/OI ratio ${row.scoredParts.volumeOiRatio.toFixed(2)}; delta ${c.delta?.toFixed(2)}; DTE ${row.dte}.`);

      const id = `${r.ticker}:${c.expirationStr}:${c.type}:${c.strike}`;

      signals.push({
        id,
        ticker: r.ticker,
        contractSymbol: c.contractSymbol,
        type: c.type,
        strike: c.strike,
        expiry: c.expirationStr,
        dte: row.dte,
        underlyingPrice: r.underlyingPrice,
        bid: c.bid,
        ask: c.ask,
        mid: c.mid,
        spreadPct: row.spread,
        iv: ivPct,
        ivMetric: { mode: config.volatility.mode, value: row.ivMetricValue, note: r.ivMetricNote },
        greeks: { delta: c.delta, gamma: c.gamma, theta: c.theta },
        liquidity: {
          openInterest: c.openInterest,
          volume: c.volume,
          volumeOiRatio: row.scoredParts.volumeOiRatio,
          liquidityScore: row.scoredParts.liquidityScore,
        },
        score: { total: row.scoredParts.total, breakdown: row.scoredParts.breakdown, weights: config.scoring.weights },
        rationale,
        risk: {
          maxLossPerContract: riskPerContract,
          maxRiskPctPerTrade: config.risk.maxRiskPctPerTrade,
          positionSizing: {
            method: 'percent_of_account',
            accountSize,
            maxRiskDollars,
            suggestedContracts,
            riskPerContract: riskPerContract ?? undefined,
          },
        },
        warnings,
      });
    }
  }

  signals.sort((a, b) => b.score.total - a.score.total || a.ticker.localeCompare(b.ticker));

  return res.status(200).json({
    success: true,
    fetchedAt: Date.now(),
    tickers: tickers,
    warnings: afterHours.enabled
      ? [
          'After-hours mode enabled: results may be less reliable due to missing/late quotes.',
          ...(fallbackCount > 0 ? [`Used last-trade fallback pricing for ${fallbackCount} contract(s); bid/ask spread may be unknown.`] : []),
        ]
      : [],
    candidates: signals,
    errors,
    disclaimer:
      'Signals are probabilistic research outputs, not trade advice. No guaranteed profit. No automatic execution. Always validate liquidity and risk.',
  });
}
