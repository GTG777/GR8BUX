import type { NextApiRequest, NextApiResponse } from 'next';
import technicalService, { PriceData } from '@/lib/technicalService';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { symbol, prices } = req.body;

  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ success: false, error: 'Symbol is required' });
  }

  let priceData: PriceData[];
  try {
    priceData = typeof prices === 'string' ? JSON.parse(prices) : prices;
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid prices format' });
  }

  if (!Array.isArray(priceData) || priceData.length < 10) {
    return res.status(400).json({ success: false, error: 'At least 10 price points required' });
  }

  try {
    const analysis = technicalService.analyzeSMC(symbol.toUpperCase(), priceData);
    return res.status(200).json({ success: true, data: analysis });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to analyze SMC patterns' });
  }
}
