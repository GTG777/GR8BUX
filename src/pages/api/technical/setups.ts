import type { NextApiRequest, NextApiResponse } from 'next';
import technicalService from '@/lib/technicalService';

/**
 * POST /api/technical/setups
 * Body: { symbol: string, prices: PriceData[] }
 * Analyzes price data for technical setups (coiling, consolidation, etc)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    const { symbol, prices: pricesParam } = req.body;

    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'symbol is required',
      });
    }

    if (!pricesParam) {
      return res.status(400).json({
        success: false,
        error: 'prices array is required',
      });
    }

    let prices: any[] = [];

    if (typeof pricesParam === 'string') {
      try {
        prices = JSON.parse(pricesParam);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid prices format (must be JSON array)',
        });
      }
    } else if (Array.isArray(pricesParam)) {
      prices = pricesParam;
    }

    // Validate price data
    if (prices.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'At least 20 price points are required for analysis',
      });
    }

    // Normalize price data
    const normalizedPrices = prices.map((p: any) => ({
      date: p.date || new Date().toISOString(),
      open: parseFloat(p.open || p.o || 0),
      high: parseFloat(p.high || p.h || 0),
      low: parseFloat(p.low || p.l || 0),
      close: parseFloat(p.close || p.c || 0),
      volume: parseFloat(p.volume || p.v || 0),
    }));

    // Analyze setups
    const setups = technicalService.analyzeSetups(symbol.toUpperCase(), normalizedPrices);

    // Calculate additional indicators
    const closes = normalizedPrices.map((p) => p.close);
    const rsi = technicalService.calculateRSI(closes, 14);

    res.status(200).json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        rsi: rsi.toFixed(2),
        rsiStatus: rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral',
        setupCount: setups.length,
        setups: setups.map((setup) => ({
          setupType: setup.setupType,
          confidence: setup.confidence,
          description: setup.description,
          formation: setup.formation,
          entryPrice: setup.entryPrice?.toFixed(2),
          stopLoss: setup.stopLoss?.toFixed(2),
          targetPrice: setup.targetPrice?.toFixed(2),
          riskReward: setup.entryPrice && setup.targetPrice && setup.stopLoss 
            ? ((setup.targetPrice - setup.entryPrice) / (setup.entryPrice - setup.stopLoss)).toFixed(2)
            : null,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze technical setups',
    });
  }
}
