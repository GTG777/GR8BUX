import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import type { Trade } from '@/types';

type Instrument = 'stock' | 'option';
type Horizon = 'daily' | 'swing';

interface Candidate {
  symbol: string;
  name: string;
  price: number;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  avgMovePct: number;
  volumeScore: number;
  trendScore: number;
  catalystScore: number;
  setupScore: number;
  ivRank: number;
  optionPremium: number;
  optionDelta: number;
  optionLiquidity: number;
  largeCap: boolean;
  note: string;
  catalyst: string;
}

interface RankedTrade {
  symbol: string;
  name: string;
  instrument: Instrument;
  score: number;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  quantity: number;
  capitalRequired: number;
  riskAtStop: number;
  profitGoal1: number;
  profitGoal2: number;
  rr1: number;
  rr2: number;
  catalyst: string;
  thesis: string;
  note: string;
}

interface QuoteResponse {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  latestTradingDay: string;
  previousClose: number;
  change: number;
  changePercent: string;
  marketOpen: boolean;
}

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandleResponse {
  symbol: string;
  candles: Candle[];
}

interface OptionContract {
  contractSymbol: string;
  strike: number;
  expiration: string;
  expirationStr: string;
  type: 'call' | 'put';
  lastPrice: number;
  bid: number;
  ask: number;
  mid: number;
  impliedVolatility: number;
  delta: number | null;
  openInterest: number;
  volume: number;
  inTheMoney: boolean;
  percentChange?: number;
}

interface OptionsChainResponse {
  symbol: string;
  underlyingPrice: number;
  expirations: string[];
  contracts: OptionContract[];
  fetchedAt: string;
}

interface EarningsEvent {
  symbol: string;
  name: string;
  reportDate: string;
  daysOut: number;
  ivRank: number;
  rsi: number;
  price: number;
  expectedMove: number;
  strategy: string;
  urgency: string;
}

interface EarningsResponse {
  events: EarningsEvent[];
  total: number;
  cachedAt: string;
}

interface SetupRow {
  symbol: string;
  company: string;
  sector: string;
  price: number;
  changePct: number;
  gapPct: number;
  catalyst: string;
  catalystDetail: string;
  setupType: string;
  entry: number;
  stop: number;
  target: number;
  rr: number;
  score: number;
  reason: string;
}

interface SetupsResponse {
  setups: SetupRow[];
  scannedAt: string;
  stale: boolean;
}

interface TradesResponse {
  success: boolean;
  data?: Trade[];
  error?: string;
  total?: number;
}

type DataSource = 'live' | 'mixed' | 'fallback';

const CORE_SYMBOLS = ['NVDA', 'AMD', 'RIVN', 'NOK', 'PLTR'];
const LARGE_CAP_SYMBOLS = new Set(['NVDA', 'AMD']);
const MILLION_DOLLAR_GOAL = 1000000;

const FALLBACK_CANDIDATES: Candidate[] = [
  {
    symbol: 'NVDA',
    name: 'NVIDIA',
    price: 118.2,
    entry: 119.4,
    stop: 114.8,
    target1: 126.5,
    target2: 131.8,
    avgMovePct: 7.2,
    volumeScore: 18,
    trendScore: 19,
    catalystScore: 16,
    setupScore: 18,
    ivRank: 47,
    optionPremium: 4.9,
    optionDelta: 0.58,
    optionLiquidity: 19,
    largeCap: true,
    catalyst: 'AI leadership and momentum follow-through',
    note: 'Large-cap momentum name with enough range for option leverage when breakout confirms.',
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    price: 164.6,
    entry: 166.1,
    stop: 160.3,
    target1: 175.5,
    target2: 181.2,
    avgMovePct: 6.4,
    volumeScore: 17,
    trendScore: 18,
    catalystScore: 15,
    setupScore: 17,
    ivRank: 44,
    optionPremium: 6.15,
    optionDelta: 0.56,
    optionLiquidity: 18,
    largeCap: true,
    catalyst: 'Semiconductor sympathy and breakout continuation',
    note: 'Cleaner risk-reward than most momentum names when it breaks resistance with volume.',
  },
  {
    symbol: 'RIVN',
    name: 'Rivian',
    price: 11.8,
    entry: 12.15,
    stop: 11.35,
    target1: 13.4,
    target2: 14.1,
    avgMovePct: 8.8,
    volumeScore: 16,
    trendScore: 13,
    catalystScore: 14,
    setupScore: 15,
    ivRank: 63,
    optionPremium: 0.84,
    optionDelta: 0.47,
    optionLiquidity: 13,
    largeCap: false,
    catalyst: 'High-beta EV swing setup with headline sensitivity',
    note: 'Explosive mover, but it needs tighter discipline because failed breakouts can reverse fast.',
  },
  {
    symbol: 'NOK',
    name: 'Nokia',
    price: 5.1,
    entry: 5.24,
    stop: 4.96,
    target1: 5.68,
    target2: 5.95,
    avgMovePct: 5.7,
    volumeScore: 14,
    trendScore: 11,
    catalystScore: 12,
    setupScore: 13,
    ivRank: 39,
    optionPremium: 0.29,
    optionDelta: 0.42,
    optionLiquidity: 10,
    largeCap: false,
    catalyst: 'Low-priced telecom breakout with options upside',
    note: 'Your prior NOK win makes this a useful tactical candidate when volume reappears.',
  },
  {
    symbol: 'PLTR',
    name: 'Palantir',
    price: 38.9,
    entry: 39.7,
    stop: 37.8,
    target1: 42.9,
    target2: 45.6,
    avgMovePct: 6.1,
    volumeScore: 17,
    trendScore: 18,
    catalystScore: 16,
    setupScore: 16,
    ivRank: 55,
    optionPremium: 2.35,
    optionDelta: 0.51,
    optionLiquidity: 16,
    largeCap: false,
    catalyst: 'Momentum software name with strong retail participation',
    note: 'Works well on trend continuation days when growth is leading the tape.',
  },
];

const FALLBACK_BY_SYMBOL = new Map(FALLBACK_CANDIDATES.map((candidate) => [candidate.symbol, candidate]));

function formatMoney(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function SectionTooltip({ label, description }: { label: string; description: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <button
        type="button"
        aria-label={`${label} info`}
        className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-white font-mono text-[11px] font-semibold text-gray-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-indigo-400 dark:hover:text-indigo-300 dark:focus:ring-offset-zinc-900"
      >
        ?
      </button>
      <span className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-72 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-xl group-hover:block group-focus-within:block dark:border-zinc-700 dark:bg-zinc-950">
        <span className="block font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-gray-600 dark:text-zinc-300">{description}</span>
      </span>
    </span>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value: number | null | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ema(values: number[], period: number) {
  if (values.length === 0) return 0;
  const multiplier = 2 / (period + 1);
  return values.reduce((current, value, index) => {
    if (index === 0) return value;
    return (value - current) * multiplier + current;
  }, values[0]);
}

function getAverageMovePct(candles: Candle[], price: number) {
  const recent = candles.slice(-14);
  const ranges = recent.map((candle) => candle.high - candle.low).filter((range) => range > 0);
  if (price <= 0) return 0;
  return (average(ranges) / price) * 100;
}

function getTrendScore(candles: Candle[], price: number) {
  const closes = candles.map((candle) => candle.close).filter((close) => close > 0);
  if (closes.length === 0) return 10;

  const ema20 = ema(closes.slice(-40), 20);
  const ema50 = ema(closes.slice(-80), 50);
  const recentHigh = Math.max(...candles.slice(-20).map((candle) => candle.high));
  let score = 8;

  if (price >= ema20) score += 5;
  if (price >= ema50) score += 5;
  if (price >= recentHigh * 0.98) score += 4;
  if (closes.at(-1) && closes.at(-5) && closes.at(-1)! > closes.at(-5)!) score += 3;

  return clamp(score, 0, 20);
}

function getVolumeScore(candles: Candle[], quoteVolume: number) {
  const recentVolumes = candles.slice(-20).map((candle) => candle.volume).filter((volume) => volume > 0);
  const avgVolume = average(recentVolumes);
  if (avgVolume <= 0 || quoteVolume <= 0) return 10;

  const ratio = quoteVolume / avgVolume;
  if (ratio >= 2) return 20;
  if (ratio >= 1.5) return 17;
  if (ratio >= 1) return 14;
  if (ratio >= 0.7) return 10;
  return 7;
}

function getSetupScore(setup: SetupRow | undefined, price: number, entry: number) {
  if (setup) return clamp(Math.round(setup.score / 5), 8, 20);

  const distancePct = entry > 0 ? ((entry - price) / entry) * 100 : 5;
  if (distancePct <= 0.5) return 18;
  if (distancePct <= 1.5) return 15;
  if (distancePct <= 3) return 11;
  return 8;
}

function getCatalystScore(earning: EarningsEvent | undefined, setup: SetupRow | undefined) {
  if (earning?.daysOut !== undefined && earning.daysOut <= 7) return 18;
  if (earning?.daysOut !== undefined && earning.daysOut <= 14) return 16;
  if (setup?.catalyst) return 15;
  if (earning) return 13;
  return 10;
}

function getBestCall(chain: OptionsChainResponse | null, price: number) {
  if (!chain) return null;
  const now = Date.now();
  const minExpiration = now + 21 * 24 * 60 * 60 * 1000;
  const maxExpiration = now + 75 * 24 * 60 * 60 * 1000;

  return chain.contracts
    .filter((contract) => {
      const expirationTime = new Date(contract.expiration).getTime();
      return contract.type === 'call'
        && expirationTime >= minExpiration
        && expirationTime <= maxExpiration
        && contract.mid > 0
        && contract.strike >= price * 0.97
        && contract.strike <= price * 1.12;
    })
    .sort((a, b) => {
      const deltaA = Math.abs(safeNumber(a.delta, 0.5) - 0.55);
      const deltaB = Math.abs(safeNumber(b.delta, 0.5) - 0.55);
      const liquidityA = a.openInterest + a.volume;
      const liquidityB = b.openInterest + b.volume;
      return deltaA - deltaB || liquidityB - liquidityA;
    })[0] ?? null;
}

function getOptionLiquidityScore(contract: OptionContract | null) {
  if (!contract) return 0;
  const spreadPct = contract.mid > 0 ? Math.max(contract.ask - contract.bid, 0) / contract.mid : 1;
  const activity = contract.openInterest + contract.volume;
  let score = 6;

  if (activity >= 1000) score += 7;
  else if (activity >= 300) score += 5;
  else if (activity >= 100) score += 3;

  if (spreadPct <= 0.08) score += 6;
  else if (spreadPct <= 0.15) score += 4;
  else if (spreadPct <= 0.25) score += 2;

  return clamp(score, 0, 20);
}

function buildLiveCandidate(
  symbol: string,
  quote: QuoteResponse,
  candles: Candle[],
  chain: OptionsChainResponse | null,
  earning: EarningsEvent | undefined,
  setup: SetupRow | undefined,
): Candidate {
  const fallback = FALLBACK_BY_SYMBOL.get(symbol);
  const price = safeNumber(quote.price, fallback?.price ?? 0);
  const recentCandles = candles.filter((candle) => candle.close > 0);
  const recentHigh = recentCandles.length > 0
    ? Math.max(...recentCandles.slice(-20).map((candle) => candle.high))
    : price * 1.02;
  const avgMovePct = getAverageMovePct(recentCandles, price) || fallback?.avgMovePct || 4;
  const riskWidth = Math.max(price * (avgMovePct / 100) * 0.7, price * 0.025, 0.05);
  const entry = setup?.entry && setup.entry > 0
    ? setup.entry
    : Math.max(price * 1.004, recentHigh * 1.001);
  const stop = setup?.stop && setup.stop > 0
    ? Math.min(setup.stop, entry - 0.01)
    : Math.max(entry - riskWidth, entry * 0.88);
  const target1 = setup?.target && setup.target > entry
    ? setup.target
    : entry + (entry - stop) * 2;
  const target2 = entry + (entry - stop) * 3;
  const bestCall = getBestCall(chain, price);
  const catalyst = setup?.catalystDetail
    || setup?.catalyst
    || (earning ? `${earning.strategy} before ${earning.reportDate}` : fallback?.catalyst)
    || 'Live momentum and options scan';
  const note = setup?.reason
    || (earning ? `${earning.urgency} earnings setup with expected move near ${earning.expectedMove}%.` : fallback?.note)
    || 'Live quote, trend, volume, and options chain are driving this ranking.';

  return {
    symbol,
    name: setup?.company || earning?.name || fallback?.name || symbol,
    price,
    entry,
    stop,
    target1,
    target2,
    avgMovePct,
    volumeScore: getVolumeScore(recentCandles, quote.volume),
    trendScore: getTrendScore(recentCandles, price),
    catalystScore: getCatalystScore(earning, setup),
    setupScore: getSetupScore(setup, price, entry),
    ivRank: earning?.ivRank ?? clamp(Math.round((bestCall?.impliedVolatility ?? 0.45) * 100), 20, 95),
    optionPremium: bestCall?.mid ?? fallback?.optionPremium ?? Math.max(price * 0.035, 0.1),
    optionDelta: Math.abs(safeNumber(bestCall?.delta, fallback?.optionDelta ?? 0.5)),
    optionLiquidity: getOptionLiquidityScore(bestCall) || fallback?.optionLiquidity || 8,
    largeCap: LARGE_CAP_SYMBOLS.has(symbol),
    catalyst,
    note,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
  return response.json() as Promise<T>;
}

async function loadLiveCandidate(
  symbol: string,
  earningsBySymbol: Map<string, EarningsEvent>,
  setupsBySymbol: Map<string, SetupRow>,
) {
  const [quote, candleResponse, chain] = await Promise.all([
    fetchJson<QuoteResponse>(`/api/market/quote?symbol=${symbol}`),
    fetchJson<CandleResponse>(`/api/market/candles?symbol=${symbol}&range=compact`),
    fetchJson<OptionsChainResponse>(`/api/options/chain?symbol=${symbol}`).catch(() => null),
  ]);

  return buildLiveCandidate(
    symbol,
    quote,
    candleResponse.candles,
    chain,
    earningsBySymbol.get(symbol),
    setupsBySymbol.get(symbol),
  );
}

function getTradePnl(trade: Trade) {
  return typeof trade.pnl === 'number' && Number.isFinite(trade.pnl) ? trade.pnl : 0;
}

function getTradeExitTime(trade: Trade) {
  return new Date(trade.exitDate || trade.updatedAt || trade.createdAt || trade.entryDate).getTime();
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function buildSymbolProgress(trades: Trade[]) {
  const bySymbol = new Map<string, { symbol: string; trades: number; pnl: number }>();

  trades.forEach((trade) => {
    const current = bySymbol.get(trade.symbol) ?? { symbol: trade.symbol, trades: 0, pnl: 0 };
    current.trades += 1;
    current.pnl += getTradePnl(trade);
    bySymbol.set(trade.symbol, current);
  });

  return Array.from(bySymbol.values()).sort((a, b) => b.pnl - a.pnl).slice(0, 3);
}

function scoreCandidate(candidate: Candidate, horizon: Horizon) {
  const breakoutDistancePct = ((candidate.entry - candidate.price) / candidate.entry) * 100;
  const proximityScore = breakoutDistancePct <= 0
    ? 16
    : breakoutDistancePct <= 1
      ? 14
      : breakoutDistancePct <= 2
        ? 10
        : 5;

  const moveScore = candidate.avgMovePct >= 8
    ? 18
    : candidate.avgMovePct >= 6
      ? 15
      : candidate.avgMovePct >= 4
        ? 11
        : 7;

  const liquidityBonus = candidate.largeCap ? 5 : 2;
  const horizonBias = horizon === 'daily'
    ? (candidate.avgMovePct >= 6 ? 4 : 1)
    : (candidate.trendScore >= 16 ? 4 : 1);

  return clamp(
    candidate.trendScore +
    candidate.volumeScore +
    candidate.catalystScore +
    candidate.setupScore +
    proximityScore +
    moveScore +
    liquidityBonus +
    horizonBias,
    0,
    100,
  );
}

function chooseInstrument(
  candidate: Candidate,
  optionContracts: number,
  optionCapital: number,
  maxCapital: number,
): Instrument {
  const optionEligible =
    candidate.optionLiquidity >= 12 &&
    candidate.ivRank <= 65 &&
    candidate.avgMovePct >= 5.5 &&
    optionContracts >= 1 &&
    optionCapital <= maxCapital;

  if (optionEligible) return 'option';
  return 'stock';
}

export default function TradingGoalPage() {
  const [accountSize, setAccountSize] = useState(25000);
  const [riskPct, setRiskPct] = useState(1);
  const [capitalPct, setCapitalPct] = useState(25);
  const [goalDays, setGoalDays] = useState(100);
  const [horizon, setHorizon] = useState<Horizon>('swing');
  const [candidates, setCandidates] = useState<Candidate[]>(FALLBACK_CANDIDATES);
  const [isLoadingMarketData, setIsLoadingMarketData] = useState(true);
  const [dataSource, setDataSource] = useState<DataSource>('fallback');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [marketDataError, setMarketDataError] = useState('');
  const [tradeLog, setTradeLog] = useState<Trade[]>([]);
  const [isLoadingTrades, setIsLoadingTrades] = useState(true);
  const [tradeLogError, setTradeLogError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadMarketData() {
      setIsLoadingMarketData(true);
      setMarketDataError('');

      try {
        const [earningsResult, setupsResult] = await Promise.allSettled([
          fetchJson<EarningsResponse>('/api/market/earnings?days=45'),
          fetchJson<SetupsResponse>('/api/market/setups'),
        ]);
        const earnings = earningsResult.status === 'fulfilled' ? earningsResult.value.events : [];
        const setups = setupsResult.status === 'fulfilled' ? setupsResult.value.setups : [];
        const earningsBySymbol = new Map(earnings.map((event) => [event.symbol, event]));
        const setupsBySymbol = new Map(setups.map((setup) => [setup.symbol, setup]));
        const results = await Promise.allSettled(
          CORE_SYMBOLS.map((symbol) => loadLiveCandidate(symbol, earningsBySymbol, setupsBySymbol)),
        );
        const liveCandidates = results
          .filter((result): result is PromiseFulfilledResult<Candidate> => result.status === 'fulfilled')
          .map((result) => result.value);
        const liveSymbols = new Set(liveCandidates.map((candidate) => candidate.symbol));
        const fallbackCandidates = FALLBACK_CANDIDATES.filter((candidate) => !liveSymbols.has(candidate.symbol));
        const nextCandidates = [...liveCandidates, ...fallbackCandidates];

        if (!cancelled) {
          setCandidates(nextCandidates);
          setDataSource(liveCandidates.length === CORE_SYMBOLS.length ? 'live' : liveCandidates.length > 0 ? 'mixed' : 'fallback');
          setLastUpdated(new Date());
          if (liveCandidates.length === 0) {
            setMarketDataError('Live market data is unavailable, so fallback planning values are showing.');
          }
        }
      } catch (error) {
        if (!cancelled) {
          setCandidates(FALLBACK_CANDIDATES);
          setDataSource('fallback');
          setMarketDataError(error instanceof Error ? error.message : 'Live market data is unavailable.');
        }
      } finally {
        if (!cancelled) setIsLoadingMarketData(false);
      }
    }

    loadMarketData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTradeProgress() {
      setIsLoadingTrades(true);
      setTradeLogError('');

      try {
        const response = await fetchJson<TradesResponse>('/api/trades?limit=500');
        if (!response.success) throw new Error(response.error || 'Unable to load trades.');
        if (!cancelled) setTradeLog(response.data ?? []);
      } catch (error) {
        if (!cancelled) {
          setTradeLog([]);
          setTradeLogError(error instanceof Error ? error.message : 'Unable to load trades.');
        }
      } finally {
        if (!cancelled) setIsLoadingTrades(false);
      }
    }

    loadTradeProgress();

    return () => {
      cancelled = true;
    };
  }, []);

  const riskBudget = accountSize * (riskPct / 100);
  const maxCapitalPerTrade = accountSize * (capitalPct / 100);

  const tradeProgress = useMemo(() => {
    const closedTrades = tradeLog.filter((trade) => trade.status === 'closed' && typeof trade.pnl === 'number');
    const openTrades = tradeLog.filter((trade) => trade.status === 'open');
    const totalRealizedPnl = closedTrades.reduce((sum, trade) => sum + getTradePnl(trade), 0);
    const wins = closedTrades.filter((trade) => getTradePnl(trade) > 0);
    const losses = closedTrades.filter((trade) => getTradePnl(trade) < 0);
    const todayStart = startOfLocalDay(new Date());
    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
    const todayPnl = closedTrades
      .filter((trade) => getTradeExitTime(trade) >= todayStart)
      .reduce((sum, trade) => sum + getTradePnl(trade), 0);
    const weekPnl = closedTrades
      .filter((trade) => getTradeExitTime(trade) >= weekStart)
      .reduce((sum, trade) => sum + getTradePnl(trade), 0);
    const firstTradeTime = closedTrades.length > 0
      ? Math.min(...closedTrades.map((trade) => getTradeExitTime(trade)).filter(Number.isFinite))
      : Date.now();
    const daysUsed = closedTrades.length > 0
      ? Math.max(1, Math.ceil((Date.now() - firstTradeTime) / (24 * 60 * 60 * 1000)))
      : 0;
    const daysRemaining = Math.max(goalDays - daysUsed, 0);
    const remainingGoal = MILLION_DOLLAR_GOAL - totalRealizedPnl;
    const requiredDaily = remainingGoal > 0 ? remainingGoal / Math.max(daysRemaining, 1) : 0;

    return {
      closedTrades,
      openTrades,
      totalRealizedPnl,
      remainingGoal,
      progressPct: clamp((totalRealizedPnl / MILLION_DOLLAR_GOAL) * 100, 0, 100),
      winRate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
      avgTradePnl: closedTrades.length > 0 ? totalRealizedPnl / closedTrades.length : 0,
      todayPnl,
      weekPnl,
      daysUsed,
      daysRemaining,
      requiredDaily,
      topSymbols: buildSymbolProgress(closedTrades),
      wins: wins.length,
      losses: losses.length,
    };
  }, [goalDays, tradeLog]);

  const rankedTrades = useMemo<RankedTrade[]>(() => {
    return candidates.map((candidate) => {
      const score = scoreCandidate(candidate, horizon);
      const stockRiskPerShare = Math.max(candidate.entry - candidate.stop, 0.01);
      const stockQtyByRisk = Math.floor(riskBudget / stockRiskPerShare);
      const stockQtyByCapital = Math.floor(maxCapitalPerTrade / candidate.entry);
      const stockQty = Math.max(0, Math.min(stockQtyByRisk, stockQtyByCapital));

      const optionRiskPerContract = candidate.optionPremium * 100;
      const optionContractsByRisk = Math.floor(riskBudget / optionRiskPerContract);
      const optionContractsByCapital = Math.floor(maxCapitalPerTrade / optionRiskPerContract);
      const optionContracts = Math.max(0, Math.min(optionContractsByRisk, optionContractsByCapital));
      const optionCapital = optionContracts * optionRiskPerContract;

      const instrument = chooseInstrument(candidate, optionContracts, optionCapital, maxCapitalPerTrade);

      const quantity = instrument === 'option' ? optionContracts : stockQty;
      const capitalRequired = instrument === 'option'
        ? quantity * optionRiskPerContract
        : quantity * candidate.entry;
      const riskAtStop = instrument === 'option'
        ? quantity * optionRiskPerContract
        : quantity * stockRiskPerShare;

      const profitGoal1 = instrument === 'option'
        ? quantity * candidate.optionDelta * (candidate.target1 - candidate.entry) * 100
        : quantity * (candidate.target1 - candidate.entry);
      const profitGoal2 = instrument === 'option'
        ? quantity * candidate.optionDelta * (candidate.target2 - candidate.entry) * 100
        : quantity * (candidate.target2 - candidate.entry);

      const rr1 = riskAtStop > 0 ? profitGoal1 / riskAtStop : 0;
      const rr2 = riskAtStop > 0 ? profitGoal2 / riskAtStop : 0;
      const thesis = instrument === 'option'
        ? `Buy calls only on a confirmed breakout. The option route wins here because the name has enough move potential and a liquid chain.`
        : `Buy stock on a clean trigger. The stock route wins here because it keeps risk simpler or the option chain is less attractive.`;

      return {
        symbol: candidate.symbol,
        name: candidate.name,
        instrument,
        score,
        entry: candidate.entry,
        stop: candidate.stop,
        target1: candidate.target1,
        target2: candidate.target2,
        quantity,
        capitalRequired,
        riskAtStop,
        profitGoal1,
        profitGoal2,
        rr1,
        rr2,
        catalyst: candidate.catalyst,
        thesis,
        note: candidate.note,
      };
    })
      .filter((trade) => trade.quantity > 0)
      .sort((a, b) => b.score - a.score);
  }, [candidates, horizon, maxCapitalPerTrade, riskBudget]);

  const bestTrade = rankedTrades[0] ?? null;
  const dailyGoal = goalDays > 0 ? MILLION_DOLLAR_GOAL / goalDays : 0;
  const weeklyGoal = dailyGoal * 5;
  const dataStatusLabel = isLoadingMarketData
    ? 'Loading live data'
    : dataSource === 'live'
      ? 'Live data'
      : dataSource === 'mixed'
        ? 'Partial live data'
        : 'Fallback data';

  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <Layout title="$1M Goal">
        <div className="space-y-8">
          <section className="flex flex-col gap-3">
            <p className="flex items-center text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-500">
              Trading / Mission Plan
              <SectionTooltip
                label="missionPlan"
                description="High-level goal context, live data status, goal pace, and the active risk budget for the page."
              />
            </p>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-2">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">$1M Goal Planner</h1>
                <p className="text-sm leading-6 text-gray-600 dark:text-zinc-300">
                  This page ranks live high-beta stocks and large-cap movers, decides whether the cleaner trade is stock or options,
                  and sizes the position from your risk budget instead of emotion.
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-zinc-500">
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${
                    dataSource === 'live'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                      : dataSource === 'mixed'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                        : 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}>
                    {dataStatusLabel}
                  </span>
                  {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
                  {marketDataError && <span>{marketDataError}</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Goal Horizon</p>
                <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{goalDays}d</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Daily Pace</p>
                <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{formatMoney(dailyGoal)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Weekly Pace</p>
                <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{formatMoney(weeklyGoal)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Risk Budget</p>
                <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(riskBudget)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">
                Trade Log Progress
                <SectionTooltip
                  label="tradeLogProgress"
                  description="Reads your closed trades from the Trades page and turns realized P/L into $1M goal progress, pace, win rate, and open-trade context."
                />
              </p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {formatMoney(tradeProgress.totalRealizedPnl)} tracked toward $1M
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-zinc-300">
                {isLoadingTrades
                  ? 'Loading trade log progress...'
                  : tradeLogError
                    ? tradeLogError
                    : `${tradeProgress.closedTrades.length} closed trades and ${tradeProgress.openTrades.length} open trades found in your trade log.`}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-zinc-500">Remaining</p>
              <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
                {formatMoney(Math.max(tradeProgress.remainingGoal, 0))}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${tradeProgress.progressPct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-zinc-500">
              <span>{tradeProgress.progressPct.toFixed(2)}% complete</span>
              <span>{tradeProgress.daysUsed} days used / {tradeProgress.daysRemaining} left</span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Today P/L</p>
              <p className={`mt-1 text-lg font-semibold ${tradeProgress.todayPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatMoney(tradeProgress.todayPnl)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">7-Day P/L</p>
              <p className={`mt-1 text-lg font-semibold ${tradeProgress.weekPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatMoney(tradeProgress.weekPnl)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Needed / Day</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{formatMoney(tradeProgress.requiredDaily)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Win Rate</p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{tradeProgress.winRate.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Avg Closed</p>
              <p className={`mt-1 text-lg font-semibold ${tradeProgress.avgTradePnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatMoney(tradeProgress.avgTradePnl)}
              </p>
            </div>
          </div>

          {tradeProgress.topSymbols.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-600 dark:text-zinc-300">
              {tradeProgress.topSymbols.map((symbol) => (
                <span key={symbol.symbol} className="rounded-full border border-gray-200 px-3 py-1 dark:border-zinc-800">
                  {symbol.symbol}: {formatMoney(symbol.pnl)} across {symbol.trades} trades
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">
                  Best Trade Right Now
                  <SectionTooltip
                    label="bestTrade"
                    description="The top-ranked symbol after the algorithm compares trend, volume, catalyst, setup quality, risk, and options liquidity."
                  />
                </p>
                <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                  {bestTrade ? `${bestTrade.symbol} ${bestTrade.instrument === 'option' ? 'calls' : 'stock'}` : 'No valid trade'}
                </h2>
              </div>
              {bestTrade && (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                  Score {bestTrade.score}
                </span>
              )}
            </div>

            {bestTrade ? (
              <div className="mt-5 space-y-5">
                <p className="text-sm leading-6 text-gray-600 dark:text-zinc-300">{bestTrade.thesis}</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Entry</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{formatMoney(bestTrade.entry)}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Stop</p>
                    <p className="mt-1 text-lg font-semibold text-red-600 dark:text-red-400">{formatMoney(bestTrade.stop)}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Target 1</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(bestTrade.target1)}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Target 2</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(bestTrade.target2)}</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Quantity</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                      {bestTrade.quantity} {bestTrade.instrument === 'option' ? 'contracts' : 'shares'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Capital</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{formatMoney(bestTrade.capitalRequired)}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Profit Goal 1</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(bestTrade.profitGoal1)}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-zinc-800">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-zinc-500">Profit Goal 2</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(bestTrade.profitGoal2)}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                  <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">Trigger and discipline</p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-indigo-900/85 dark:text-indigo-100/85">
                    <li>Buy only if price confirms through entry with volume, not while it is still drifting below resistance.</li>
                    <li>Exit partials at target 1, then trail the rest only if momentum holds.</li>
                    <li>Take the stop exactly as planned if price loses the invalidation level.</li>
                  </ul>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-600 dark:text-zinc-300">
                No trade fits the current risk settings. Increase account size, loosen capital allocation, or lower per-trade risk.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">
              Algorithm Inputs
              <SectionTooltip
                label="algorithmInputs"
                description="Controls for account size, risk, capital allocation, time horizon, and daily-versus-swing ranking bias."
              />
            </p>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400 mb-2">Account size</span>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={accountSize}
                  onChange={(event) => setAccountSize(Number(event.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400 mb-2">Risk per trade (%)</span>
                <input
                  type="number"
                  min={0.25}
                  max={5}
                  step={0.25}
                  value={riskPct}
                  onChange={(event) => setRiskPct(Number(event.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400 mb-2">Max capital allocation (%)</span>
                <input
                  type="number"
                  min={5}
                  max={100}
                  step={5}
                  value={capitalPct}
                  onChange={(event) => setCapitalPct(Number(event.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400 mb-2">Goal horizon (days)</span>
                <input
                  type="number"
                  min={20}
                  max={260}
                  step={5}
                  value={goalDays}
                  onChange={(event) => setGoalDays(Number(event.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                />
              </label>
              <div>
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-400 mb-2">Bias</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(['daily', 'swing'] as Horizon[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setHorizon(value)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        horizon === value
                          ? 'border-indigo-500 bg-indigo-600 text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200'
                      }`}
                    >
                      {value === 'daily' ? 'Daily momentum' : 'Swing setups'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-zinc-800">
            <h2 className="flex items-center text-lg font-semibold text-gray-900 dark:text-white">
              Ranked opportunities
              <SectionTooltip
                label="rankedOpportunities"
                description="A sortable-style readout of candidates with instrument choice, trigger, stop, target, quantity, risk, profit goal, and score."
              />
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-zinc-300">
              The algorithm ranks each candidate on trend, momentum, catalyst quality, move potential, and trade structure.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-zinc-950/60">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-zinc-500">
                  <th className="px-5 py-3">Symbol</th>
                  <th className="px-5 py-3">Instrument</th>
                  <th className="px-5 py-3">Entry</th>
                  <th className="px-5 py-3">Stop</th>
                  <th className="px-5 py-3">Target 1</th>
                  <th className="px-5 py-3">Qty</th>
                  <th className="px-5 py-3">Risk</th>
                  <th className="px-5 py-3">P1</th>
                  <th className="px-5 py-3">Score</th>
                </tr>
              </thead>
              <tbody>
                {rankedTrades.map((trade) => (
                  <tr key={trade.symbol} className="border-t border-gray-200 dark:border-zinc-800">
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{trade.symbol}</p>
                        <p className="text-xs text-gray-500 dark:text-zinc-500">{trade.name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        trade.instrument === 'option'
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                          : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'
                      }`}>
                        {trade.instrument === 'option' ? 'Call option' : 'Stock'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-900 dark:text-white">{formatMoney(trade.entry)}</td>
                    <td className="px-5 py-4 text-red-600 dark:text-red-400">{formatMoney(trade.stop)}</td>
                    <td className="px-5 py-4 text-emerald-600 dark:text-emerald-400">{formatMoney(trade.target1)}</td>
                    <td className="px-5 py-4 text-gray-900 dark:text-white">{trade.quantity}</td>
                    <td className="px-5 py-4 text-gray-900 dark:text-white">{formatMoney(trade.riskAtStop)}</td>
                    <td className="px-5 py-4 text-emerald-600 dark:text-emerald-400">{formatMoney(trade.profitGoal1)}</td>
                    <td className="px-5 py-4">
                      <span className="font-semibold text-gray-900 dark:text-white">{trade.score}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">
              How it decides
              <SectionTooltip
                label="decisionLogic"
                description="The rules that choose between stock and options, then size the trade from risk first and capital second."
              />
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-600 dark:text-zinc-300">
              <li>Prefers options when move potential is high, implied volatility is not extreme, and the chain is liquid.</li>
              <li>Defaults to stock when the setup is clean but option pricing or liquidity is less attractive.</li>
              <li>Sizes everything from your risk budget first, then caps by maximum capital allocation.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">
              Daily review
              <SectionTooltip
                label="dailyReview"
                description="The day-trading checklist for confirming breakouts, volume, fresh catalysts, and whether the setup is still chaseable."
              />
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-600 dark:text-zinc-300">
              <li>Check for bullish breakouts, unusual volume, and earnings within the next 10 trading days.</li>
              <li>Only act when the trigger is live. If price never confirms, it is a pass.</li>
              <li>Review whether the best-ranked setup still has room after the open instead of chasing extension.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">
              Weekly review
              <SectionTooltip
                label="weeklyReview"
                description="The discipline loop for comparing planned trades with actual trades, then adjusting the watchlist based on what worked."
              />
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-600 dark:text-zinc-300">
              <li>Compare planned trades versus executed trades and note where discipline slipped.</li>
              <li>Promote symbols that respected triggers and demote names that produced failed breakouts.</li>
              <li>Keep capital concentrated in the setups with the clearest catalyst, volume, and reward-to-risk.</li>
            </ul>
          </div>
        </section>

        {bestTrade && (
          <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">
              Current rationale
              <SectionTooltip
                label="currentRationale"
                description="A plain-English explanation of why the leading setup is ranked first and how its reward-to-risk profile looks."
              />
            </p>
            <div className="mt-3 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{bestTrade.symbol} setup note</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-zinc-300">{bestTrade.note}</p>
                <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-zinc-300">
                  Catalyst: <span className="font-medium text-gray-900 dark:text-white">{bestTrade.catalyst}</span>
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 p-4 dark:border-zinc-800">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Risk / reward profile</p>
                <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-zinc-300">
                  <div className="flex items-center justify-between">
                    <span>R:R to target 1</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{bestTrade.rr1.toFixed(2)}R</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>R:R to target 2</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{bestTrade.rr2.toFixed(2)}R</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Capital required</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(bestTrade.capitalRequired)}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
