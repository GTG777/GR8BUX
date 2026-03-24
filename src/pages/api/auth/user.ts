import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
import { AuthUser } from '@/types';

interface ApiResponse {
  success: boolean;
  data?: AuthUser;
  error?: string;
}

/**
 * GET /api/auth/user - Get current authenticated user
 * Requires Authorization header with Supabase JWT token
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
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    // Get user profile with role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (userError || !userData) {
      return res.status(404).json({
        success: false,
        error: 'User profile not found',
      });
    }

    const user: AuthUser = {
      id: userData.id,
      email: userData.email,
      role: userData.role || 'user',
      emailVerified: userData.email_verified || false,
      lastSignIn: userData.last_sign_in,
      createdAt: userData.created_at,
      updatedAt: userData.updated_at,
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
