import type { NextApiRequest, NextApiResponse } from 'next';
import type { ApiResponse } from '@/types';
import type { KronosForecastResponse } from '@/types/kronosForecast';

const KRONOS_API_URL = process.env.KRONOS_API_URL || 'http://localhost:8000';
const KRONOS_FORECAST_ENDPOINT = `${KRONOS_API_URL.replace(/\/$/, '')}/forecast`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<KronosForecastResponse | null>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  const { history, pred_len } = req.body;
  if (!Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ success: false, error: 'Request body must include a non-empty history array.' });
  }

  try {
    const response = await fetch(KRONOS_FORECAST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const payload = await response.json();

    if (!response.ok || payload?.success !== true) {
      const message = payload?.detail || payload?.error || 'Kronos service failed.';
      return res.status(response.status === 200 ? 502 : response.status).json({ success: false, error: message });
    }

    return res.status(200).json({ success: true, data: payload as KronosForecastResponse });
  } catch (error: any) {
    console.error('[Kronos Forecast API Error]', error);
    return res.status(502).json({ success: false, error: error?.message || 'Unable to connect to Kronos service.' });
  }
}
