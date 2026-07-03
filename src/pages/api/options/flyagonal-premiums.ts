import type { NextApiRequest, NextApiResponse } from 'next';
import { getOptionsChainPaged, type MassiveOptionContract } from '@/lib/massive';

export const config = { maxDuration: 25 };

function mid(c: MassiveOptionContract): number {
  const mp = c.last_quote?.midpoint;
  if (mp && mp > 0) return parseFloat(mp.toFixed(2));
  const bid = c.last_quote?.bid ?? 0;
  const ask = c.last_quote?.ask ?? 0;
  if (bid > 0 && ask > 0) return parseFloat(((bid + ask) / 2).toFixed(2));
  if (bid > 0) return parseFloat(bid.toFixed(2));
  const lastTrade = c.last_trade?.price ?? 0;
  if (lastTrade > 0) return parseFloat(lastTrade.toFixed(2));
  // Our data plan doesn't include options quotes/trades — fall back to the
  // day aggregate's latest price, which is populated regardless of plan tier.
  const dayClose = c.day?.close ?? 0;
  if (dayClose > 0) return parseFloat(dayClose.toFixed(2));
  return parseFloat((c.day?.vwap ?? 0).toFixed(2));
}

function nearestStrike(
  contracts: MassiveOptionContract[],
  target: number,
): MassiveOptionContract | null {
  if (!contracts.length) return null;
  const liquid = contracts.filter((c) => mid(c) > 0);
  const pool = liquid.length > 0 ? liquid : contracts;
  return pool.reduce((best, c) =>
    Math.abs(c.details.strike_price - target) < Math.abs(best.details.strike_price - target) ? c : best,
  );
}

// Fetches live bid/ask midpoints for specific strikes at specific expiries.
// Used by the Refresh button after manually adjusting strikes in the UI.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const {
    symbol: rawSym,
    frontExpiry,
    backExpiry,
    k1: rk1, k2: rk2, k3: rk3,
    k4: rk4, k5: rk5,
  } = req.query as Record<string, string>;

  const symbol = rawSym?.toUpperCase().trim();
  if (!symbol || !/^[A-Z]{1,10}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }
  if (!frontExpiry || !backExpiry) {
    return res.status(400).json({ error: 'frontExpiry and backExpiry are required' });
  }

  const k1 = parseFloat(rk1), k2 = parseFloat(rk2), k3 = parseFloat(rk3);
  const k4 = parseFloat(rk4), k5 = parseFloat(rk5);
  if ([k1, k2, k3, k4, k5].some((n) => !Number.isFinite(n) || n <= 0)) {
    return res.status(400).json({ error: 'All strike params (k1–k5) must be positive numbers' });
  }

  try {
    // Fetch calls (front) and puts (front + back) in parallel — each stops at 1 expiry
    const [{ contracts: calls }, { contracts: frontPuts }, { contracts: backPuts }] =
      await Promise.all([
        getOptionsChainPaged(
          symbol,
          { contract_type: 'call', 'expiration_date.gte': frontExpiry, sort: 'expiration_date', order: 'asc', limit: 250 },
          2, 1,
        ),
        getOptionsChainPaged(
          symbol,
          { contract_type: 'put', 'expiration_date.gte': frontExpiry, sort: 'expiration_date', order: 'asc', limit: 250 },
          2, 1,
        ),
        getOptionsChainPaged(
          symbol,
          { contract_type: 'put', 'expiration_date.gte': backExpiry, sort: 'expiration_date', order: 'asc', limit: 250 },
          2, 1,
        ),
      ]);

    const frontCalls = calls.filter((c) => c.details.expiration_date === frontExpiry);
    const filteredFrontPuts = frontPuts.filter((c) => c.details.expiration_date === frontExpiry);
    const filteredBackPuts  = backPuts.filter((c) => c.details.expiration_date === backExpiry);

    const k1c = nearestStrike(frontCalls, k1);
    const k2c = nearestStrike(frontCalls, k2);
    const k3c = nearestStrike(frontCalls, k3);
    const k4c = nearestStrike(filteredFrontPuts, k4);
    const k5c = nearestStrike(filteredBackPuts, k5);

    if (!k1c || !k2c || !k3c || !k4c || !k5c) {
      return res.status(404).json({ error: 'No matching strikes found for one or more legs. Check symbol liquidity.' });
    }

    const k1Mid   = mid(k1c);
    const k2Mid   = mid(k2c);
    const k3Mid   = mid(k3c);
    const netCredit = parseFloat((k2Mid * 2 - k1Mid - k3Mid).toFixed(2));
    const shortPrem = mid(k4c);
    const longPrem  = mid(k5c);

    const anyZero = [k1Mid, k2Mid, k3Mid, shortPrem, longPrem].some((p) => p === 0);

    return res.status(200).json({
      // Snapped to the nearest strike actually listed on the chain — may
      // differ from the requested k1–k5 if those exact strikes don't exist.
      k1: k1c.details.strike_price, k2: k2c.details.strike_price, k3: k3c.details.strike_price,
      k4: k4c.details.strike_price, k5: k5c.details.strike_price,
      k1Mid, k2Mid, k3Mid, netCredit,
      shortPrem, longPrem,
      fetchedAt: Date.now(),
      warning: anyZero ? 'Some premiums are $0 — no trade data for these strikes yet. Verify before trading.' : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: `Premium refresh failed: ${msg}` });
  }
}
