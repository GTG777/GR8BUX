import type { PlanId } from './planLimits';

export type BillingCycle = 'monthly' | 'annual';

export function getStripePriceId(planId: Exclude<PlanId, 'free'>, cycle: BillingCycle): string {
  const key = `STRIPE_PRICE_${planId.toUpperCase()}_${cycle.toUpperCase()}`;
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var ${key}`);
  return val;
}

// Reverse map: Stripe price ID → internal plan ID
// Built lazily at runtime from env vars
export function getPlanIdFromPriceId(priceId: string): PlanId | null {
  const plans: Array<Exclude<PlanId, 'free'>> = ['starter', 'pro', 'elite'];
  const cycles: BillingCycle[] = ['monthly', 'annual'];
  for (const plan of plans) {
    for (const cycle of cycles) {
      const key = `STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
      if (process.env[key] === priceId) return plan;
    }
  }
  return null;
}
