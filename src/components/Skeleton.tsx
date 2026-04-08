import React from 'react';

interface SkeletonProps {
  className?: string;
}

/**
 * Animated loading skeleton — drop in wherever text/numbers are pending.
 * Defaults to a short inline bar. Override size via className.
 */
export function Skeleton({ className = 'h-4 w-16' }: SkeletonProps) {
  return (
    <span
      className={`inline-block rounded bg-gray-200 animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}
