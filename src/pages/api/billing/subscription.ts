import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { PLAN_LIMITS, type PlanId } from '@/lib/planLimits';
import { getMonthlyUsage } from '@/lib/usageTracking';
import type { ApiResponse } from '@/types';

export interface SubscriptionResponse {
  planId: PlanId;
  status: string;
  billingCycle: 'monthly' | 'annual' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  limits: typeof PLAN_LIMITS[PlanId];
  usage: Awaited<ReturnType<typeof getMonthlyUsage>>;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<SubscriptionResponse>>,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'DB not configured' });
  }

  const { data } = await supabase
    .from('subscriptions')
    .select('plan_id, status, billing_cycle, current_period_end, cancel_at_period_end, trial_end')
    .eq('user_id', user.id)
    .maybeSingle();

  const planId: PlanId = (data?.plan_id as PlanId) ?? 'free';
  const usage = await getMonthlyUsage(user.id);

  res.setHeader('Cache-Control', 'private, max-age=60');
  return res.status(200).json({
    success: true,
    data: {
      planId,
      status:             data?.status            ?? 'active',
      billingCycle:       data?.billing_cycle      ?? null,
      currentPeriodEnd:   data?.current_period_end ?? null,
      cancelAtPeriodEnd:  data?.cancel_at_period_end ?? false,
      trialEnd:           data?.trial_end          ?? null,
      limits:             PLAN_LIMITS[planId],
      usage,
    },
  });
}
