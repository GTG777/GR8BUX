import type { KronosForecastResponse } from '@/types/kronosForecast';

interface KronosForecastPanelProps {
  forecast?: KronosForecastResponse | null;
  isLoading?: boolean;
  error?: string | null;
}

export default function KronosForecastPanel({ forecast, isLoading, error }: KronosForecastPanelProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-slate-800">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Generating Kronos forecast…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm dark:border-red-700 dark:bg-red-950 dark:text-red-200">
        <strong>Forecast error:</strong> {error}
      </div>
    );
  }

  if (!forecast) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-slate-800">
        <p className="text-sm text-slate-500 dark:text-slate-400">No Kronos forecast has been generated yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-slate-800">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Kronos Forecast</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Model: {forecast.model} · Device: {forecast.device}</p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          {forecast.input_length} inputs · {forecast.pred_len} steps
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full text-left text-sm text-slate-700 dark:text-slate-200">
          <thead>
            <tr>
              <th className="px-3 py-2 font-medium">Timestamp</th>
              <th className="px-3 py-2 font-medium">Open</th>
              <th className="px-3 py-2 font-medium">High</th>
              <th className="px-3 py-2 font-medium">Low</th>
              <th className="px-3 py-2 font-medium">Close</th>
              <th className="px-3 py-2 font-medium">Vol</th>
            </tr>
          </thead>
          <tbody>
            {forecast.forecast.slice(0, 12).map((point) => (
              <tr key={point.timestamp} className="border-t border-slate-200 dark:border-slate-700">
                <td className="px-3 py-2 align-top text-xs text-slate-600 dark:text-slate-300">{new Date(point.timestamp).toLocaleString()}</td>
                <td className="px-3 py-2">{point.open.toFixed(2)}</td>
                <td className="px-3 py-2">{point.high.toFixed(2)}</td>
                <td className="px-3 py-2">{point.low.toFixed(2)}</td>
                <td className="px-3 py-2">{point.close.toFixed(2)}</td>
                <td className="px-3 py-2">{Math.round(point.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
