import { create } from 'zustand';
import { AuthUser, UserRole } from '@/types';
import {
  getCurrentUser,
  signUp,
  signIn,
  signOut,
  updateUserRole,
  SignUpInput,
  SignInInput,
} from '@/lib/auth';

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;

  // Actions
  initializeAuth: () => Promise<void>;
  handleSignUp: (input: SignUpInput) => Promise<boolean>;
  handleSignIn: (input: SignInInput) => Promise<boolean>;
  handleSignOut: () => Promise<void>;
  updateRole: (userId: string, role: UserRole) => Promise<boolean>;
  clearError: () => void;

  // Checks
  canAccess: (requiredRoles: UserRole[]) => boolean;
  isAdmin: () => boolean;
  isManager: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,

  initializeAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      const user = await getCurrentUser();
      set({
        user,
        isAuthenticated: !!user,
        isLoading: false,
      });
    } catch (error) {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize auth',
      });
    }
  },

  handleSignUp: async (input: SignUpInput) => {
    set({ isLoading: true, error: null });
    try {
      const result = await signUp(input);
      if (result.success) {
        set({
          user: result.user ?? null,
          isAuthenticated: !!result.user,
          isLoading: false,
        });
        return true;
      } else {
        set({
          error: result.error || 'Sign up failed',
          isLoading: false,
        });
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign up failed';
      set({
        error: message,
        isLoading: false,
      });
      return false;
    }
  },

  handleSignIn: async (input: SignInInput) => {
    set({ isLoading: true, error: null });
    try {
      const result = await signIn(input);
      if (result.success && result.user) {
        set({
          user: result.user,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      } else {
        set({
          error: result.error || 'Sign in failed',
          isLoading: false,
        });
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed';
      set({
        error: message,
        isLoading: false,
      });
      return false;
    }
  },

  handleSignOut: async () => {
    set({ isLoading: true, error: null });
    try {
      await signOut();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Sign out failed',
        isLoading: false,
      });
    }
  },

  updateRole: async (userId: string, role: UserRole) => {
    set({ error: null });
    try {
      const result = await updateUserRole(userId, role);
      if (result.success && result.user) {
        // Update current user if it's the same user
        const state = get();
        if (state.user?.id === userId) {
          set({ user: result.user });
        }
        return true;
      } else {
        set({ error: result.error || 'Failed to update role' });
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update role';
      set({ error: message });
      return false;
    }
  },

  clearError: () => {
    set({ error: null });
  },

  canAccess: (requiredRoles: UserRole[]) => {
    const state = get();
    if (!state.user) return false;
    return requiredRoles.includes(state.user.role);
  },

  isAdmin: () => {
    const state = get();
    return state.user?.role === 'admin';
  },

  isManager: () => {
    const state = get();
    return state.user?.role === 'manager' || state.user?.role === 'admin';
  },
}));
