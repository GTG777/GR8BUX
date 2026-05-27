import { useCallback, useState } from 'react';
import type { KronosForecastRequest, KronosForecastResponse } from '@/types/kronosForecast';

export function useKronosForecast() {
  const [forecast, setForecast] = useState<KronosForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeForecast = useCallback(async (request: KronosForecastRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/forecast/kronos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        const message = payload?.error || 'Forecast request failed.';
        setError(message);
        setForecast(null);
        return null;
      }

      setForecast(payload.data as KronosForecastResponse);
      return payload.data as KronosForecastResponse;
    } catch (err: any) {
      const message = err?.message || 'Unable to fetch Kronos forecast.';
      setError(message);
      setForecast(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    forecast,
    isLoading,
    error,
    analyzeForecast,
  };
}
