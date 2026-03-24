'use client';

import React, { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * AuthProvider component that initializes authentication state
 * Wrap your app with this component to enable authentication
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const { initializeAuth, isLoading } = useAuthStore();

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      const timeout = new Promise<void>((resolve) => {
        setTimeout(() => {
          if (mounted) {
            useAuthStore.setState({ isLoading: false });
          }
          resolve();
        }, 8000);
      });

      await Promise.race([initializeAuth(), timeout]);
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [initializeAuth]);

  // Show loading state while initializing auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
