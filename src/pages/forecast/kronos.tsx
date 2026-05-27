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

export default function KronosForecastPage() {
  const [historyJson, setHistoryJson] = useState(JSON.stringify(SAMPLE_HISTORY, null, 2));
  const [predLen, setPredLen] = useState(12);
  const { forecast, isLoading, error, analyzeForecast } = useKronosForecast();

  const parsedHistory = useMemo(() => {
    try {
      return JSON.parse(historyJson) as KronosHistoryRow[];
    } catch {
      return null;
    }
  }, [historyJson]);

  const handleSubmit = async () => {
    if (!parsedHistory || parsedHistory.length < 16) return;
    await analyzeForecast({ history: parsedHistory, pred_len: predLen, T: 1.0, top_p: 0.9, sample_count: 1 });
  };

  return (
    <div className="space-y-6 px-4 py-6 sm:px-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Kronos Forecast Demo</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Send OHLCV history to the Kronos Python service and view a prediction for the next candles. This page demonstrates the Next.js bridge and forecast output.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <label className="font-medium text-slate-900 dark:text-slate-100">History payload</label>
          <textarea
            value={historyJson}
            onChange={(event) => setHistoryJson(event.target.value)}
            className="h-[420px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
            {isLoading ? 'Running forecast…' : 'Run Kronos Forecast'}
          </button>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            <p className="font-semibold text-slate-900 dark:text-slate-100">Usage</p>
            <p className="mt-2">Provide at least 16 historical candles with ISO timestamps. The page will call the local Kronos service through <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">/api/forecast/kronos</code>.</p>
          </div>
        </div>
      </div>

      <KronosForecastPanel forecast={forecast} isLoading={isLoading} error={error} />
    </div>
  );
}
