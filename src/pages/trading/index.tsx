import React, { useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';

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

const CANDIDATES: Candidate[] = [
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

function formatMoney(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

  const riskBudget = accountSize * (riskPct / 100);
  const maxCapitalPerTrade = accountSize * (capitalPct / 100);

  const rankedTrades = useMemo<RankedTrade[]>(() => {
    return CANDIDATES.map((candidate) => {
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
  }, [capitalPct, horizon, maxCapitalPerTrade, riskBudget]);

  const bestTrade = rankedTrades[0] ?? null;
  const dailyGoal = goalDays > 0 ? 1000000 / goalDays : 0;
  const weeklyGoal = dailyGoal * 5;

  return (
    <Layout title="$1M Goal">
      <div className="space-y-8">
        <section className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-zinc-500">Trading / Mission Plan</p>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-2">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">$1M Goal Planner</h1>
              <p className="text-sm leading-6 text-gray-600 dark:text-zinc-300">
                This page ranks high-beta stocks and large-cap movers, decides whether the cleaner trade is stock or options,
                and sizes the position from your risk budget instead of emotion.
              </p>
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

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">Best Trade Right Now</p>
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
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">Algorithm Inputs</p>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700 dark:text-zinc-200">Account size</span>
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
                <span className="text-sm font-medium text-gray-700 dark:text-zinc-200">Risk per trade (%)</span>
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
                <span className="text-sm font-medium text-gray-700 dark:text-zinc-200">Max capital allocation (%)</span>
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
                <span className="text-sm font-medium text-gray-700 dark:text-zinc-200">Goal horizon (days)</span>
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
                <span className="text-sm font-medium text-gray-700 dark:text-zinc-200">Bias</span>
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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ranked opportunities</h2>
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
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">How it decides</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-600 dark:text-zinc-300">
              <li>Prefers options when move potential is high, implied volatility is not extreme, and the chain is liquid.</li>
              <li>Defaults to stock when the setup is clean but option pricing or liquidity is less attractive.</li>
              <li>Sizes everything from your risk budget first, then caps by maximum capital allocation.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">Daily review</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-600 dark:text-zinc-300">
              <li>Check for bullish breakouts, unusual volume, and earnings within the next 10 trading days.</li>
              <li>Only act when the trigger is live. If price never confirms, it is a pass.</li>
              <li>Review whether the best-ranked setup still has room after the open instead of chasing extension.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">Weekly review</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-gray-600 dark:text-zinc-300">
              <li>Compare planned trades versus executed trades and note where discipline slipped.</li>
              <li>Promote symbols that respected triggers and demote names that produced failed breakouts.</li>
              <li>Keep capital concentrated in the setups with the clearest catalyst, volume, and reward-to-risk.</li>
            </ul>
          </div>
        </section>

        {bestTrade && (
          <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-500">Current rationale</p>
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
  );
}
