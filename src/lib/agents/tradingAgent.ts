import { getMultipleStockSnapshots, type MassiveTickerSnapshot } from '@/lib/massive';
import type {
  TradingAgentDashboard,
  TradingAgentPaperPosition,
  TradingAgentReview,
  TradingAgentRuleSet,
  TradingAgentSignal,
} from '@/types/tradingAgent';

const DEFAULT_RULES: TradingAgentRuleSet = {
  mode: 'signals_only',
  maxRiskPerTradePct: 1,
  maxDailyLossPct: 3,
  maxOpenPositions: 5,
  requireManualApproval: true,
  allowOptions: false,
  watchlist: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMD', 'TSLA'],
};

interface MarketInput {
  symbol: string;
  price: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  dataSource: 'massive' | 'fallback';
}

function toMarketInput(symbol: string, snap?: MassiveTickerSnapshot): MarketInput {
  const fallbackBase = 90 + symbol.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 220;
  const fallbackMove = ((symbol.charCodeAt(0) % 7) - 3) / 100;
  const price = snap?.day?.c || snap?.min?.c || snap?.prevDay?.c || parseFloat((fallbackBase * (1 + fallbackMove)).toFixed(2));
  const previousClose = snap?.prevDay?.c || parseFloat((price / (1 + fallbackMove || 1)).toFixed(2));
  const dayHigh = snap?.day?.h || parseFloat((Math.max(price, previousClose) * 1.012).toFixed(2));
  const dayLow = snap?.day?.l || parseFloat((Math.min(price, previousClose) * 0.988).toFixed(2));
  const volume = snap?.day?.v || 500000 + (symbol.charCodeAt(symbol.length - 1) % 10) * 120000;

  return {
    symbol,
    price,
    previousClose,
    dayHigh,
    dayLow,
    volume,
    dataSource: snap ? 'massive' : 'fallback',
  };
}

function buildSignal(input: MarketInput, rules: TradingAgentRuleSet, accountSize: number): TradingAgentSignal {
  const changePct = input.previousClose > 0 ? ((input.price - input.previousClose) / input.previousClose) * 100 : 0;
  const rangePct = input.price > 0 ? ((input.dayHigh - input.dayLow) / input.price) * 100 : 0;
  const maxRiskDollars = parseFloat(((accountSize * rules.maxRiskPerTradePct) / 100).toFixed(2));

  let action: TradingAgentSignal['action'] = 'HOLD';
  if (changePct >= 1.2 && rangePct <= 5) action = 'BUY';
  if (changePct <= -1.2) action = 'SELL';
  if (rangePct > 6.5) action = 'AVOID';

  const confidenceBase = Math.min(0.92, 0.48 + Math.abs(changePct) / 8 + Math.max(0, 2.5 - rangePct) / 12);
  const confidence = parseFloat((action === 'HOLD' ? Math.min(confidenceBase, 0.62) : confidenceBase).toFixed(2));
  const stop = action === 'BUY' ? parseFloat((input.price * 0.975).toFixed(2)) : action === 'SELL' ? parseFloat((input.price * 1.025).toFixed(2)) : null;
  const target = action === 'BUY' ? parseFloat((input.price * 1.055).toFixed(2)) : action === 'SELL' ? parseFloat((input.price * 0.945).toFixed(2)) : null;
  const risk = stop ? Math.abs(input.price - stop) : 0;
  const reward = target ? Math.abs(target - input.price) : 0;

  const supportingSignals = [
    `${changePct >= 0 ? 'Up' : 'Down'} ${Math.abs(changePct).toFixed(2)}% vs previous close.`,
    `Intraday range is ${rangePct.toFixed(2)}%.`,
    `Volume snapshot: ${Math.round(input.volume).toLocaleString()} shares.`,
  ];

  const riskFlags: string[] = [];
  if (input.dataSource === 'fallback') riskFlags.push('Using fallback demo data because Massive data is unavailable.');
  if (rangePct > 5) riskFlags.push('Wide intraday range; reduce size or wait for cleaner structure.');
  if (input.volume < 750000) riskFlags.push('Lower volume snapshot; liquidity confirmation required.');
  if (rules.requireManualApproval) riskFlags.push('Manual approval required before any paper execution.');

  return {
    id: `${input.symbol}-${new Date().toISOString().slice(0, 10)}-${action}`,
    symbol: input.symbol,
    assetType: 'stock',
    action,
    confidence,
    generatedAt: new Date().toISOString(),
    entry: action === 'HOLD' || action === 'AVOID' ? null : input.price,
    stop,
    target,
    riskReward: risk > 0 ? parseFloat((reward / risk).toFixed(2)) : null,
    maxRiskDollars,
    thesis:
      action === 'BUY'
        ? 'Momentum is positive enough to watch for a controlled long paper entry.'
        : action === 'SELL'
          ? 'Weakness is strong enough to consider trimming or watching for downside continuation.'
          : action === 'AVOID'
            ? 'Volatility is too wide for the current guardrails.'
            : 'No clean edge under the current rules.',
    invalidation:
      action === 'BUY'
        ? 'Price loses the stop level or closes back below prior close.'
        : action === 'SELL'
          ? 'Price reclaims the stop level or breadth improves.'
          : 'Wait for clearer trend, cleaner range, or stronger confluence.',
    supportingSignals,
    riskFlags,
    dataSource: input.dataSource,
    status: action === 'BUY' || action === 'SELL' ? 'new' : 'watching',
  };
}

function buildPaperPositions(signals: TradingAgentSignal[]): TradingAgentPaperPosition[] {
  return signals
    .filter((signal) => signal.action === 'BUY' && signal.entry)
    .slice(0, 2)
    .map((signal, index) => {
      const entryPrice = signal.entry ?? 0;
      const markPrice = parseFloat((entryPrice * (1 + (index + 1) * 0.006)).toFixed(2));
      const quantity = Math.max(1, Math.floor(signal.maxRiskDollars / Math.max(1, Math.abs(entryPrice - (signal.stop ?? entryPrice)))));
      return {
        id: `paper-${signal.symbol}-${index}`,
        symbol: signal.symbol,
        side: 'long',
        quantity,
        entryPrice,
        markPrice,
        unrealizedPnl: parseFloat(((markPrice - entryPrice) * quantity).toFixed(2)),
        openedAt: signal.generatedAt,
        thesis: signal.thesis,
      };
    });
}

function buildReview(signals: TradingAgentSignal[], dataStatus: TradingAgentDashboard['dataStatus']): TradingAgentReview {
  const buyCount = signals.filter((s) => s.action === 'BUY').length;
  const avoidCount = signals.filter((s) => s.action === 'AVOID').length;
  const actionableCount = signals.filter((s) => s.action === 'BUY' || s.action === 'SELL').length;
  const reviewDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return {
    id: `review-${reviewDate}`,
    reviewForDate: reviewDate,
    createdAt: new Date().toISOString(),
    grade: actionableCount > 0 && avoidCount <= 1 ? 'B' : 'C',
    summary:
      actionableCount > 0
        ? `The agent found ${actionableCount} actionable setup${actionableCount === 1 ? '' : 's'} and kept ${signals.length - actionableCount} ticker${signals.length - actionableCount === 1 ? '' : 's'} on watch.`
        : 'The agent stayed mostly defensive because current rules did not find enough clean confluence.',
    whatWentRight: [
      'Risk was capped before sizing any paper entry.',
      buyCount > 0 ? 'Momentum candidates were separated from neutral watchlist names.' : 'The agent avoided forcing low-quality entries.',
      dataStatus === 'massive_live' ? 'Market data came from Massive snapshots.' : 'Fallback mode made the missing data dependency visible.',
    ],
    whatWentWrong: [
      'This version does not yet score news, earnings, or options-flow context.',
      'Paper fills are simulated until a broker adapter is connected.',
    ],
    improvements: [
      'Add saved user rule profiles and account-size settings.',
      'Connect paper broker positions and fills.',
      'Blend Daily Options, Stock Screener, news, and journal history into the score.',
    ],
    nextRulesToTest: [
      'Require market breadth confirmation before BUY signals.',
      'Block entries within one trading day of earnings unless explicitly allowed.',
      'Reduce size when intraday range exceeds the rolling average range.',
    ],
  };
}

export async function getTradingAgentDashboard(
  overrides: Partial<TradingAgentRuleSet> = {},
): Promise<TradingAgentDashboard> {
  const rules: TradingAgentRuleSet = { ...DEFAULT_RULES, ...overrides, watchlist: overrides.watchlist ?? DEFAULT_RULES.watchlist };
  const accountSize = 100000;
  const warnings: string[] = [];
  let snapshots = new Map<string, MassiveTickerSnapshot>();

  try {
    snapshots = await getMultipleStockSnapshots(rules.watchlist);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Massive data unavailable';
    warnings.push(message);
  }

  const inputs = rules.watchlist.map((symbol) => toMarketInput(symbol, snapshots.get(symbol)));
  const signals = inputs.map((input) => buildSignal(input, rules, accountSize)).sort((a, b) => b.confidence - a.confidence);
  const positions = buildPaperPositions(signals);
  const dataStatus: TradingAgentDashboard['dataStatus'] = inputs.some((input) => input.dataSource === 'massive')
    ? 'massive_live'
    : 'fallback_demo';
  const latestReview = buildReview(signals, dataStatus);
  const dayPnl = positions.reduce((sum, position) => sum + position.unrealizedPnl, 0);

  if (rules.mode === 'signals_only') warnings.push('Agent is in signals-only mode. No paper orders are being submitted.');
  if (dataStatus === 'fallback_demo') warnings.push('Configure MASSIVE_API_KEY for live market snapshots.');

  return {
    fetchedAt: new Date().toISOString(),
    nextReviewAt: nextOnePmCentralIso(),
    paperEquity: parseFloat((accountSize + dayPnl).toFixed(2)),
    dayPnl: parseFloat(dayPnl.toFixed(2)),
    mode: rules.mode,
    brokerStatus: 'not_connected',
    dataStatus,
    rules,
    signals,
    positions,
    latestReview,
    warnings: Array.from(new Set(warnings)),
  };
}

function nextOnePmCentralIso(): string {
  const now = new Date();
  const centralParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => centralParts.find((part) => part.type === type)?.value ?? '01';
  const centralNoonUtc = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')), 19, 0, 0);
  const next = now.getTime() < centralNoonUtc ? new Date(centralNoonUtc) : new Date(centralNoonUtc + 24 * 60 * 60 * 1000);
  return next.toISOString();
}
