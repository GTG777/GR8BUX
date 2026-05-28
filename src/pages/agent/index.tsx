import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { getSupabaseClient } from '@/lib/supabase';
import type { ApiResponse } from '@/types';
import type {
  TradingAgentDashboard,
  TradingAgentDashboardRequest,
  TradingAgentExecutionState,
  TradingAgentMode,
  TradingAgentPaperPosition,
  TradingAgentPersistedStatus,
  TradingAgentReview,
  TradingAgentSignal,
} from '@/types/tradingAgent';

const STORAGE_KEY = 'gr8bux_trading_agent_preferences_v1';

type AgentPreferencesForm = {
  accountSize: number;
  mode: TradingAgentMode;
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  requireManualApproval: boolean;
  allowOptions: boolean;
  watchlistText: string;
};

const DEFAULT_PREFERENCES: AgentPreferencesForm = {
  accountSize: 100000,
  mode: 'signals_only',
  maxRiskPerTradePct: 1,
  maxDailyLossPct: 3,
  maxOpenPositions: 5,
  requireManualApproval: true,
  allowOptions: false,
  watchlistText: 'SPY, QQQ, AAPL, MSFT, NVDA, AMD, TSLA',
};

const EMPTY_EXECUTION_STATE: TradingAgentExecutionState = {
  statuses: {},
  positions: [],
};

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function parseWatchlistText(watchlistText: string) {
  const symbols = watchlistText
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, ''))
    .filter(Boolean);
  return Array.from(new Set(symbols)).slice(0, 20);
}

function sanitizePreferences(form: AgentPreferencesForm): {
  form: AgentPreferencesForm;
  request: TradingAgentDashboardRequest;
} {
  const watchlist = parseWatchlistText(form.watchlistText);
  const nextForm: AgentPreferencesForm = {
    accountSize: clampNumber(form.accountSize, 1000, 10000000),
    mode: form.mode,
    maxRiskPerTradePct: clampNumber(form.maxRiskPerTradePct, 0.1, 10),
    maxDailyLossPct: clampNumber(form.maxDailyLossPct, 0.5, 20),
    maxOpenPositions: Math.round(clampNumber(form.maxOpenPositions, 1, 20)),
    requireManualApproval: form.requireManualApproval,
    allowOptions: form.allowOptions,
    watchlistText: watchlist.length ? watchlist.join(', ') : DEFAULT_PREFERENCES.watchlistText,
  };

  return {
    form: nextForm,
    request: {
      accountSize: nextForm.accountSize,
      mode: nextForm.mode,
      maxRiskPerTradePct: nextForm.maxRiskPerTradePct,
      maxDailyLossPct: nextForm.maxDailyLossPct,
      maxOpenPositions: nextForm.maxOpenPositions,
      requireManualApproval: nextForm.requireManualApproval,
      allowOptions: nextForm.allowOptions,
      watchlist: parseWatchlistText(nextForm.watchlistText),
    },
  };
}

function savePreferences(form: AgentPreferencesForm) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
}

function loadPreferences(): AgentPreferencesForm {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AgentPreferencesForm>;
    return sanitizePreferences({
      accountSize: typeof parsed.accountSize === 'number' ? parsed.accountSize : DEFAULT_PREFERENCES.accountSize,
      mode:
        parsed.mode === 'signals_only' || parsed.mode === 'manual_paper' || parsed.mode === 'auto_paper'
          ? parsed.mode
          : DEFAULT_PREFERENCES.mode,
      maxRiskPerTradePct:
        typeof parsed.maxRiskPerTradePct === 'number'
          ? parsed.maxRiskPerTradePct
          : DEFAULT_PREFERENCES.maxRiskPerTradePct,
      maxDailyLossPct:
        typeof parsed.maxDailyLossPct === 'number' ? parsed.maxDailyLossPct : DEFAULT_PREFERENCES.maxDailyLossPct,
      maxOpenPositions:
        typeof parsed.maxOpenPositions === 'number' ? parsed.maxOpenPositions : DEFAULT_PREFERENCES.maxOpenPositions,
      requireManualApproval:
        typeof parsed.requireManualApproval === 'boolean'
          ? parsed.requireManualApproval
          : DEFAULT_PREFERENCES.requireManualApproval,
      allowOptions: typeof parsed.allowOptions === 'boolean' ? parsed.allowOptions : DEFAULT_PREFERENCES.allowOptions,
      watchlistText:
        typeof parsed.watchlistText === 'string' && parsed.watchlistText.trim()
          ? parsed.watchlistText
          : DEFAULT_PREFERENCES.watchlistText,
    }).form;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

async function getAuthHeaders() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to persist agent state.');
  return { Authorization: `Bearer ${token}` };
}

function buildDashboardParams(request: TradingAgentDashboardRequest) {
  const params = new URLSearchParams();
  params.set('accountSize', String(request.accountSize));
  params.set('mode', request.mode ?? DEFAULT_PREFERENCES.mode);
  params.set('maxRiskPerTradePct', String(request.maxRiskPerTradePct));
  params.set('maxDailyLossPct', String(request.maxDailyLossPct));
  params.set('maxOpenPositions', String(request.maxOpenPositions));
  params.set('requireManualApproval', String(request.requireManualApproval));
  params.set('allowOptions', String(request.allowOptions));
  params.set('watchlist', request.watchlist?.join(',') ?? '');
  return params;
}

async function fetchDashboardData(request: TradingAgentDashboardRequest) {
  const res = await fetch(`/api/agent/dashboard?${buildDashboardParams(request).toString()}`);
  const json = (await res.json()) as ApiResponse<TradingAgentDashboard>;
  if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? 'Failed to load agent');
  return json.data;
}

async function fetchExecutionState() {
  const res = await fetch('/api/agent/execution', { headers: await getAuthHeaders() });
  const json = (await res.json()) as ApiResponse<TradingAgentExecutionState>;
  if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? 'Failed to load execution state');
  return json.data;
}

async function mutateExecutionState(body: Record<string, unknown>) {
  const res = await fetch('/api/agent/execution', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(await getAuthHeaders()),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as ApiResponse<TradingAgentExecutionState>;
  if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? 'Failed to update execution state');
  return json.data;
}

function statusColor(action: TradingAgentSignal['action']) {
  if (action === 'BUY') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/30 dark:text-emerald-200';
  if (action === 'SELL') return 'bg-rose-100 text-rose-800 dark:bg-rose-500/30 dark:text-rose-200';
  if (action === 'AVOID') return 'bg-amber-100 text-amber-800 dark:bg-amber-600 dark:text-white';
  return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200';
}

function executionStatusColor(status: TradingAgentSignal['status']) {
  if (status === 'paper_filled') return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/30 dark:text-indigo-200';
  if (status === 'approved') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/30 dark:text-emerald-200';
  if (status === 'rejected') return 'bg-rose-100 text-rose-800 dark:bg-rose-500/30 dark:text-rose-200';
  if (status === 'watching') return 'bg-amber-100 text-amber-800 dark:bg-amber-600 dark:text-white';
  return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200';
}

function executionLabel(status: TradingAgentSignal['status']) {
  if (status === 'paper_filled') return 'Paper Filled';
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  if (status === 'watching') return 'Watching';
  return 'New';
}

function calculateFillQuantity(signal: TradingAgentSignal) {
  if (!signal.entry || !signal.stop) return 0;
  const riskPerUnit = Math.max(0.01, Math.abs(signal.entry - signal.stop));
  return Math.max(1, Math.floor(signal.maxRiskDollars / riskPerUnit));
}

function buildMarkedPosition(
  fill: TradingAgentPaperPosition,
  signalBySymbol: Map<string, TradingAgentSignal>,
): TradingAgentPaperPosition {
  const latestSignal = signalBySymbol.get(fill.symbol);
  const markPrice = latestSignal?.marketPrice ?? fill.entryPrice;
  const unrealizedPnl =
    fill.side === 'long'
      ? parseFloat(((markPrice - fill.entryPrice) * fill.quantity).toFixed(2))
      : parseFloat(((fill.entryPrice - markPrice) * fill.quantity).toFixed(2));

  return {
    ...fill,
    markPrice,
    unrealizedPnl,
  };
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

function ReviewPanel({ review }: { review: TradingAgentReview }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Daily Retrospective</h2>
          <p className="text-xs text-muted-foreground">Review for {review.reviewForDate}</p>
        </div>
        <span className="rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
          Grade {review.grade}
        </span>
      </div>
      <div className="space-y-4 px-4 py-3">
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

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_280px] sm:items-start">
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </label>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
      />
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export default function TradingAgentPage() {
  const [dashboard, setDashboard] = useState<TradingAgentDashboard | null>(null);
  const [preferences, setPreferences] = useState<AgentPreferencesForm>(DEFAULT_PREFERENCES);
  const [executionState, setExecutionState] = useState<TradingAgentExecutionState>(EMPTY_EXECUTION_STATE);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [runningReview, setRunningReview] = useState(false);
  const [mutatingExecution, setMutatingExecution] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = async (nextPreferences = preferences) => {
    const sanitized = sanitizePreferences(nextPreferences);
    setPreferences(sanitized.form);
    savePreferences(sanitized.form);
    setLoading(true);
    setError('');

    try {
      const [nextDashboard, nextExecutionState] = await Promise.all([
        fetchDashboardData(sanitized.request),
        fetchExecutionState().catch(() => EMPTY_EXECUTION_STATE),
      ]);
      setDashboard(nextDashboard);
      setExecutionState(nextExecutionState);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  };

  const runReview = async () => {
    const sanitized = sanitizePreferences(preferences);
    setPreferences(sanitized.form);
    savePreferences(sanitized.form);
    setRunningReview(true);
    setError('');

    try {
      const res = await fetch('/api/agent/review-yesterday', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(await getAuthHeaders().catch(() => ({}))),
        },
        body: JSON.stringify(sanitized.request),
      });
      const json = (await res.json()) as ApiResponse<TradingAgentReview>;
      if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? 'Review failed');
      setDashboard((prev) => (prev ? { ...prev, latestReview: json.data as TradingAgentReview } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setRunningReview(false);
    }
  };

  const resetPreferences = () => {
    setPreferences(DEFAULT_PREFERENCES);
    void loadDashboard(DEFAULT_PREFERENCES);
  };

  useEffect(() => {
    const nextPreferences = loadPreferences();
    setPreferences(nextPreferences);
    setInitialized(true);
    void (async () => {
      const sanitized = sanitizePreferences(nextPreferences);
      setPreferences(sanitized.form);
      savePreferences(sanitized.form);
      setLoading(true);
      setError('');

      try {
        const [nextDashboard, nextExecutionState] = await Promise.all([
          fetchDashboardData(sanitized.request),
          fetchExecutionState().catch(() => EMPTY_EXECUTION_STATE),
        ]);
        setDashboard(nextDashboard);
        setExecutionState(nextExecutionState);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load agent');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const derived = useMemo(() => {
    if (!dashboard) {
      return {
        signals: [] as TradingAgentSignal[],
        positions: [] as TradingAgentPaperPosition[],
        paperEquity: 0,
        dayPnl: 0,
      };
    }

    const signalBySymbol = new Map(dashboard.signals.map((signal) => [signal.symbol, signal]));
    const signals = dashboard.signals.map((signal) => {
      const persistedStatus = executionState.statuses[signal.id];
      return persistedStatus ? { ...signal, status: persistedStatus } : signal;
    });

    const persistedPositions = executionState.positions.map((position) => buildMarkedPosition(position, signalBySymbol));
    const positions =
      persistedPositions.length > 0 || dashboard.mode !== 'auto_paper'
        ? persistedPositions
        : dashboard.positions;
    const dayPnl = positions.reduce((sum, position) => sum + position.unrealizedPnl, 0);

    return {
      signals,
      positions,
      dayPnl: parseFloat(dayPnl.toFixed(2)),
      paperEquity: parseFloat((dashboard.accountSize + dayPnl).toFixed(2)),
    };
  }, [dashboard, executionState]);

  const actionableSignals = useMemo(
    () => derived.signals.filter((signal) => signal.action === 'BUY' || signal.action === 'SELL'),
    [derived.signals],
  );

  const watchlistCount = useMemo(() => parseWatchlistText(preferences.watchlistText).length, [preferences.watchlistText]);
  const openPositionCount = derived.positions.length;
  const signalIdsWithFills = useMemo(
    () => new Set(executionState.positions.map((position) => position.signalId).filter(Boolean)),
    [executionState.positions],
  );

  const syncExecution = async (body: Record<string, unknown>) => {
    setMutatingExecution(true);
    setError('');
    try {
      const nextState = await mutateExecutionState(body);
      setExecutionState(nextState);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update execution state');
    } finally {
      setMutatingExecution(false);
    }
  };

  const approveSignal = (signal: TradingAgentSignal) =>
    void syncExecution({
      type: 'signal_status',
      signalId: signal.id,
      symbol: signal.symbol,
      status: 'approved' satisfies Exclude<TradingAgentPersistedStatus, 'paper_filled'>,
    });

  const rejectSignal = (signal: TradingAgentSignal) =>
    void syncExecution({
      type: 'signal_status',
      signalId: signal.id,
      symbol: signal.symbol,
      status: 'rejected' satisfies Exclude<TradingAgentPersistedStatus, 'paper_filled'>,
    });

  const resetSignal = (signalId: string) =>
    void syncExecution({
      type: 'clear_signal',
      signalId,
    });

  const fillSignal = (signal: TradingAgentSignal) => {
    if (!signal.entry) return;

    void syncExecution({
      type: 'fill_position',
      signalId: signal.id,
      symbol: signal.symbol,
      side: signal.action === 'SELL' ? 'short' : 'long',
      quantity: calculateFillQuantity(signal),
      entryPrice: signal.entry,
      stopPrice: signal.stop,
      targetPrice: signal.target,
      thesis: signal.thesis,
    });
  };

  const clearFill = (signalId: string) =>
    void syncExecution({
      type: 'delete_position',
      signalId,
    });

  const closeFill = (position: TradingAgentPaperPosition) =>
    void syncExecution({
      type: 'close_position',
      signalId: position.signalId,
      exitPrice: position.markPrice,
    });

  return (
    <Layout title="AI Trading Agent">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Trading Agent</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Paper-first signal engine using GR8BUX rules, Massive market data, and a next-day review loop.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadDashboard(preferences)}
              disabled={loading || !initialized}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={() => void loadDashboard(preferences)}
              disabled={loading || !initialized}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              Apply Rules
            </button>
            <button
              onClick={runReview}
              disabled={runningReview || !dashboard}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
            >
              {runningReview ? 'Reviewing...' : 'Run Review'}
            </button>
          </div>
        </div>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Controls</h2>
                <p className="text-xs text-muted-foreground">
                  Saved on this device so the dashboard comes back with your preferred sizing and rules.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{watchlistCount} symbols</span>
                <span>{openPositionCount} paper fills saved</span>
                <button onClick={resetPreferences} className="rounded-md border border-border px-2 py-1 hover:bg-accent">
                  Reset Defaults
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-4 py-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <Field label="Account Size" description="Used to size paper positions and compute the live risk budget.">
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={preferences.accountSize}
                  onChange={(event) =>
                    setPreferences((prev) => ({
                      ...prev,
                      accountSize: Number(event.target.value) || DEFAULT_PREFERENCES.accountSize,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </Field>

              <Field label="Mode" description="Manual paper keeps approvals and fills on your account when you are signed in.">
                <select
                  value={preferences.mode}
                  onChange={(event) => setPreferences((prev) => ({ ...prev, mode: event.target.value as TradingAgentMode }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="signals_only">Signals Only</option>
                  <option value="manual_paper">Manual Paper</option>
                  <option value="auto_paper">Auto Paper</option>
                </select>
              </Field>

              <Field label="Watchlist" description="Comma-separated tickers. The agent will score up to 20 names per refresh.">
                <textarea
                  rows={3}
                  value={preferences.watchlistText}
                  onChange={(event) => setPreferences((prev) => ({ ...prev, watchlistText: event.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </Field>
            </div>

            <div className="space-y-4">
              <Field label="Risk Per Trade" description="Percent of account the agent can budget to a single idea.">
                <input
                  type="number"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={preferences.maxRiskPerTradePct}
                  onChange={(event) =>
                    setPreferences((prev) => ({
                      ...prev,
                      maxRiskPerTradePct: Number(event.target.value) || prev.maxRiskPerTradePct,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </Field>

              <Field label="Daily Loss Limit" description="Guardrail for the total drawdown the agent should tolerate in one session.">
                <input
                  type="number"
                  min={0.5}
                  max={20}
                  step={0.5}
                  value={preferences.maxDailyLossPct}
                  onChange={(event) =>
                    setPreferences((prev) => ({
                      ...prev,
                      maxDailyLossPct: Number(event.target.value) || prev.maxDailyLossPct,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </Field>

              <Field label="Max Open Positions" description="The fill button disables once this many paper positions are open.">
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={preferences.maxOpenPositions}
                  onChange={(event) =>
                    setPreferences((prev) => ({
                      ...prev,
                      maxOpenPositions: Number(event.target.value) || prev.maxOpenPositions,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleField
                  label="Manual Approval"
                  description="Require explicit approval before a paper fill can be recorded."
                  checked={preferences.requireManualApproval}
                  onChange={(checked) => setPreferences((prev) => ({ ...prev, requireManualApproval: checked }))}
                />
                <ToggleField
                  label="Allow Options"
                  description="Reserved for the future options scoring path."
                  checked={preferences.allowOptions}
                  onChange={(checked) => setPreferences((prev) => ({ ...prev, allowOptions: checked }))}
                />
              </div>
            </div>
          </div>
        </section>

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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <Stat label="Mode" value={dashboard.mode.replace('_', ' ')} detail={dashboard.rules.requireManualApproval ? 'Approval gate on' : 'Fill-ready mode'} />
              <Stat label="Account" value={money(dashboard.accountSize)} detail={`${dashboard.rules.watchlist.length} symbols watched`} />
              <Stat label="Paper Equity" value={money(derived.paperEquity)} detail={`${money(derived.dayPnl)} live P/L`} />
              <Stat label="Signals" value={String(actionableSignals.length)} detail={`${derived.signals.length} symbols evaluated`} />
              <Stat label="Open Fills" value={String(openPositionCount)} detail={`Max ${dashboard.rules.maxOpenPositions} positions`} />
              <Stat label="Next Review" value={new Date(dashboard.nextReviewAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} detail="Daily at 1:00 PM Central" />
            </div>

            {dashboard.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700/60 dark:bg-amber-950/40">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Agent warnings</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {dashboard.warnings.map((warning) => (
                    <span key={warning} className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-800/60 dark:text-amber-100">
                      {warning}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Buy / Sell Signals</h2>
                  <p className="text-xs text-muted-foreground">Generated {new Date(dashboard.fetchedAt).toLocaleString()}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {dashboard.rules.requireManualApproval ? 'Approve first, then fill' : 'Paper fills can be recorded directly'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Symbol</th>
                      <th className="px-4 py-2 text-left font-medium">Action</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-right font-medium">Confidence</th>
                      <th className="px-4 py-2 text-right font-medium">Entry</th>
                      <th className="px-4 py-2 text-right font-medium">Stop</th>
                      <th className="px-4 py-2 text-right font-medium">Target</th>
                      <th className="px-4 py-2 text-right font-medium">Max Risk</th>
                      <th className="px-4 py-2 text-left font-medium">Thesis</th>
                      <th className="px-4 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {derived.signals.map((signal) => {
                      const actionable = signal.action === 'BUY' || signal.action === 'SELL';
                      const requiresApproval = dashboard.rules.requireManualApproval;
                      const approvalReady = !requiresApproval || signal.status === 'approved' || signal.status === 'paper_filled';
                      const alreadyFilled = signalIdsWithFills.has(signal.id);
                      const maxPositionsHit = openPositionCount >= dashboard.rules.maxOpenPositions && !alreadyFilled;
                      const canFill = actionable && signal.entry !== null && approvalReady && !alreadyFilled && !maxPositionsHit;

                      return (
                        <tr key={signal.id} className="align-top">
                          <td className="px-4 py-3 font-semibold text-foreground">{signal.symbol}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusColor(signal.action)}`}>
                              {signal.action}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-md px-2 py-1 text-xs font-semibold ${executionStatusColor(signal.status)}`}>
                              {executionLabel(signal.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">{pct(signal.confidence)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{signal.entry ? money(signal.entry) : '-'}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{signal.stop ? money(signal.stop) : '-'}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{signal.target ? money(signal.target) : '-'}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{money(signal.maxRiskDollars)}</td>
                          <td className="max-w-md px-4 py-3">
                            <p className="text-foreground">{signal.thesis}</p>
                            {signal.riskFlags.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{signal.riskFlags[0]}</p>}
                          </td>
                          <td className="px-4 py-3">
                            {actionable ? (
                              <div className="flex flex-col items-end gap-2">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {requiresApproval && signal.status !== 'approved' && signal.status !== 'paper_filled' && (
                                    <button
                                      onClick={() => approveSignal(signal)}
                                      disabled={mutatingExecution}
                                      className="rounded-md border border-emerald-400 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-500/10 disabled:opacity-50"
                                    >
                                      Approve
                                    </button>
                                  )}
                                  {signal.status !== 'rejected' && signal.status !== 'paper_filled' && (
                                    <button
                                      onClick={() => rejectSignal(signal)}
                                      disabled={mutatingExecution}
                                      className="rounded-md border border-rose-400 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-600 dark:text-rose-400 dark:hover:bg-rose-500/10 disabled:opacity-50"
                                    >
                                      Reject
                                    </button>
                                  )}
                                  {signal.status !== 'new' && signal.status !== 'watching' && signal.status !== 'paper_filled' && (
                                    <button
                                      onClick={() => resetSignal(signal.id)}
                                      disabled={mutatingExecution}
                                      className="rounded-md border border-zinc-400 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-500 dark:text-zinc-300 dark:hover:bg-zinc-700/50 disabled:opacity-50"
                                    >
                                      Reset
                                    </button>
                                  )}
                                  {signal.status === 'paper_filled' ? (
                                    <button
                                      onClick={() => clearFill(signal.id)}
                                      disabled={mutatingExecution}
                                      className="rounded-md bg-slate-700 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                                    >
                                      Clear Fill
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => fillSignal(signal)}
                                      disabled={!canFill || mutatingExecution}
                                      className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Paper Fill
                                    </button>
                                  )}
                                </div>
                                <p className="text-right text-[11px] text-muted-foreground">
                                  {alreadyFilled
                                    ? `${calculateFillQuantity(signal)} shares filled`
                                    : maxPositionsHit
                                      ? 'Max open positions reached'
                                      : requiresApproval && !approvalReady
                                        ? 'Approval required before fill'
                                        : signal.entry
                                          ? `${calculateFillQuantity(signal)} shares ready`
                                          : 'No entry price available'}
                                </p>
                              </div>
                            ) : (
                              <p className="text-right text-xs text-muted-foreground">No action</p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
              <section className="rounded-lg border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-foreground">Paper Positions</h2>
                  <p className="text-xs text-muted-foreground">
                    Manual fills are stored with your account and marked to market from the latest watchlist prices.
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {derived.positions.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-muted-foreground">No paper positions recorded yet.</p>
                  ) : (
                    derived.positions.map((position) => {
                      return (
                        <div key={position.id} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-foreground">
                                {position.symbol} <span className="text-xs font-medium uppercase text-muted-foreground">{position.side}</span>
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {position.quantity} shares at {money(position.entryPrice)}. Mark {money(position.markPrice)}.
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={position.unrealizedPnl >= 0 ? 'text-sm font-semibold text-emerald-600' : 'text-sm font-semibold text-rose-600'}>
                                {money(position.unrealizedPnl)}
                              </p>
                              <div className="mt-2 flex items-center justify-end gap-2">
                                {position.signalId && (
                                  <button
                                    onClick={() => closeFill(position)}
                                    disabled={mutatingExecution}
                                    className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                                  >
                                    Close
                                  </button>
                                )}
                                {position.signalId && (
                                  <button
                                    onClick={() => clearFill(position.signalId!)}
                                    disabled={mutatingExecution}
                                    className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
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
