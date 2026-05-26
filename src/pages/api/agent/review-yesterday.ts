import type { NextApiRequest, NextApiResponse } from 'next';
import { getTradingAgentDashboard } from '@/lib/agents/tradingAgent';
import type { ApiResponse } from '@/types';
import type { TradingAgentReview } from '@/types/tradingAgent';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<TradingAgentReview>>,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    const dashboard = await getTradingAgentDashboard();
    return res.status(200).json({ success: true, data: dashboard.latestReview });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to run trading agent review';
    return res.status(500).json({ success: false, error: message });
  }
}
