import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseClient, getSupabaseServiceRoleClient } from '@/lib/supabase';
import { AuthUser } from '@/types';

interface ApiResponse {
  success: boolean;
  data?: AuthUser;
  error?: string;
}

/**
 * PUT /api/admin/users/:id - Update user role (admin only)
 * Body: { role: 'admin' | 'manager' | 'user' }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'PUT') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    const { id } = req.query;
    const { role } = req.body;

    // Validate input
    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    if (!role || !['admin', 'manager', 'user'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Valid role is required (admin, manager, or user)',
      });
    }

    // Get auth header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing authentication token',
      });
    }

    const token = authHeader.substring(7);

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }
    // Use service role for all writes so they work after RLS is enabled
    const serviceSupabase = getSupabaseServiceRoleClient() || supabase;

    // Verify token with Supabase
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    // Check if requesting user is admin (service role bypasses RLS)
    const { data: requesterData, error: requesterError } = await serviceSupabase
      .from('users')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    if (requesterError || !requesterData || requesterData.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    // Update user role (service role bypasses RLS)
    const { data: updatedUser, error: updateError } = await serviceSupabase
      .from('users')
      .update({ role })
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updatedUser) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update user role',
      });
    }

    // Log the role change
    await serviceSupabase.from('auth_logs').insert({
      user_id: id,
      email: updatedUser.email,
      event_type: 'role_changed',
    });

    const user: AuthUser = {
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role || 'user',
      emailVerified: updatedUser.email_verified || false,
      lastSignIn: updatedUser.last_sign_in,
      createdAt: updatedUser.created_at,
      updatedAt: updatedUser.updated_at,
    };

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
