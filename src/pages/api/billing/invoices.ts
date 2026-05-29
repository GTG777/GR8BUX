import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { getStripe } from '@/lib/stripe';
import type { ApiResponse } from '@/types';

export interface InvoiceItem {
  id: string;
  date: string;
  amount: number;
  status: string;
  planName: string;
  pdfUrl: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<InvoiceItem[]>>,
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
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data?.stripe_customer_id) {
    return res.status(200).json({ success: true, data: [] });
  }

  const stripe = getStripe();
  const invoices = await stripe.invoices.list({
    customer: data.stripe_customer_id,
    limit: 24,
  });

  const items: InvoiceItem[] = invoices.data.map((inv) => ({
    id:       inv.number ?? inv.id,
    date:     new Date(inv.created * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    amount:   (inv.amount_paid ?? 0) / 100,
    status:   inv.status ?? 'unknown',
    planName: inv.lines.data[0]?.description?.split(' ')[0] ?? 'GR8BUX',
    pdfUrl:   inv.invoice_pdf ?? null,
  }));

  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).json({ success: true, data: items });
}
