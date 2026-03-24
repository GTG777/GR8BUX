'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { UserRole } from '@/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
  fallback?: React.ReactNode;
}

/**
 * ProtectedRoute component for role-based access control
 * Redirects to login if user is not authenticated
 * Redirects to unauthorized if user doesn't have required role
 */
export function ProtectedRoute({
  children,
  requiredRoles = ['admin', 'manager', 'user'],
  fallback,
}: ProtectedRouteProps) {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, canAccess } = useAuthStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/signin');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!canAccess(requiredRoles)) {
    return (
      fallback || (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-6">You don&apos;t have permission to access this page</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )
    );
  }

  return <>{children}</>;
}

/**
 * Hook to check if user has access to a page
 */
export function useCanAccess(requiredRoles: UserRole[]) {
  const { canAccess } = useAuthStore();
  return canAccess(requiredRoles);
}

/**
 * Hook to check if user is admin
 */
export function useIsAdmin() {
  const { isAdmin } = useAuthStore();
  return isAdmin();
}

/**
 * Hook to check if user is manager or admin
 */
export function useIsManager() {
  const { isManager } = useAuthStore();
  return isManager();
}
