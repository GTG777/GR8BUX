import { useMemo, useState } from 'react';
import { useKronosForecast } from '@/hooks/useKronosForecast';
import KronosForecastPanel from '@/components/KronosForecastPanel';
import type { KronosHistoryRow } from '@/types/kronosForecast';

const SAMPLE_HISTORY: KronosHistoryRow[] = [
  { timestamp: '2026-05-20T09:30:00Z', open: 195.4, high: 196.8, low: 194.9, close: 196.2, volume: 1250000 },
  { timestamp: '2026-05-20T09:35:00Z', open: 196.2, high: 197.1, low: 195.8, close: 196.5, volume: 980000 },
  { timestamp: '2026-05-20T09:40:00Z', open: 196.5, high: 197.3, low: 196.1, close: 196.9, volume: 1120000 },
  { timestamp: '2026-05-20T09:45:00Z', open: 196.8, high: 197.5, low: 196.3, close: 197.0, volume: 1045000 },
  { timestamp: '2026-05-20T09:50:00Z', open: 197.0, high: 197.8, low: 196.6, close: 197.3, volume: 1032000 },
  { timestamp: '2026-05-20T09:55:00Z', open: 197.2, high: 197.9, low: 196.7, close: 197.4, volume: 1074000 },
  { timestamp: '2026-05-20T10:00:00Z', open: 197.4, high: 198.0, low: 197.1, close: 197.7, volume: 1180000 },
  { timestamp: '2026-05-20T10:05:00Z', open: 197.7, high: 198.2, low: 197.3, close: 197.9, volume: 1115000 },
  { timestamp: '2026-05-20T10:10:00Z', open: 197.9, high: 198.4, low: 197.6, close: 198.1, volume: 1098000 },
  { timestamp: '2026-05-20T10:15:00Z', open: 198.1, high: 198.7, low: 197.8, close: 198.4, volume: 1152000 },
  { timestamp: '2026-05-20T10:20:00Z', open: 198.4, high: 198.9, low: 198.0, close: 198.6, volume: 1201000 },
  { timestamp: '2026-05-20T10:25:00Z', open: 198.5, high: 199.1, low: 198.2, close: 198.9, volume: 1257000 },
  { timestamp: '2026-05-20T10:30:00Z', open: 198.9, high: 199.6, low: 198.4, close: 199.2, volume: 1278000 },
  { timestamp: '2026-05-20T10:35:00Z', open: 199.2, high: 199.8, low: 198.8, close: 199.5, volume: 1311000 },
  { timestamp: '2026-05-20T10:40:00Z', open: 199.5, high: 200.0, low: 199.2, close: 199.8, volume: 1359000 },
  { timestamp: '2026-05-20T10:45:00Z', open: 199.8, high: 200.4, low: 199.5, close: 200.1, volume: 1423000 },
];

interface CandleApiResponse {
  symbol: string;
  candles: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

export default function AiraPage() {
  const [historyJson, setHistoryJson] = useState(JSON.stringify(SAMPLE_HISTORY, null, 2));
  const [predLen, setPredLen] = useState(12);
  const [symbol, setSymbol] = useState('');
  const [loadedSymbol, setLoadedSymbol] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [intervalOption, setIntervalOption] = useState('D');
  const { forecast, isLoading, error, analyzeForecast } = useKronosForecast();

  const parsedHistory = useMemo(() => {
    try {
      return JSON.parse(historyJson) as KronosHistoryRow[];
    } catch {
      return null;
    }
  }, [historyJson]);

  const fetchSymbolHistory = async () => {
    const cleanSymbol = symbol.trim().toUpperCase();
    if (!cleanSymbol) {
      setHistoryError('Enter a valid ticker symbol first.');
      return;
    }

    setLoadingHistory(true);
    setHistoryError(null);
    setLoadedSymbol(null);

    try {
      // choose endpoint params: use TV interval for intraday or daily range for 'D'
      const urlBase = `/api/market/candles?symbol=${encodeURIComponent(cleanSymbol)}`;
      const url = intervalOption && intervalOption !== 'D' ? `${urlBase}&interval=${encodeURIComponent(intervalOption)}` : `${urlBase}&range=compact`;
      const response = await fetch(url);
      const payload = await response.json();

      if (!response.ok || !payload?.candles) {
        setHistoryError(payload?.error || 'Unable to load symbol history.');
        return;
      }

      const history = payload.candles.map((c: any) => ({
        timestamp: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })) as KronosHistoryRow[];

      setHistoryJson(JSON.stringify(history, null, 2));
      setLoadedSymbol(cleanSymbol);
    } catch (fetchError: any) {
      setHistoryError(fetchError?.message || 'Ticker history request failed.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSubmit = async () => {
    if (!parsedHistory || parsedHistory.length < 16) return;

    await analyzeForecast({
      symbol: loadedSymbol ?? undefined,
      history: parsedHistory,
      pred_len: predLen,
      T: 1.0,
      top_p: 0.9,
      sample_count: 1,
    });
  };

  return (
    <div className="space-y-6 px-4 py-6 sm:px-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">AIRA</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              AIRA is the dedicated page for the Kronos forecast integration. It includes the same prediction workflow and panel without changing any existing app pages.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Ticker-based or manual input</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Enter a ticker symbol to load recent daily OHLCV history automatically, or paste your own validated ISO timestamped OHLCV JSON.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end">
            <label className="block w-full">
              <span className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-100">Ticker symbol</span>
              <input
                type="text"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                placeholder="AAPL"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-100">Interval</span>
              <select
                value={intervalOption}
                onChange={(e) => setIntervalOption(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="D">Daily (D)</option>
                <option value="60">Hourly (60)</option>
                <option value="240">4H (240)</option>
              </select>
            </label>

            <div>
              <button
                type="button"
                onClick={fetchSymbolHistory}
                disabled={loadingHistory || isLoading || !symbol.trim()}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {loadingHistory ? 'Fetching…' : 'Load history'}
              </button>
            </div>
          </div>

          {historyError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200">
              {historyError}
            </div>
          ) : null}

          {loadedSymbol ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
              Loaded history for <span className="font-semibold">{loadedSymbol}</span>. You can still edit the JSON manually if needed.
            </div>
          ) : null}

          <textarea
            value={historyJson}
            onChange={(event) => {
              setHistoryJson(event.target.value);
              setLoadedSymbol(null);
            }}
            className="h-[320px] w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-100">Prediction length</label>
            <input
              type="number"
              min={1}
              max={50}
              value={predLen}
              onChange={(event) => setPredLen(Number(event.target.value))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!parsedHistory || parsedHistory.length < 16 || isLoading}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isLoading ? 'Running AIRA forecast…' : 'Run AIRA Forecast'}
          </button>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            <p className="font-semibold text-slate-900 dark:text-slate-100">How it works</p>
            <p className="mt-2">AIRA can now load OHLCV history for a symbol before sending it to the Kronos service. Manual JSON is still supported if you want to override the series.</p>
          </div>
        </div>
      </div>

      <KronosForecastPanel forecast={forecast} isLoading={isLoading} error={error} />
    </div>
  );
}
