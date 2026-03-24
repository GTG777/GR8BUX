import type { NextApiRequest, NextApiResponse } from 'next';
import { calculateCallGreeks, calculatePutGreeks, BlackScholesInputs } from '@/lib/greeks';
import { ApiResponse, OptionGreeks } from '@/types';

interface GreeksRequest extends BlackScholesInputs {
  optionType: 'call' | 'put';
  quantity?: number;
}

interface GreeksResponse {
  greeks: OptionGreeks;
  inputs: {
    optionType: string;
    quantity: number;
    spotPrice: number;
    strikePrice: number;
    timeToExpirationDays: number;
    volatility: string; // Percentage
    riskFreeRate: string; // Percentage
  };
}

/**
 * POST: Calculate option Greeks using Black-Scholes model
 * Body: {
 *   optionType: 'call' | 'put',
 *   spotPrice: number,
 *   strikePrice: number,
 *   timeToExpiration: number (years),
 *   volatility: number (e.g., 0.25 for 25%),
 *   riskFreeRate?: number (default 0.05),
 *   dividendYield?: number (default 0),
 *   quantity?: number (default 1)
 * }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<GreeksResponse | string>>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  try {
    const {
      optionType,
      spotPrice,
      strikePrice,
      timeToExpiration,
      volatility,
      riskFreeRate = 0.05,
      dividendYield = 0,
      quantity = 1,
    }: GreeksRequest = req.body;

    // Validation
    const errors: string[] = [];

    if (!optionType || !['call', 'put'].includes(optionType)) {
      errors.push('optionType is required and must be "call" or "put"');
    }

    if (typeof spotPrice !== 'number' || spotPrice <= 0) {
      errors.push('spotPrice must be a positive number');
    }

    if (typeof strikePrice !== 'number' || strikePrice <= 0) {
      errors.push('strikePrice must be a positive number');
    }

    if (typeof timeToExpiration !== 'number' || timeToExpiration <= 0) {
      errors.push('timeToExpiration must be a positive number (in years)');
    }

    if (typeof volatility !== 'number' || volatility <= 0 || volatility > 5) {
      errors.push('volatility must be between 0 and 5 (e.g., 0.25 for 25%)');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join('; '),
      });
    }

    // Calculate Greeks
    let greeks: OptionGreeks;

    if (optionType === 'call') {
      greeks = calculateCallGreeks({
        spotPrice,
        strikePrice,
        timeToExpiration,
        volatility,
        riskFreeRate,
        dividendYield,
      });
    } else {
      greeks = calculatePutGreeks({
        spotPrice,
        strikePrice,
        timeToExpiration,
        volatility,
        riskFreeRate,
        dividendYield,
      });
    }

    // Adjust for quantity and contract multiplier (100 shares per contract)
    const adjustedGreeks: OptionGreeks = {
      delta: greeks.delta * quantity * 100,
      gamma: greeks.gamma * quantity * 100,
      theta: greeks.theta * quantity * 100,
      vega: greeks.vega * quantity * 100,
      rho: greeks.rho ? greeks.rho * quantity * 100 : undefined,
      premium: greeks.premium ? greeks.premium * quantity * 100 : undefined,
    };

    const response: GreeksResponse = {
      greeks: adjustedGreeks,
      inputs: {
        optionType,
        quantity,
        spotPrice,
        strikePrice,
        timeToExpirationDays: Math.round(timeToExpiration * 365),
        volatility: `${(volatility * 100).toFixed(2)}%`,
        riskFreeRate: `${(riskFreeRate * 100).toFixed(2)}%`,
      },
    };

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    console.error('[Greeks API Error]', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
