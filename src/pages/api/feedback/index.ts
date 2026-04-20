import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getSupabaseServiceRoleClient, getSupabaseClient } from '@/lib/supabase';

interface FeedbackRow {
  id: string;
  user_id: string | null;
  email: string;
  display_name: string | null;
  category: string;
  rating: number;
  message: string;
  status: string;
  created_at: string;
}

interface ApiResponse {
  success: boolean;
  data?: FeedbackRow | FeedbackRow[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'POST') {
    return handleSubmitFeedback(req, res, user);
  }

  if (req.method === 'GET') {
    return handleGetFeedback(req, res, user);
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

async function handleSubmitFeedback(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  user: { id: string; email?: string }
) {
  const { category, rating, message } = req.body as {
    category?: string;
    rating?: number;
    message?: string;
  };

  // Validation
  if (!category || !['bug', 'feature', 'general', 'other'].includes(category)) {
    return res.status(400).json({ success: false, error: 'Invalid category' });
  }
  const ratingNum = Number(rating);
  if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5' });
  }
  if (!message || message.trim().length < 10 || message.trim().length > 2000) {
    return res.status(400).json({ success: false, error: 'Message must be between 10 and 2000 characters' });
  }

  const supabase = getSupabaseServiceRoleClient() || getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' });
  }

  // Fetch display name from users table
  const { data: userRow } = await supabase
    .from('users')
    .select('display_name, email')
    .eq('id', user.id)
    .single();

  const { data, error } = await supabase
    .from('feedback')
    .insert({
      user_id: user.id,
      email: userRow?.email ?? user.email ?? '',
      display_name: userRow?.display_name ?? null,
      category,
      rating: ratingNum,
      message: message.trim(),
      status: 'new',
    })
    .select()
    .single();

  if (error) {
    console.error('[Feedback API] insert error:', error);
    return res.status(500).json({ success: false, error: 'Failed to submit feedback' });
  }

  return res.status(201).json({ success: true, data });
}

async function handleGetFeedback(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  user: { id: string }
) {
  // Only admins can list all feedback
  const supabase = getSupabaseServiceRoleClient() || getSupabaseClient();
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Database not configured' });
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userRow || userRow.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const { category, status, page } = req.query;
  const pageNum = Math.max(1, parseInt(String(page || '1'), 10));
  const pageSize = 25;
  const from = (pageNum - 1) * pageSize;

  let query = supabase
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }
  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Feedback API] fetch error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch feedback' });
  }

  return res.status(200).json({ success: true, data: data ?? [] });
}
