import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getStockSnapshot,
  getOptionsChainPaged,
  todayDateStr,
  type MassiveOptionContract,
} from '@/lib/massive';

export const config = { maxDuration: 25 };

function mid(c: MassiveOptionContract): number {
  const mp = c.last_quote?.midpoint;
  if (mp && mp > 0) return parseFloat(mp.toFixed(2));
  const bid = c.last_quote?.bid ?? 0;
  const ask = c.last_quote?.ask ?? 0;
  if (bid > 0 && ask > 0) return parseFloat(((bid + ask) / 2).toFixed(2));
  if (bid > 0) return parseFloat(bid.toFixed(2));
  return parseFloat((c.last_trade?.price ?? 0).toFixed(2));
}

function hasLiquidity(c: MassiveOptionContract): boolean {
  return mid(c) > 0;
}

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr + 'T21:00:00Z').getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function closestToTarget(expiries: string[], targetDTE: number): string | null {
  if (!expiries.length) return null;
  return expiries.reduce((best, exp) =>
    Math.abs(daysUntil(exp) - targetDTE) < Math.abs(daysUntil(best) - targetDTE) ? exp : best,
  );
}

function nearestStrike(
  contracts: MassiveOptionContract[],
  target: number,
): MassiveOptionContract | null {
  if (!contracts.length) return null;
  // Prefer liquid contracts; fall back to any if none have quotes
  const pool = contracts.filter(hasLiquidity).length > 0
    ? contracts.filter(hasLiquidity)
    : contracts;
  return pool.reduce((best, c) =>
    Math.abs(c.details.strike_price - target) < Math.abs(best.details.strike_price - target) ? c : best,
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const symbol = (req.query.symbol as string)?.toUpperCase().trim();
  if (!symbol || !/^[A-Z]{1,10}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  try {
    // ── 1. Current price ────────────────────────────────────────────
    const snap = await getStockSnapshot(symbol);
    const price = snap.day?.c ?? snap.day?.vw ?? snap.prevDay?.c ?? 0;
    if (!price) {
      return res.status(404).json({ error: `No price data for ${symbol}` });
    }

    const today = todayDateStr();

    // ── 2. Discover expiry dates via call chain (stop at 4 expirations) ──
    const { contracts: calls } = await getOptionsChainPaged(
      symbol,
      {
        contract_type: 'call',
        'expiration_date.gte': today,
        sort: 'expiration_date',
        order: 'asc',
        limit: 250,
      },
      4,
      4,
    );

    const callExpiries = [...new Set(calls.map((c) => c.details.expiration_date))].sort();
    if (!callExpiries.length) {
      return res.status(404).json({
        error: `No options chain found for ${symbol}. Use a more liquid underlying (SPY, QQQ, SPX, NVDA, etc.)`,
      });
    }

    // Front ~9 DTE, back ~17 DTE
    const frontExpiry = closestToTarget(callExpiries, 9);
    const backExpiry  = closestToTarget(callExpiries.filter((e) => e !== frontExpiry), 17)
      ?? callExpiries[callExpiries.length - 1];

    if (!frontExpiry) {
      return res.status(404).json({ error: 'Could not find a suitable front-month expiry' });
    }

    // ── 3. BWB call strikes (all from front expiry) ─────────────────
    const frontCalls = calls.filter((c) => c.details.expiration_date === frontExpiry);

    // Placement rules from strategy:
    // K1 = lowest long call, just above current price (0.3-0.5% above)
    // K2 = center short calls, about 1× wing-width above K1
    // K3 = upper long call, 1.2× wing-width above K2 (broken wing — wider upside)
    const wingPts = Math.max(1, parseFloat((price * 0.009).toFixed(0)));
    const k1Target = price + wingPts * 0.4;
    const k2Target = price + wingPts * 1.4;
    const k3Target = price + wingPts * 1.4 + wingPts * 1.2;

    const k1c = nearestStrike(frontCalls, k1Target);
    const k2c = nearestStrike(frontCalls, k2Target);
    const k3c = nearestStrike(frontCalls, k3Target);

    if (!k1c || !k2c || !k3c) {
      return res.status(404).json({
        error: 'Not enough call strikes for the BWB. Check symbol liquidity.',
      });
    }

    const k1 = k1c.details.strike_price;
    const k2 = k2c.details.strike_price;
    const k3 = k3c.details.strike_price;
    const k1Mid = mid(k1c);
    const k2Mid = mid(k2c);
    const k3Mid = mid(k3c);
    const netCredit = parseFloat((k2Mid * 2 - k1Mid - k3Mid).toFixed(2));

    // ── 4. Put diagonal (front + back expiry) ───────────────────────
    const { contracts: puts } = await getOptionsChainPaged(
      symbol,
      {
        contract_type: 'put',
        'expiration_date.gte': frontExpiry,
        'expiration_date.lte': backExpiry,
        sort: 'expiration_date',
        order: 'asc',
        limit: 250,
      },
      4,
      2,
    );

    // Short put: ~3% below market (strategy rule)
    const k4Target   = price * 0.97;
    const frontPuts  = puts.filter((c) => c.details.expiration_date === frontExpiry);
    const backPuts   = puts.filter((c) => c.details.expiration_date === backExpiry);

    const shortPutC = nearestStrike(frontPuts, k4Target);
    const longPutC  = nearestStrike(backPuts.length ? backPuts : frontPuts, k4Target);

    if (!shortPutC || !longPutC) {
      return res.status(404).json({
        error: 'Not enough put strikes for the diagonal. Check symbol liquidity.',
      });
    }

    const k4       = shortPutC.details.strike_price;
    const k5       = longPutC.details.strike_price;
    const shortPrem = mid(shortPutC);
    const longPrem  = mid(longPutC);

    // ── 5. Warnings ──────────────────────────────────────────────────
    const warnings: string[] = [];
    const frontDTE = daysUntil(frontExpiry);
    const backDTE  = daysUntil(backExpiry);

    if (frontDTE < 6 || frontDTE > 12) {
      warnings.push(`Front expiry is ${frontDTE} DTE — ideal range is 8–10 DTE. Consider waiting for a closer expiry.`);
    }
    if (backDTE < frontDTE + 5) {
      warnings.push('Back-month expiry is close to front — time spread may be too narrow for the diagonal.');
    }
    if (netCredit < 0) {
      warnings.push('BWB entered for a debit — consider adjusting strikes or checking liquidity.');
    }
    if (k2 - k1 >= k3 - k2) {
      warnings.push('Upper wing is not wider than lower wing — not a true broken wing. Widen K3.');
    }
    const zeroQuote = [k1Mid, k2Mid, k3Mid, shortPrem, longPrem].filter((p) => p === 0);
    if (zeroQuote.length > 0) {
      warnings.push('Some premiums are $0 — market may be closed or options illiquid. Verify before trading.');
    }

    return res.status(200).json({
      symbol,
      price: parseFloat(price.toFixed(2)),
      fetchedAt: Date.now(),
      bwb: {
        expiry: frontExpiry,
        dte: frontDTE,
        k1, k1Mid,
        k2, k2Mid,
        k3, k3Mid,
        netCredit,
        lowerWing: parseFloat((k2 - k1).toFixed(2)),
        upperWing: parseFloat((k3 - k2).toFixed(2)),
      },
      diagonal: {
        frontExpiry,
        backExpiry,
        frontDte: frontDTE,
        backDte: backDTE,
        k4, shortPrem,
        k5, longPrem,
        netDebit: parseFloat((longPrem - shortPrem).toFixed(2)),
      },
      warnings,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: `Setup fetch failed: ${msg}` });
  }
}
