'use client';

import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TradeCoachPanel } from '@/components/TradeCoachPanel';
import { getSupabaseClient } from '@/lib/supabase';

export default function CoachPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  const handleBackfill = async () => {
    setSyncing(true);
    setSyncResult('');
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Database not configured');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/rag/embed-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ backfill: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Sync failed');
      setSyncResult(`Synced ${json.data?.embedded ?? 0} trade(s). ${json.data?.skipped ?? 0} already up to date.`);
    } catch (err) {
      setSyncResult(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout title="Trade Coach">
        <div className="flex flex-col h-[calc(100vh-4rem)] p-4 md:p-6">
          {/* Page header */}
          <div className="mb-4 shrink-0 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Trade Coach</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                RAG-powered coaching grounded in your own trade history — ask anything about your trading patterns, setups, or next steps.
              </p>
            </div>

            {/* Backfill / sync button */}
            <div className="shrink-0 text-right">
              <button
                onClick={handleBackfill}
                disabled={syncing}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
              >
                {syncing ? 'Syncing…' : '🔄 Sync trade history'}
              </button>
              {syncResult && (
                <p className="text-xs text-muted-foreground mt-1">{syncResult}</p>
              )}
            </div>
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
