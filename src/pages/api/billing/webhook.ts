import type { NextApiRequest, NextApiResponse } from 'next';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { getPlanIdFromPriceId } from '@/lib/stripePrices';
import type { PlanId } from '@/lib/planLimits';

// Stripe requires the raw body for signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function syncSubscription(
  supabase: ReturnType<typeof import('@/lib/supabase').getSupabaseServiceRoleClient>,
  subscription: Stripe.Subscription,
  userId?: string,
) {
  if (!supabase) return;

  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? null;
  const planId: PlanId  = (priceId ? getPlanIdFromPriceId(priceId) : null) ?? 'free';
  const interval = item?.price.recurring?.interval;
  const cycle = interval === 'year' ? 'annual' : 'monthly';

  // In Stripe dahlia API, current_period_start/end moved to the item level
  const periodStart = item?.current_period_start ?? null;
  const periodEnd   = item?.current_period_end   ?? null;

  // Resolve userId: from subscription metadata (set at checkout) or from existing row
  let uid = userId ?? (subscription.metadata?.userId as string | undefined);
  if (!uid) {
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', subscription.id)
      .maybeSingle();
    uid = data?.user_id;
  }
  if (!uid) return;

  await supabase.from('subscriptions').upsert(
    {
      user_id:                 uid,
      plan_id:                 subscription.status === 'canceled' ? 'free' : planId,
      status:                  subscription.status,
      billing_cycle:           subscription.status === 'canceled' ? null : cycle,
      stripe_customer_id:      subscription.customer as string,
      stripe_subscription_id:  subscription.id,
      stripe_price_id:         priceId,
      current_period_start:    periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end:      periodEnd   ? new Date(periodEnd   * 1000).toISOString() : null,
      cancel_at_period_end:    subscription.cancel_at_period_end,
      trial_end:               subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      updated_at:              new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end('Method not allowed');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !webhookSecret) {
    return res.status(400).end('Missing signature or webhook secret');
  }

  const rawBody = await getRawBody(req);
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', (err as Error).message);
    return res.status(400).end(`Webhook error: ${(err as Error).message}`);
  }

  const supabase = getSupabaseServiceRoleClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;
        const subscription = await getStripe().subscriptions.retrieve(session.subscription as string);
        await syncSubscription(supabase, subscription, session.metadata?.userId ?? undefined);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscription(supabase, subscription);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (!supabase || !invoice.customer) break;
        await supabase
          .from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('stripe_customer_id', invoice.customer as string);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if (!supabase || !invoice.customer) break;
        await supabase
          .from('subscriptions')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('stripe_customer_id', invoice.customer as string)
          .eq('status', 'past_due');
        break;
      }
    }
  } catch (err) {
    console.error(`[webhook] Error handling ${event.type}:`, err);
    // Return 200 anyway so Stripe doesn't retry on our internal errors
  }

  return res.status(200).json({ received: true });
}
