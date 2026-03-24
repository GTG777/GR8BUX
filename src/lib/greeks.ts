import { GreeksData } from '@/types';

/**
 * Calculate option Greeks using Black-Scholes model approximation
 * This is a simplified implementation. For production, consider using a proper library.
 */

const PI = Math.PI;
const SQRT_2PI = Math.sqrt(2 * PI);

// Cumulative normal distribution function
function normCDF(x: number): number {
  // Using error function approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));

  return 0.5 * (1.0 + sign * y);
}

// Probability density function
function normPDF(x: number): number {
  return (1 / SQRT_2PI) * Math.exp(-0.5 * x * x);
}

export interface BlackScholesInputs {
  spotPrice: number; // S - current stock price
  strikePrice: number; // K - strike price
  timeToExpiration: number; // T - time to expiration in years (days/365)
  volatility: number; // σ - annualized volatility (0.2 = 20%)
  riskFreeRate?: number; // r - risk-free interest rate
  dividendYield?: number; // q - dividend yield
}

export interface OptionGreeks extends GreeksData {
  premium?: number;
}

/**
 * Calculate d1 and d2 from Black-Scholes formula
 */
function calculateD1D2(inputs: BlackScholesInputs): [number, number] {
  const { spotPrice, strikePrice, timeToExpiration, volatility, riskFreeRate = 0.05, dividendYield = 0 } = inputs;

  const numerator =
    Math.log(spotPrice / strikePrice) +
    (riskFreeRate - dividendYield + 0.5 * volatility * volatility) *
      timeToExpiration;
  const denominator = volatility * Math.sqrt(timeToExpiration);

  const d1 = numerator / denominator;
  const d2 = d1 - denominator;

  return [d1, d2];
}

/**
 * Calculate Call option Greeks
 */
export function calculateCallGreeks(inputs: BlackScholesInputs): OptionGreeks {
  const { spotPrice, strikePrice, timeToExpiration, volatility, riskFreeRate = 0.05, dividendYield = 0 } = inputs;

  const [d1, d2] = calculateD1D2(inputs);

  const delta = Math.exp(-dividendYield * timeToExpiration) * normCDF(d1);
  const gamma =
    Math.exp(-dividendYield * timeToExpiration) /
    (spotPrice * volatility * Math.sqrt(timeToExpiration)) *
    normPDF(d1);
  const vega =
    (spotPrice * Math.exp(-dividendYield * timeToExpiration) * normPDF(d1) *
      Math.sqrt(timeToExpiration)) /
    100; // Per 1% change in volatility

  let theta =
    (-spotPrice * Math.exp(-dividendYield * timeToExpiration) * normPDF(d1) * volatility) /
      (2 * Math.sqrt(timeToExpiration)) -
    riskFreeRate *
      strikePrice *
      Math.exp(-riskFreeRate * timeToExpiration) *
      normCDF(d2);
  theta = theta / 365; // Per day

  const rho = strikePrice * timeToExpiration * Math.exp(-riskFreeRate * timeToExpiration) * normCDF(d2) / 100;

  // Black-Scholes call premium
  const premium =
    spotPrice * Math.exp(-dividendYield * timeToExpiration) * normCDF(d1) -
    strikePrice * Math.exp(-riskFreeRate * timeToExpiration) * normCDF(d2);

  return {
    delta,
    gamma,
    vega,
    theta,
    rho,
    premium,
  };
}

/**
 * Calculate Put option Greeks
 */
export function calculatePutGreeks(inputs: BlackScholesInputs): OptionGreeks {
  const { strikePrice, timeToExpiration, riskFreeRate = 0.05 } = inputs;

  const [d1, d2] = calculateD1D2(inputs);

  const callGreeks = calculateCallGreeks(inputs);

  // Put-Call parity relationships
  const delta = callGreeks.delta - 1;
  const gamma = callGreeks.gamma;
  const vega = callGreeks.vega;
  const theta =
    -callGreeks.theta -
    (riskFreeRate * strikePrice * Math.exp(-riskFreeRate * timeToExpiration) * normCDF(-d2)) /
      365;
  const rho = -strikePrice * timeToExpiration * Math.exp(-riskFreeRate * timeToExpiration) * normCDF(-d2) / 100;

  // Black-Scholes put premium
  const premium =
    strikePrice * Math.exp(-riskFreeRate * timeToExpiration) * normCDF(-d2) -
    inputs.spotPrice * Math.exp(-(((inputs.dividendYield || 0) * timeToExpiration))) * normCDF(-d1);

  return {
    delta,
    gamma,
    vega,
    theta,
    rho,
    premium,
  };
}

/**
 * Calculate Greeks for options with multiplicity
 */
export function adjustGreeksForMultiplier(
  greeks: OptionGreeks,
  quantity: number,
  contractMultiplier: number = 100
): OptionGreeks {
  return {
    delta: greeks.delta * quantity * contractMultiplier,
    gamma: greeks.gamma * quantity * contractMultiplier,
    theta: greeks.theta * quantity * contractMultiplier,
    vega: greeks.vega * quantity * contractMultiplier,
    rho: greeks.rho ? greeks.rho * quantity * contractMultiplier : undefined,
    premium: greeks.premium ? greeks.premium * quantity * contractMultiplier : undefined,
  };
}

/**
 * Estimate volatility from historical prices (simplified)
 */
export function estimateHistoricalVolatility(prices: number[], periods: number = 20): number {
  if (prices.length < 2) return 0.2; // Default to 20% if insufficient data

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  const mean = returns.reduce((a, b) => a + b) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  // Annualize volatility
  return stdDev * Math.sqrt(periods);
}
