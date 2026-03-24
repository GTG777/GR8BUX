import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  lastSignIn: string | null;
}

interface ApiResponse {
  success: boolean;
  data?: User[];
  error?: string;
}

/**
 * GET /api/admin/users - Get all users (admin only)
 * Requires Authorization header with Supabase JWT token
 * User making request must have 'admin' role
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    // Get auth header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing authentication token',
      });
    }

    const token = authHeader.substring(7);

    // Verify token with Supabase
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    // Check if user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    if (userError || !userData || userData.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (usersError) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch users',
      });
    }

    const mappedUsers: User[] = (users || []).map((u: any) => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name || 'N/A',
      role: u.role || 'user',
      emailVerified: u.email_verified || false,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in,
    }));

    res.status(200).json({
      success: true,
      data: mappedUsers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
