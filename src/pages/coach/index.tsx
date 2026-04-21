'use client';

import React from 'react';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TradeCoachPanel } from '@/components/TradeCoachPanel';

export default function CoachPage() {
  return (
    <ProtectedRoute>
      <Layout title="Trade Coach">
        <div className="flex flex-col h-[calc(100vh-4rem)] p-4 md:p-6">
          {/* Page header */}
          <div className="mb-4 shrink-0">
            <h1 className="text-2xl font-bold text-foreground">Trade Coach</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              RAG-powered coaching grounded in your own trade history — ask anything about your trading patterns, setups, or next steps.
            </p>
          </div>

          {/* Coach panel fills remaining height */}
          <div className="flex-1 min-h-0">
            <TradeCoachPanel className="h-full" />
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
