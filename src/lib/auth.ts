import { getSupabaseClient } from './supabase';
import { AuthUser, SignUpInput, SignInInput } from '@/types';

export type { SignUpInput, SignInInput, AuthUser };

export interface AuthResponse {
  success: boolean;
  error?: string;
  user?: AuthUser;
}

function requireSupabase() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      'Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  return client;
}

/**
 * Sign up new user with email and password
 */
export async function signUp(input: SignUpInput): Promise<AuthResponse> {
  try {
    const client = requireSupabase();

    // Create auth user
    const { data: authData, error: authError } = await client.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          display_name: input.displayName,
        },
      },
    });

    if (authError || !authData.user) {
      return {
        success: false,
        error: authError?.message || 'Failed to sign up',
      };
    }

    // Insert user profile with default 'user' role
    const { data: userData, error: userError } = await client
      .from('users')
      .insert({
        id: authData.user.id,
        email: input.email,
        display_name: input.displayName,
        role: 'user', // Default role
        email_verified: false,
      })
      .select()
      .single();

    if (userError) {
      // Clean up auth user if profile creation fails
      await client.auth.admin.deleteUser(authData.user.id);
      return {
        success: false,
        error: userError.message || 'Failed to create user profile',
      };
    }

    return {
      success: true,
      user: mapDatabaseUserToAuthUser(userData),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Sign in user with email and password
 */
export async function signIn(input: SignInInput): Promise<AuthResponse> {
  try {
    const client = requireSupabase();

    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (authError || !authData.user) {
      return {
        success: false,
        error: authError?.message || 'Invalid email or password',
      };
    }

    // Fetch user profile with role
    const { data: userData, error: userError } = await client
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !userData) {
      return {
        success: false,
        error: 'Failed to load user profile',
      };
    }

    // Log sign-in event
    await logAuthEvent({
      userId: authData.user.id,
      email: input.email,
      eventType: 'sign_in',
    });

    return {
      success: true,
      user: mapDatabaseUserToAuthUser(userData),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<AuthResponse> {
  try {
    const client = requireSupabase();
    const { error } = await client.auth.signOut();

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sign out',
    };
  }
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const client = requireSupabase();
    const { data, error } = await client.auth.getUser();

    if (error || !data.user) {
      return null;
    }

    // Fetch user profile with role
    const { data: userData, error: userError } = await client
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (userError || !userData) {
      return null;
    }

    return mapDatabaseUserToAuthUser(userData);
  } catch (error) {
    return null;
  }
}

/**
 * Request password reset email
 */
export async function requestPasswordReset(email: string): Promise<AuthResponse> {
  try {
    const client = requireSupabase();
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    // Log password reset request
    await logAuthEvent({
      email,
      eventType: 'password_reset',
    });

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to request password reset',
    };
  }
}

/**
 * Update user password
 */
export async function updatePassword(newPassword: string): Promise<AuthResponse> {
  try {
    const client = requireSupabase();
    const { error } = await client.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update password',
    };
  }
}

/**
 * Verify user email
 */
export async function verifyEmail(token: string): Promise<AuthResponse> {
  try {
    const client = requireSupabase();
    const { error } = await client.auth.verifyOtp({
      token_hash: token,
      type: 'email',
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    // Get current user and mark email as verified
    const user = await getCurrentUser();
    if (user) {
      await client
        .from('users')
        .update({ email_verified: true })
        .eq('id', user.id);

      // Log email verification
      await logAuthEvent({
        userId: user.id,
        email: user.email,
        eventType: 'email_verified',
      });
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify email',
    };
  }
}

/**
 * Update user role (admin only)
 */
export async function updateUserRole(userId: string, newRole: 'admin' | 'manager' | 'user'): Promise<AuthResponse> {
  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('users')
      .update({ role: newRole })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    // Log role change
    await logAuthEvent({
      userId,
      email: data.email,
      eventType: 'role_changed',
    });

    return {
      success: true,
      user: mapDatabaseUserToAuthUser(data),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update user role',
    };
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<AuthUser | null> {
  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return mapDatabaseUserToAuthUser(data);
  } catch (error) {
    return null;
  }
}

/**
 * Map database user object to AuthUser interface
 */
function mapDatabaseUserToAuthUser(data: any): AuthUser {
  return {
    id: data.id,
    email: data.email,
    role: data.role || 'user',
    emailVerified: data.email_verified || false,
    lastSignIn: data.last_sign_in,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Log authentication events for audit trail
 */
async function logAuthEvent({
  userId,
  email,
  eventType,
}: {
  userId?: string;
  email: string;
  eventType: 'sign_up' | 'sign_in' | 'sign_out' | 'password_reset' | 'email_verified' | 'role_changed';
}): Promise<void> {
  try {
    const client = requireSupabase();

    // Get user agent and IP if possible
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;

    await client.from('auth_logs').insert({
      user_id: userId,
      email,
      event_type: eventType,
      user_agent: userAgent,
    });
  } catch (error) {
    // Log errors but don't fail the auth operation
    console.error('Failed to log auth event:', error);
  }
}
