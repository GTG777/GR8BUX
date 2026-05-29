import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { PLAN_IDS, type PlanId } from '@/lib/planLimits';
import type { ApiResponse } from '@/types';

interface SubscriberRow {
  userId: string;
  email: string;
  displayName: string | null;
  planId: PlanId;
  status: string;
  billingCycle: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

interface StatsRow {
  planId: PlanId;
  count: number;
}

async function requireAdmin(req: NextApiRequest, res: NextApiResponse): Promise<boolean> {
  const user = await requireAuth(req, res);
  if (!user) return false;
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) { res.status(503).json({ success: false, error: 'DB not configured' }); return false; }
  const { data } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (data?.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return false;
  }
  return true;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<unknown>>,
) {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return res.status(500).json({ success: false, error: 'DB not configured' });

  // ── GET: list all subscribers with stats ───────────────────────────────────
  if (req.method === 'GET') {
    if (!await requireAdmin(req, res)) return;

    const { data: rows, error } = await supabase
      .from('subscriptions')
      .select(`
        user_id,
        plan_id,
        status,
        billing_cycle,
        current_period_end,
        cancel_at_period_end,
        created_at,
        users!inner (email, display_name)
      `)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ success: false, error: error.message });

    const subscribers: SubscriberRow[] = (rows ?? []).map((r: any) => ({
      userId:            r.user_id,
      email:             r.users?.email ?? '',
      displayName:       r.users?.display_name ?? null,
      planId:            r.plan_id as PlanId,
      status:            r.status,
      billingCycle:      r.billing_cycle ?? null,
      currentPeriodEnd:  r.current_period_end ?? null,
      cancelAtPeriodEnd: r.cancel_at_period_end ?? false,
      createdAt:         r.created_at,
    }));

    // Summary stats
    const stats: StatsRow[] = PLAN_IDS.map((planId) => ({
      planId,
      count: subscribers.filter((s) => s.planId === planId && s.status === 'active').length,
    }));
    const mrr = subscribers.reduce((sum, s) => {
      if (s.status !== 'active' && s.status !== 'trialing') return sum;
      const monthly = s.planId === 'starter' ? 12 : s.planId === 'pro' ? 29 : s.planId === 'elite' ? 59 : 0;
      return sum + (s.billingCycle === 'annual' ? monthly * 0.79 : monthly);
    }, 0);

    return res.status(200).json({ success: true, data: { subscribers, stats, mrr: Math.round(mrr) } });
  }

  // ── POST: override plan for a user ─────────────────────────────────────────
  if (req.method === 'POST') {
    if (!await requireAdmin(req, res)) return;

    const { userId, planId, reason } = req.body as { userId?: string; planId?: PlanId; reason?: string };
    if (!userId || !planId || !(PLAN_IDS as readonly string[]).includes(planId)) {
      return res.status(400).json({ success: false, error: 'userId and valid planId are required' });
    }

    const { error } = await supabase
      .from('subscriptions')
      .upsert(
        {
          user_id:    userId,
          plan_id:    planId,
          status:     'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (error) return res.status(500).json({ success: false, error: error.message });

    console.log(`[admin] Plan override: user=${userId} plan=${planId} reason=${reason ?? 'none'}`);
    return res.status(200).json({ success: true, data: { userId, planId } });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
