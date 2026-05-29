import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { getStripe } from '@/lib/stripe';
import { getStripePriceId, type BillingCycle } from '@/lib/stripePrices';
import type { PlanId } from '@/lib/planLimits';
import type { ApiResponse } from '@/types';

interface Body {
  planId: Exclude<PlanId, 'free'>;
  cycle: BillingCycle;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<{ url: string }>>,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { planId, cycle } = req.body as Body;
  if (!planId || !cycle || (planId as string) === 'free') {
    return res.status(400).json({ success: false, error: 'planId and cycle are required' });
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'DB not configured' });
  }

  const stripe = getStripe();
  const origin = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000';

  // Look up or create Stripe customer
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  let customerId = sub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await supabase
      .from('subscriptions')
      .upsert({ user_id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  }

  let priceId: string;
  try {
    priceId = getStripePriceId(planId, cycle);
  } catch {
    return res.status(500).json({ success: false, error: 'Stripe price not configured for this plan' });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { userId: user.id, planId },
    },
    success_url: `${origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${origin}/pricing`,
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return res.status(500).json({ success: false, error: 'Failed to create checkout session' });
  }

  return res.status(200).json({ success: true, data: { url: session.url } });
}
