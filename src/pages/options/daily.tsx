import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';

const STORAGE_KEY = 'gr8bux_daily_options_config_v1';

type IVMode = 'iv_percentile' | 'iv_rank';
type AfterHoursSpreadMode = 'disable' | 'relax';
type UniverseMode = 'custom' | 'sp500';

interface DailyOptionsConfig {
  universe: {
    mode: UniverseMode;
    tickers: string[];
    includeWeeklies: boolean;
    excludeEarningsWithinDays: number; // 0 disables
    batchSize: number;
  };
  data: {
    provider: 'placeholder';
    refreshIntervalMinutes: number;
  };
  afterHours: {
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
    ivSpike: {
      enabled: boolean;
      lookbackDays: number;
      thresholdPct: number;
    };
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

interface DailyScanCandidate {
  id: string;
  ticker: string;
  contractSymbol: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string;
  dte: number;
  underlyingPrice: number;
  bid: number;
  ask: number;
  mid: number;
  spreadPct: number | null;
  iv: number;
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

interface DailyScanResponse {
  success: boolean;
  fetchedAt: number;
  tickers: string[];
  candidates: DailyScanCandidate[];
  errors: Array<{ ticker: string; error: string }>;
  warnings?: string[];
  disclaimer?: string;
}

const DEFAULT_CONFIG: DailyOptionsConfig = {
  universe: {
    mode: 'custom',
    tickers: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA'],
    includeWeeklies: true,
    excludeEarningsWithinDays: 7,
    batchSize: 25,
  },
  data: {
    provider: 'placeholder',
    refreshIntervalMinutes: 15,
  },
  afterHours: {
    enabled: false,
    spreadFilterMode: 'relax',
    relaxedMaxBidAskSpreadPct: 25,
  },
  liquidity: {
    minOpenInterest: 500,
    minVolume: 200,
    maxBidAskSpreadPct: 8,
    minOptionPrice: 0.25,
    maxContractsPerTicker: 20,
  },
  expiry: {
    dteMin: 1,
    dteMax: 7,
    allow0DTE: false,
    allow1DTE: true,
  },
  greeks: {
    deltaMin: 0.3,
    deltaMax: 0.7,
  },
  volatility: {
    mode: 'iv_percentile',
    threshold: 60,
    ivSpike: {
      enabled: false,
      lookbackDays: 20,
      thresholdPct: 25,
    },
  },
  scoring: {
    weights: {
      volumeVsOI: 2,
      volatility: 2,
      delta: 1,
      liquidity: 3,
      dte: 1,
    },
  },
  risk: {
    maxRiskPctPerTrade: 1,
    definedRiskOnly: false,
    warnOnWideSpreadPct: 12,
  },
  scheduler: {
    enabled: true,
    runEveryMinutes: 15,
    dedupeWindowMinutes: 60,
  },
};

function loadAccountSizeFallback(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem('gr8bux_settings');
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { defaultAccountSize?: unknown };
    const v = Number(parsed.defaultAccountSize);
    return Number.isFinite(v) && v > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

type LastSignalMap = Record<string, number>; // id -> lastSeen timestamp ms
const LAST_SIGNALS_KEY = 'gr8bux_daily_options_last_signals_v1';
function loadLastSignals(): LastSignalMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LAST_SIGNALS_KEY);
    return raw ? (JSON.parse(raw) as LastSignalMap) : {};
  } catch {
    return {};
  }
}
function saveLastSignals(map: LastSignalMap) {
  localStorage.setItem(LAST_SIGNALS_KEY, JSON.stringify(map));
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeTickers(text: string): string[] {
  const raw = text
    .split(/[\s,]+/g)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(raw));
}

function loadConfig(): DailyOptionsConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<DailyOptionsConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      universe: { ...DEFAULT_CONFIG.universe, ...(parsed.universe ?? {}) },
      data: { ...DEFAULT_CONFIG.data, ...(parsed.data ?? {}) },
      afterHours: { ...DEFAULT_CONFIG.afterHours, ...(parsed.afterHours ?? {}) },
      liquidity: { ...DEFAULT_CONFIG.liquidity, ...(parsed.liquidity ?? {}) },
      expiry: { ...DEFAULT_CONFIG.expiry, ...(parsed.expiry ?? {}) },
      greeks: { ...DEFAULT_CONFIG.greeks, ...(parsed.greeks ?? {}) },
      volatility: {
        ...DEFAULT_CONFIG.volatility,
        ...(parsed.volatility ?? {}),
        ivSpike: { ...DEFAULT_CONFIG.volatility.ivSpike, ...((parsed.volatility as any)?.ivSpike ?? {}) },
      },
      scoring: {
        ...DEFAULT_CONFIG.scoring,
        ...(parsed.scoring ?? {}),
        weights: { ...DEFAULT_CONFIG.scoring.weights, ...((parsed.scoring as any)?.weights ?? {}) },
      },
      risk: { ...DEFAULT_CONFIG.risk, ...(parsed.risk ?? {}) },
      scheduler: { ...DEFAULT_CONFIG.scheduler, ...(parsed.scheduler ?? {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: DailyOptionsConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function Section({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-zinc-700/40 flex items-center gap-2">
        <span>{emoji}</span>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-zinc-100">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer group">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
          {label}
        </p>
        {description && <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex w-11 h-6 rounded-full transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${
          checked ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-zinc-700'
        }`}
      >
        <span
          className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}

function NumberRow({
  label,
  description,
  value,
  min,
  max,
  step,
  prefix,
  suffix,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-zinc-100">{label}</p>
        {description && <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-sm text-gray-500 dark:text-zinc-500">{prefix}</span>}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-zinc-100 rounded-lg px-3 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
        />
        {suffix && <span className="text-sm text-gray-500 dark:text-zinc-500">{suffix}</span>}
      </div>
    </div>
  );
}

function SelectRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-zinc-100">{label}</p>
        {description && <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-zinc-100 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextareaRow({
  label,
  description,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-zinc-100">{label}</p>
        {description && <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-zinc-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
      />
    </div>
  );
}

export default function DailyOptionsPage() {
  const [config, setConfig] = useState<DailyOptionsConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tickersText, setTickersText] = useState(DEFAULT_CONFIG.universe.tickers.join(', '));
  const [running, setRunning] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [scanAt, setScanAt] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<DailyScanCandidate[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [lastSignals, setLastSignals] = useState<LastSignalMap>({});
  const [scanWarnings, setScanWarnings] = useState<string[]>([]);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  const [sp500Info, setSp500Info] = useState<{ tickers: string[]; fetchedAt: number } | null>(null);

  useEffect(() => {
    const loaded = loadConfig();
    setConfig(loaded);
    setTickersText(loaded.universe.tickers.join(', '));
    setLastSignals(loadLastSignals());
  }, []);

  useEffect(() => {
    // Keep config in sync with the textarea, but don't fight the user's typing.
    const normalized = normalizeTickers(tickersText);
    setConfig((prev) => ({ ...prev, universe: { ...prev.universe, tickers: normalized } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersText]);

  const validation = useMemo(() => {
    const issues: string[] = [];
    if (config.expiry.dteMin > config.expiry.dteMax) issues.push('DTE min is greater than DTE max.');
    if (config.greeks.deltaMin > config.greeks.deltaMax) issues.push('Delta min is greater than Delta max.');
    if (config.liquidity.maxBidAskSpreadPct > config.risk.warnOnWideSpreadPct) {
      issues.push('Liquidity spread filter is looser than your wide-spread warning threshold.');
    }
    if (config.scheduler.enabled && config.scheduler.runEveryMinutes < 5) issues.push('Scheduler interval is very aggressive (< 5 min).');
    if (config.expiry.allow0DTE && config.liquidity.maxBidAskSpreadPct > 6) issues.push('0DTE enabled with a wide spread filter.');
    if (config.afterHours.enabled && config.afterHours.spreadFilterMode === 'disable') {
      issues.push('After-hours mode disables spread filtering. Verify quotes before trading.');
    }
    if (config.universe.batchSize > 50) issues.push('Batch size above 50 may slow down or fail.');
    return issues;
  }, [config]);

  const exportJson = useMemo(() => JSON.stringify(config, null, 2), [config]);

  const setNumber = (path: (prev: DailyOptionsConfig) => DailyOptionsConfig) => setConfig(path);

  const handleSave = () => {
    // Clamp a few values to keep config sane.
    const cleaned: DailyOptionsConfig = {
      ...config,
      universe: {
        ...config.universe,
        excludeEarningsWithinDays: clampNumber(config.universe.excludeEarningsWithinDays, 0, 30),
        batchSize: clampNumber(config.universe.batchSize, 5, 50),
      },
      data: {
        ...config.data,
        refreshIntervalMinutes: clampNumber(config.data.refreshIntervalMinutes, 1, 120),
      },
      afterHours: {
        ...config.afterHours,
        relaxedMaxBidAskSpreadPct: clampNumber(config.afterHours.relaxedMaxBidAskSpreadPct, 0, 100),
      },
      liquidity: {
        ...config.liquidity,
        minOpenInterest: Math.max(0, config.liquidity.minOpenInterest),
        minVolume: Math.max(0, config.liquidity.minVolume),
        maxBidAskSpreadPct: clampNumber(config.liquidity.maxBidAskSpreadPct, 0, 100),
        minOptionPrice: Math.max(0, config.liquidity.minOptionPrice),
        maxContractsPerTicker: clampNumber(config.liquidity.maxContractsPerTicker, 1, 200),
      },
      expiry: {
        ...config.expiry,
        dteMin: clampNumber(config.expiry.dteMin, 0, 365),
        dteMax: clampNumber(config.expiry.dteMax, 0, 365),
      },
      greeks: {
        ...config.greeks,
        deltaMin: clampNumber(config.greeks.deltaMin, 0, 1),
        deltaMax: clampNumber(config.greeks.deltaMax, 0, 1),
      },
      volatility: {
        ...config.volatility,
        threshold: clampNumber(config.volatility.threshold, 0, 100),
        ivSpike: {
          ...config.volatility.ivSpike,
          lookbackDays: clampNumber(config.volatility.ivSpike.lookbackDays, 5, 252),
          thresholdPct: clampNumber(config.volatility.ivSpike.thresholdPct, 1, 300),
        },
      },
      risk: {
        ...config.risk,
        maxRiskPctPerTrade: clampNumber(config.risk.maxRiskPctPerTrade, 0.1, 10),
        warnOnWideSpreadPct: clampNumber(config.risk.warnOnWideSpreadPct, 0, 100),
      },
      scheduler: {
        ...config.scheduler,
        runEveryMinutes: clampNumber(config.scheduler.runEveryMinutes, 5, 120),
        dedupeWindowMinutes: clampNumber(config.scheduler.dedupeWindowMinutes, 0, 24 * 60),
      },
    };

    setConfig(cleaned);
    saveConfig(cleaned);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    setTickersText(DEFAULT_CONFIG.universe.tickers.join(', '));
    saveConfig(DEFAULT_CONFIG);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // no-op: clipboard can fail in some browser contexts
    }
  };

  const handleRunScan = async () => {
    setRunning(true);
    setScanErr(null);
    setScanWarnings([]);
    setScanProgress(null);
    setExpandedId(null);
    try {
      // Save current config before running, so API matches what you see.
      saveConfig(config);

      const accountSize = loadAccountSizeFallback();
      const currentLastSignals = loadLastSignals();

      let tickersToScan: string[] = [];
      if (config.universe.mode === 'sp500') {
        const r = await fetch('/api/market/sp500');
        const j = (await r.json()) as { success: boolean; tickers?: string[]; fetchedAt?: number; error?: string };
        if (!r.ok || !j.success || !j.tickers?.length) throw new Error(j.error ?? 'Failed to load S&P 500 list');
        tickersToScan = j.tickers;
        setSp500Info({ tickers: j.tickers, fetchedAt: j.fetchedAt ?? Date.now() });
      } else {
        tickersToScan = normalizeTickers(tickersText);
      }

      if (tickersToScan.length === 0) throw new Error('No tickers to scan');

      // Run in batches to avoid timeouts.
      const batchSize = clampNumber(config.universe.batchSize, 5, 50);
      const totalBatches = Math.ceil(tickersToScan.length / batchSize);
      setScanProgress({ done: 0, total: totalBatches });

      const allCandidates: DailyScanCandidate[] = [];
      const allErrors: Array<{ ticker: string; error: string }> = [];
      const allWarnings: string[] = [];
      let fetchedAt = Date.now();

      for (let b = 0; b < totalBatches; b++) {
        setScanProgress({ done: b, total: totalBatches });
        const batchTickers = tickersToScan.slice(b * batchSize, b * batchSize + batchSize);
        const batchConfig: DailyOptionsConfig = { ...config, universe: { ...config.universe, tickers: batchTickers } };
        const resp = await fetch('/api/options/daily-scan', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ config: batchConfig, accountSize, side: 'both' }),
        });
        const data = (await resp.json()) as DailyScanResponse;
        if (!resp.ok || !data?.success) {
          throw new Error((data as any)?.error ?? 'Scan failed');
        }
        fetchedAt = Math.max(fetchedAt, data.fetchedAt ?? Date.now());
        allCandidates.push(...(data.candidates ?? []));
        allErrors.push(...(data.errors ?? []));
        allWarnings.push(...(data.warnings ?? []));
      }

      setScanProgress({ done: totalBatches, total: totalBatches });
      setScanAt(fetchedAt);
      setScanWarnings(Array.from(new Set(allWarnings)));

      // Dedupe in UI (serverless runtimes are stateless).
      const now = Date.now();
      const dedupeMs = Math.max(0, config.scheduler.dedupeWindowMinutes) * 60 * 1000;
      const nextLastSignals: LastSignalMap = { ...currentLastSignals };

      const withDupes = allCandidates.map((c) => {
        const lastSeen = nextLastSignals[c.id];
        const isDup = dedupeMs > 0 && lastSeen && now - lastSeen < dedupeMs;
        return { ...c, warnings: isDup ? ['Duplicate signal within dedupe window.', ...c.warnings] : c.warnings };
      });

      for (const c of allCandidates) nextLastSignals[c.id] = now;
      setLastSignals(nextLastSignals);
      saveLastSignals(nextLastSignals);

      // Keep the UI sane: sort and cap display
      withDupes.sort((a, b) => b.score.total - a.score.total || a.ticker.localeCompare(b.ticker));
      setCandidates(withDupes.slice(0, 400));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setScanErr(msg);
      setCandidates([]);
    } finally {
      setRunning(false);
    }
  };

  const visibleCandidates = useMemo(() => {
    if (!hideDuplicates) return candidates;
    return candidates.filter((c) => !c.warnings.includes('Duplicate signal within dedupe window.'));
  }, [candidates, hideDuplicates]);

  const emptyState = useMemo(() => {
    if (!scanAt) return null;
    if (running) return null;
    if (scanErr) return null;
    if (visibleCandidates.length > 0) return null;
    if (hideDuplicates && candidates.length > 0) {
      return {
        title: 'All candidates hidden as duplicates',
        body: 'Turn off Hide Duplicates, or reduce Dedupe Window (or set it to 0) to see them.',
      };
    }
    return {
      title: 'No candidates matched your filters',
      body: 'Try lowering Min Volume / Min OI, widening Max Bid-Ask Spread, or lowering the IV threshold.',
    };
  }, [scanAt, running, scanErr, visibleCandidates.length, hideDuplicates, candidates.length]);

  return (
    <Layout title="Daily Options">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Daily Options</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
              Configure your options scan rules and export a JSON config for the backend scanner.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunScan}
              disabled={running}
              className={`px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors ${
                running ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {running ? 'Running…' : 'Run Scan'}
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Save
            </button>
          </div>
        </div>

        {scanErr && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-3">
            <p className="text-sm font-medium text-rose-900 dark:text-rose-200">Scan error</p>
            <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">{scanErr}</p>
          </div>
        )}

        {scanWarnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Scan warnings</p>
            <ul className="mt-1 text-sm text-amber-800 dark:text-amber-300 list-disc pl-5 space-y-0.5">
              {scanWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {scanAt && (
          <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Latest scan</p>
              <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
                {new Date(scanAt).toLocaleString()}
              </p>
              {scanProgress && scanProgress.total > 1 && (
                <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
                  Progress: {scanProgress.done}/{scanProgress.total} batches
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <ToggleRow
                label="Hide Duplicates"
                description="Uses your dedupe window setting."
                checked={hideDuplicates}
                onChange={setHideDuplicates}
              />
            </div>
          </div>
        )}

        {emptyState && (
          <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{emptyState.title}</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">{emptyState.body}</p>
          </div>
        )}

        {visibleCandidates.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700/60 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-zinc-700/40 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-zinc-100">Ranked Candidates</p>
                <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
                  Click a row for rationale and risk sizing.
                </p>
              </div>
              <div className="text-xs text-gray-500 dark:text-zinc-500">
                {visibleCandidates.length} shown (of {candidates.length})
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-zinc-950/40 text-gray-600 dark:text-zinc-400">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Ticker</th>
                    <th className="text-left font-medium px-4 py-2.5">Type</th>
                    <th className="text-left font-medium px-4 py-2.5">Strike</th>
                    <th className="text-left font-medium px-4 py-2.5">Expiry</th>
                    <th className="text-right font-medium px-4 py-2.5">DTE</th>
                    <th className="text-right font-medium px-4 py-2.5">Delta</th>
                    <th className="text-right font-medium px-4 py-2.5">IV%</th>
                    <th className="text-right font-medium px-4 py-2.5">OI</th>
                    <th className="text-right font-medium px-4 py-2.5">Vol</th>
                    <th className="text-right font-medium px-4 py-2.5">Spr%</th>
                    <th className="text-right font-medium px-4 py-2.5">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {visibleCandidates.map((c) => {
                    const expanded = expandedId === c.id;
                    return (
                      <React.Fragment key={c.id}>
                        <tr
                          onClick={() => setExpandedId(expanded ? null : c.id)}
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/40"
                        >
                          <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{c.ticker}</td>
                          <td className="px-4 py-2.5 text-gray-700 dark:text-zinc-200">{c.type.toUpperCase()}</td>
                          <td className="px-4 py-2.5 text-gray-700 dark:text-zinc-200">{c.strike}</td>
                          <td className="px-4 py-2.5 text-gray-700 dark:text-zinc-200">{c.expiry}</td>
                          <td className="px-4 py-2.5 text-right text-gray-700 dark:text-zinc-200">{c.dte}</td>
                          <td className="px-4 py-2.5 text-right text-gray-700 dark:text-zinc-200">
                            {c.greeks.delta === null ? '—' : c.greeks.delta.toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-700 dark:text-zinc-200">{c.iv.toFixed(1)}</td>
                          <td className="px-4 py-2.5 text-right text-gray-700 dark:text-zinc-200">{c.liquidity.openInterest}</td>
                          <td className="px-4 py-2.5 text-right text-gray-700 dark:text-zinc-200">{c.liquidity.volume}</td>
                          <td className="px-4 py-2.5 text-right text-gray-700 dark:text-zinc-200">
                            {c.spreadPct === null ? '—' : c.spreadPct.toFixed(2)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">
                            {(c.score.total * 100).toFixed(1)}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-gray-50/60 dark:bg-zinc-950/30">
                            <td colSpan={11} className="px-4 py-3">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300">Rationale</p>
                                  <ul className="mt-1 text-xs text-gray-600 dark:text-zinc-400 list-disc pl-5 space-y-0.5">
                                    {c.rationale.map((r) => (
                                      <li key={r}>{r}</li>
                                    ))}
                                  </ul>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300">Risk + Sizing</p>
                                  <div className="mt-1 text-xs text-gray-600 dark:text-zinc-400 space-y-1">
                                    <div>
                                      Max loss per contract:{' '}
                                      {c.risk.maxLossPerContract === null ? '—' : `$${c.risk.maxLossPerContract.toFixed(2)}`}
                                    </div>
                                    <div>
                                      Sizing cap: {c.risk.maxRiskPctPerTrade.toFixed(2)}% of account
                                      {c.risk.positionSizing.accountSize
                                        ? ` ($${c.risk.positionSizing.accountSize.toFixed(0)})`
                                        : ''}
                                    </div>
                                    {typeof c.risk.positionSizing.suggestedContracts === 'number' && (
                                      <div>Suggested contracts: {c.risk.positionSizing.suggestedContracts}</div>
                                    )}
                                  </div>
                                  {c.warnings.length > 0 && (
                                    <>
                                      <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mt-3">Warnings</p>
                                      <ul className="mt-1 text-xs text-amber-700 dark:text-amber-300 list-disc pl-5 space-y-0.5">
                                        {c.warnings.map((w) => (
                                          <li key={w}>{w}</li>
                                        ))}
                                      </ul>
                                    </>
                                  )}
                                  {c.ivMetric?.note && (
                                    <p className="mt-2 text-[11px] text-gray-500 dark:text-zinc-500">{c.ivMetric.note}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {validation.length > 0 && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Config warnings</p>
            <ul className="mt-1 text-sm text-amber-800 dark:text-amber-300 list-disc pl-5 space-y-0.5">
              {validation.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Section title="Universe" emoji="🧺">
              <SelectRow
                label="Universe"
                description="Choose between a custom list or the full S&P 500 universe."
                value={config.universe.mode}
                options={[
                  { value: 'custom', label: 'Custom Tickers' },
                  { value: 'sp500', label: 'S&P 500' },
                ]}
                onChange={(v) => setConfig((p) => ({ ...p, universe: { ...p.universe, mode: v as UniverseMode } }))}
              />

              {config.universe.mode === 'custom' ? (
              <TextareaRow
                label="Tickers"
                description="Comma or whitespace separated. Duplicates removed and normalized to uppercase."
                value={tickersText}
                placeholder="SPY, QQQ, AAPL"
                onChange={setTickersText}
              />
              ) : (
                <div className="rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/30 px-3 py-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">S&P 500</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
                    Constituents fetched from Wikipedia via `/api/market/sp500`.
                    {sp500Info?.fetchedAt ? ` Last fetched: ${new Date(sp500Info.fetchedAt).toLocaleString()}.` : ''}
                  </p>
                </div>
              )}

              <NumberRow
                label="Batch Size"
                description="S&P 500 scans run in batches to avoid timeouts (max 50 per batch)."
                value={config.universe.batchSize}
                min={5}
                max={50}
                step={1}
                suffix="tickers"
                onChange={(v) => setConfig((p) => ({ ...p, universe: { ...p.universe, batchSize: v } }))}
              />
              <ToggleRow
                label="Include Weeklies"
                description="Include weekly expirations when available."
                checked={config.universe.includeWeeklies}
                onChange={(v) => setConfig((p) => ({ ...p, universe: { ...p.universe, includeWeeklies: v } }))}
              />
              <NumberRow
                label="Exclude Earnings Within"
                description="0 disables. Requires an earnings calendar source in the backend."
                value={config.universe.excludeEarningsWithinDays}
                min={0}
                max={30}
                step={1}
                suffix="days"
                onChange={(v) =>
                  setConfig((p) => ({ ...p, universe: { ...p.universe, excludeEarningsWithinDays: Math.max(0, v) } }))
                }
              />
            </Section>

            <Section title="Data Source" emoji="🛰️">
              <SelectRow
                label="Provider"
                description="Backend uses this to choose the options chain API."
                value={config.data.provider}
                options={[{ value: 'placeholder', label: 'API Placeholder' }]}
                onChange={(v) => setConfig((p) => ({ ...p, data: { ...p.data, provider: v as 'placeholder' } }))}
              />
              <NumberRow
                label="Refresh Interval"
                description="UI-side default; scheduler also enforces its own run frequency."
                value={config.data.refreshIntervalMinutes}
                min={1}
                max={120}
                step={1}
                suffix="min"
                onChange={(v) => setConfig((p) => ({ ...p, data: { ...p.data, refreshIntervalMinutes: v } }))}
              />
            </Section>

            <Section title="After-Hours Mode" emoji="🌙">
              <ToggleRow
                label="Enable After-Hours Fallback"
                description="If bid/ask are missing, fall back to last trade or day close price and add prominent warnings."
                checked={config.afterHours.enabled}
                onChange={(v) => setConfig((p) => ({ ...p, afterHours: { ...p.afterHours, enabled: v } }))}
              />
              <SelectRow
                label="Spread Filtering"
                description="After hours, spreads may be unreliable. Choose how strict to be."
                value={config.afterHours.spreadFilterMode}
                options={[
                  { value: 'relax', label: 'Relax Filter' },
                  { value: 'disable', label: 'Disable Filter' },
                ]}
                onChange={(v) =>
                  setConfig((p) => ({ ...p, afterHours: { ...p.afterHours, spreadFilterMode: v as AfterHoursSpreadMode } }))
                }
              />
              {config.afterHours.spreadFilterMode === 'relax' && (
                <NumberRow
                  label="Relaxed Max Spread"
                  description="Used when quotes exist but are wider after hours."
                  value={config.afterHours.relaxedMaxBidAskSpreadPct}
                  min={0}
                  max={100}
                  step={0.5}
                  suffix="%"
                  onChange={(v) =>
                    setConfig((p) => ({ ...p, afterHours: { ...p.afterHours, relaxedMaxBidAskSpreadPct: v } }))
                  }
                />
              )}
            </Section>

            <Section title="Liquidity Filters" emoji="💧">
              <NumberRow
                label="Min Open Interest"
                description="Hard filter gate."
                value={config.liquidity.minOpenInterest}
                min={0}
                max={500000}
                step={50}
                onChange={(v) => setConfig((p) => ({ ...p, liquidity: { ...p.liquidity, minOpenInterest: v } }))}
              />
              <NumberRow
                label="Min Volume"
                description="Hard filter gate."
                value={config.liquidity.minVolume}
                min={0}
                max={500000}
                step={50}
                onChange={(v) => setConfig((p) => ({ ...p, liquidity: { ...p.liquidity, minVolume: v } }))}
              />
              <NumberRow
                label="Max Bid-Ask Spread"
                description="Filters out wide / illiquid contracts."
                value={config.liquidity.maxBidAskSpreadPct}
                min={0}
                max={100}
                step={0.5}
                suffix="%"
                onChange={(v) => setConfig((p) => ({ ...p, liquidity: { ...p.liquidity, maxBidAskSpreadPct: v } }))}
              />
              <NumberRow
                label="Min Option Price"
                description="Avoids noisy penny options."
                value={config.liquidity.minOptionPrice}
                min={0}
                max={100}
                step={0.05}
                prefix="$"
                onChange={(v) => setConfig((p) => ({ ...p, liquidity: { ...p.liquidity, minOptionPrice: v } }))}
              />
              <NumberRow
                label="Max Contracts Per Ticker"
                description="Keeps ranked output readable."
                value={config.liquidity.maxContractsPerTicker}
                min={1}
                max={200}
                step={1}
                onChange={(v) =>
                  setConfig((p) => ({ ...p, liquidity: { ...p.liquidity, maxContractsPerTicker: v } }))
                }
              />
            </Section>

            <Section title="Expiry Window" emoji="📅">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumberRow
                  label="DTE Min"
                  value={config.expiry.dteMin}
                  min={0}
                  max={365}
                  step={1}
                  suffix="days"
                  onChange={(v) => setConfig((p) => ({ ...p, expiry: { ...p.expiry, dteMin: v } }))}
                />
                <NumberRow
                  label="DTE Max"
                  value={config.expiry.dteMax}
                  min={0}
                  max={365}
                  step={1}
                  suffix="days"
                  onChange={(v) => setConfig((p) => ({ ...p, expiry: { ...p.expiry, dteMax: v } }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ToggleRow
                  label="Allow 0DTE"
                  description="Requires strict liquidity. High gamma risk."
                  checked={config.expiry.allow0DTE}
                  onChange={(v) => setConfig((p) => ({ ...p, expiry: { ...p.expiry, allow0DTE: v } }))}
                />
                <ToggleRow
                  label="Allow 1DTE"
                  description="Next-day expiry (if available)."
                  checked={config.expiry.allow1DTE}
                  onChange={(v) => setConfig((p) => ({ ...p, expiry: { ...p.expiry, allow1DTE: v } }))}
                />
              </div>
            </Section>
          </div>

          <div className="space-y-6">
            <Section title="Greeks" emoji="📐">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumberRow
                  label="Delta Min"
                  description="Directional contracts often sit in 0.30–0.70."
                  value={config.greeks.deltaMin}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => setConfig((p) => ({ ...p, greeks: { ...p.greeks, deltaMin: v } }))}
                />
                <NumberRow
                  label="Delta Max"
                  value={config.greeks.deltaMax}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => setConfig((p) => ({ ...p, greeks: { ...p.greeks, deltaMax: v } }))}
                />
              </div>
            </Section>

            <Section title="Volatility" emoji="🌪️">
              <SelectRow
                label="Volatility Mode"
                description="Choose one thresholding method for filtering and scoring."
                value={config.volatility.mode}
                options={[
                  { value: 'iv_percentile', label: 'IV Percentile' },
                  { value: 'iv_rank', label: 'IV Rank' },
                ]}
                onChange={(v) => setConfig((p) => ({ ...p, volatility: { ...p.volatility, mode: v as IVMode } }))}
              />
              <NumberRow
                label={config.volatility.mode === 'iv_rank' ? 'IV Rank Min' : 'IV Percentile Min'}
                description="0–100. Higher values favor elevated implied volatility."
                value={config.volatility.threshold}
                min={0}
                max={100}
                step={1}
                suffix="%"
                onChange={(v) => setConfig((p) => ({ ...p, volatility: { ...p.volatility, threshold: v } }))}
              />
              <ToggleRow
                label="IV Spike Detection"
                description="Optional: flag sudden IV expansion."
                checked={config.volatility.ivSpike.enabled}
                onChange={(v) => setConfig((p) => ({ ...p, volatility: { ...p.volatility, ivSpike: { ...p.volatility.ivSpike, enabled: v } } }))}
              />
              {config.volatility.ivSpike.enabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumberRow
                    label="Spike Lookback"
                    value={config.volatility.ivSpike.lookbackDays}
                    min={5}
                    max={252}
                    step={1}
                    suffix="days"
                    onChange={(v) =>
                      setConfig((p) => ({
                        ...p,
                        volatility: { ...p.volatility, ivSpike: { ...p.volatility.ivSpike, lookbackDays: v } },
                      }))
                    }
                  />
                  <NumberRow
                    label="Spike Threshold"
                    value={config.volatility.ivSpike.thresholdPct}
                    min={1}
                    max={300}
                    step={1}
                    suffix="%"
                    onChange={(v) =>
                      setConfig((p) => ({
                        ...p,
                        volatility: { ...p.volatility, ivSpike: { ...p.volatility.ivSpike, thresholdPct: v } },
                      }))
                    }
                  />
                </div>
              )}
            </Section>

            <Section title="Scoring" emoji="🧮">
              <p className="text-xs text-gray-500 dark:text-zinc-500">
                Weights are relative; higher means more influence on ranking. Keep it simple to avoid overfitting.
              </p>
              <NumberRow
                label="Weight: Liquidity"
                value={config.scoring.weights.liquidity}
                min={0}
                max={10}
                step={0.5}
                onChange={(v) => setNumber((p) => ({ ...p, scoring: { ...p.scoring, weights: { ...p.scoring.weights, liquidity: v } } }))}
              />
              <NumberRow
                label="Weight: Volume vs OI"
                value={config.scoring.weights.volumeVsOI}
                min={0}
                max={10}
                step={0.5}
                onChange={(v) => setNumber((p) => ({ ...p, scoring: { ...p.scoring, weights: { ...p.scoring.weights, volumeVsOI: v } } }))}
              />
              <NumberRow
                label="Weight: Volatility"
                value={config.scoring.weights.volatility}
                min={0}
                max={10}
                step={0.5}
                onChange={(v) => setNumber((p) => ({ ...p, scoring: { ...p.scoring, weights: { ...p.scoring.weights, volatility: v } } }))}
              />
              <NumberRow
                label="Weight: Delta Fit"
                value={config.scoring.weights.delta}
                min={0}
                max={10}
                step={0.5}
                onChange={(v) => setNumber((p) => ({ ...p, scoring: { ...p.scoring, weights: { ...p.scoring.weights, delta: v } } }))}
              />
              <NumberRow
                label="Weight: DTE"
                value={config.scoring.weights.dte}
                min={0}
                max={10}
                step={0.5}
                onChange={(v) => setNumber((p) => ({ ...p, scoring: { ...p.scoring, weights: { ...p.scoring.weights, dte: v } } }))}
              />
            </Section>

            <Section title="Risk + Scheduler" emoji="🛡️">
              <ToggleRow
                label="Defined-Risk Only"
                description="If enabled, backend should emit spreads only."
                checked={config.risk.definedRiskOnly}
                onChange={(v) => setConfig((p) => ({ ...p, risk: { ...p.risk, definedRiskOnly: v } }))}
              />
              <NumberRow
                label="Max Risk Per Trade"
                description="Percent-based sizing cap; never a fixed dollar amount."
                value={config.risk.maxRiskPctPerTrade}
                min={0.1}
                max={10}
                step={0.1}
                suffix="%"
                onChange={(v) => setConfig((p) => ({ ...p, risk: { ...p.risk, maxRiskPctPerTrade: v } }))}
              />
              <NumberRow
                label="Wide Spread Warning"
                description="Adds an extra warning in output JSON."
                value={config.risk.warnOnWideSpreadPct}
                min={0}
                max={100}
                step={0.5}
                suffix="%"
                onChange={(v) => setConfig((p) => ({ ...p, risk: { ...p.risk, warnOnWideSpreadPct: v } }))}
              />
              <ToggleRow
                label="Scheduler Enabled"
                description="Runs every N minutes during market hours (9:30–16:00 ET)."
                checked={config.scheduler.enabled}
                onChange={(v) => setConfig((p) => ({ ...p, scheduler: { ...p.scheduler, enabled: v } }))}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumberRow
                  label="Run Every"
                  value={config.scheduler.runEveryMinutes}
                  min={5}
                  max={120}
                  step={1}
                  suffix="min"
                  onChange={(v) => setConfig((p) => ({ ...p, scheduler: { ...p.scheduler, runEveryMinutes: v } }))}
                />
                <NumberRow
                  label="Dedupe Window"
                  description="Avoid duplicate signals."
                  value={config.scheduler.dedupeWindowMinutes}
                  min={0}
                  max={24 * 60}
                  step={5}
                  suffix="min"
                  onChange={(v) =>
                    setConfig((p) => ({ ...p, scheduler: { ...p.scheduler, dedupeWindowMinutes: v } }))
                  }
                />
              </div>
            </Section>

            <Section title="Export" emoji="📦">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-zinc-100">Config JSON</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">Use this as the backend scanner config.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <pre className="text-xs bg-gray-50 dark:bg-zinc-950/40 border border-gray-200 dark:border-zinc-800 rounded-lg p-3 overflow-auto max-h-96">
                <code className="text-gray-800 dark:text-zinc-200">{exportJson}</code>
              </pre>
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-zinc-500">
                <span>{saved ? 'Saved' : 'Not saved'}</span>
                <span>No live trades. Signals are probabilistic and include risk warnings.</span>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </Layout>
  );
}
