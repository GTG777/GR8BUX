import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import type { ApiResponse } from '@/types';
import type { TradingAgentDashboard, TradingAgentReview, TradingAgentSignal } from '@/types/tradingAgent';

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function statusColor(action: TradingAgentSignal['action']) {
  if (action === 'BUY') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
  if (action === 'SELL') return 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300';
  if (action === 'AVOID') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300';
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function ReviewPanel({ review }: { review: TradingAgentReview }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Daily Retrospective</h2>
          <p className="text-xs text-muted-foreground">Review for {review.reviewForDate}</p>
        </div>
        <span className="rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
          Grade {review.grade}
        </span>
      </div>
      <div className="px-4 py-3 space-y-4">
        <p className="text-sm text-muted-foreground">{review.summary}</p>
        <div className="grid gap-4 md:grid-cols-3">
          <ListBlock title="Right" items={review.whatWentRight} />
          <ListBlock title="Wrong" items={review.whatWentWrong} />
          <ListBlock title="Improve" items={review.improvements} />
        </div>
      </div>
    </section>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="text-sm text-foreground">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TradingAgentPage() {
  const [dashboard, setDashboard] = useState<TradingAgentDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningReview, setRunningReview] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/agent/dashboard');
      const json = (await res.json()) as ApiResponse<TradingAgentDashboard>;
      if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? 'Failed to load agent');
      setDashboard(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  };

  const runReview = async () => {
    setRunningReview(true);
    setError('');
    try {
      const res = await fetch('/api/agent/review-yesterday', { method: 'POST' });
      const json = (await res.json()) as ApiResponse<TradingAgentReview>;
      if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? 'Review failed');
      setDashboard((prev) => (prev ? { ...prev, latestReview: json.data as TradingAgentReview } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setRunningReview(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const actionableSignals = useMemo(
    () => dashboard?.signals.filter((signal) => signal.action === 'BUY' || signal.action === 'SELL') ?? [],
    [dashboard],
  );

  return (
    <Layout title="AI Trading Agent">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Trading Agent</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Paper-first signal engine using GR8BUX rules, Massive market data, and a next-day review loop.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadDashboard}
              disabled={loading}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={runReview}
              disabled={runningReview || !dashboard}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {runningReview ? 'Reviewing...' : 'Run Review'}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </div>
        )}

        {loading && !dashboard ? (
          <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Loading agent dashboard...
          </div>
        ) : dashboard ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Stat label="Mode" value={dashboard.mode.replace('_', ' ')} detail="Signals only until broker is connected" />
              <Stat label="Paper Equity" value={money(dashboard.paperEquity)} detail={`${money(dashboard.dayPnl)} day P/L`} />
              <Stat label="Signals" value={String(actionableSignals.length)} detail={`${dashboard.signals.length} symbols evaluated`} />
              <Stat label="Data" value={dashboard.dataStatus === 'massive_live' ? 'Massive' : 'Fallback'} detail={dashboard.brokerStatus.replace('_', ' ')} />
              <Stat label="Next Review" value={new Date(dashboard.nextReviewAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} detail="Daily at 1:00 PM Central" />
            </div>

            {dashboard.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Agent warnings</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {dashboard.warnings.map((warning) => (
                    <span key={warning} className="rounded-md bg-white px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                      {warning}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <section className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Buy / Sell Signals</h2>
                  <p className="text-xs text-muted-foreground">Generated {new Date(dashboard.fetchedAt).toLocaleString()}</p>
                </div>
                <span className="text-xs text-muted-foreground">Manual approval required</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Symbol</th>
                      <th className="px-4 py-2 text-left font-medium">Action</th>
                      <th className="px-4 py-2 text-right font-medium">Confidence</th>
                      <th className="px-4 py-2 text-right font-medium">Entry</th>
                      <th className="px-4 py-2 text-right font-medium">Stop</th>
                      <th className="px-4 py-2 text-right font-medium">Target</th>
                      <th className="px-4 py-2 text-left font-medium">Thesis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {dashboard.signals.map((signal) => (
                      <tr key={signal.id} className="align-top">
                        <td className="px-4 py-3 font-semibold text-foreground">{signal.symbol}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusColor(signal.action)}`}>
                            {signal.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">{pct(signal.confidence)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{signal.entry ? money(signal.entry) : '-'}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{signal.stop ? money(signal.stop) : '-'}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{signal.target ? money(signal.target) : '-'}</td>
                        <td className="px-4 py-3 max-w-md">
                          <p className="text-foreground">{signal.thesis}</p>
                          {signal.riskFlags.length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">{signal.riskFlags[0]}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
              <section className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-foreground">Paper Positions</h2>
                  <p className="text-xs text-muted-foreground">Simulated until a paper broker adapter is connected</p>
                </div>
                <div className="divide-y divide-border">
                  {dashboard.positions.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-muted-foreground">No paper positions generated by current rules.</p>
                  ) : (
                    dashboard.positions.map((position) => (
                      <div key={position.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-foreground">{position.symbol}</p>
                          <p className={position.unrealizedPnl >= 0 ? 'text-sm font-semibold text-emerald-600' : 'text-sm font-semibold text-rose-600'}>
                            {money(position.unrealizedPnl)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {position.quantity} shares at {money(position.entryPrice)}. Mark {money(position.markPrice)}.
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <ReviewPanel review={dashboard.latestReview} />
            </div>

            <section className="rounded-lg border border-border bg-card px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Guardrails</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Risk / Trade" value={`${dashboard.rules.maxRiskPerTradePct}%`} />
                <Stat label="Daily Loss Limit" value={`${dashboard.rules.maxDailyLossPct}%`} />
                <Stat label="Max Positions" value={String(dashboard.rules.maxOpenPositions)} />
                <Stat label="Options" value={dashboard.rules.allowOptions ? 'Allowed' : 'Off'} />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </Layout>
  );
}
