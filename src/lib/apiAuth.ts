import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';

export async function getUserFromBearerToken(token: string): Promise<User | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function getOptionalAuthUser(req: NextApiRequest): Promise<User | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return getUserFromBearerToken(authHeader.substring(7));
}

/**
 * Verifies the Bearer JWT in the Authorization header against Supabase.
 * Returns the authenticated user, or sends a 401/503 response and returns null.
 * Usage:
 *   const user = await requireAuth(req, res);
 *   if (!user) return; // response already sent
 */
export async function requireAuth(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<User | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return null;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    res.status(503).json({ success: false, error: 'Database not configured' });
    return null;
  }

  const user = await getUserFromBearerToken(authHeader.substring(7));
  if (!user) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return null;
  }

  return user;
}
