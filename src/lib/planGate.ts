import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { getSupabaseServiceRoleClient } from './supabase';
import { PLAN_LIMITS, getMinPlanForFeature, type PlanId, type PlanFeatures } from './planLimits';
import { checkUsageLimit, type UsageMetric } from './usageTracking';

export interface SubscriptionRow {
  plan_id: PlanId;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  stripe_customer_id: string | null;
}

// Cached for the duration of the request — fetched once per API call
const _cache = new Map<string, SubscriptionRow>();

export async function getSubscription(userId: string): Promise<SubscriptionRow> {
  if (_cache.has(userId)) return _cache.get(userId)!;

  const supabase = getSupabaseServiceRoleClient();
  const fallback: SubscriptionRow = {
    plan_id: 'free', status: 'active', current_period_end: null,
    cancel_at_period_end: false, trial_end: null, stripe_customer_id: null,
  };
  if (!supabase) return fallback;

  const { data } = await supabase
    .from('subscriptions')
    .select('plan_id, status, current_period_end, cancel_at_period_end, trial_end, stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  const row: SubscriptionRow = data
    ? { ...fallback, ...data, plan_id: (data.plan_id as PlanId) ?? 'free' }
    : fallback;

  _cache.set(userId, row);
  return row;
}

// Call this at the start of each request handler to clear stale cache
export function clearSubscriptionCache(userId: string): void {
  _cache.delete(userId);
}

function isAdmin(user: User): boolean {
  return (user as any).role === 'admin' || (user.app_metadata?.role === 'admin');
}

export async function requirePlanFeature(
  req: NextApiRequest,
  res: NextApiResponse,
  user: User,
  feature: keyof PlanFeatures,
): Promise<boolean> {
  if (isAdmin(user)) return true;

  const sub = await getSubscription(user.id);
  const planId = sub.plan_id ?? 'free';
  const active = sub.status === 'active' || sub.status === 'trialing';

  if (!active || !PLAN_LIMITS[planId].features[feature]) {
    const requiredPlan = getMinPlanForFeature(feature);
    res.status(403).json({
      success: false,
      error: 'upgrade_required',
      requiredPlan,
      currentPlan: planId,
    });
    return false;
  }
  return true;
}

export async function requireUsageQuota(
  req: NextApiRequest,
  res: NextApiResponse,
  user: User,
  metric: UsageMetric,
): Promise<boolean> {
  if (isAdmin(user)) return true;

  const sub = await getSubscription(user.id);
  const planId = sub.plan_id ?? 'free';
  const { allowed, used, limit } = await checkUsageLimit(user.id, metric, planId);

  if (!allowed) {
    res.status(429).json({
      success: false,
      error: 'usage_limit_reached',
      metric,
      used,
      limit,
      planId,
    });
    return false;
  }
  return true;
}
