import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { getStripe } from '@/lib/stripe';
import type { ApiResponse } from '@/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<{ url: string }>>,
) {
  if (req.method !== 'POST') {
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
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data?.stripe_customer_id) {
    return res.status(400).json({ success: false, error: 'No billing account found. Subscribe to a plan first.' });
  }

  const stripe = getStripe();
  const origin = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000';

  const session = await stripe.billingPortal.sessions.create({
    customer:   data.stripe_customer_id,
    return_url: `${origin}/billing`,
  });

  return res.status(200).json({ success: true, data: { url: session.url } });
}
