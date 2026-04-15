/**
 * useAIAnalysis - React Hook for AI Agent Analysis
 *
 * Strategy (Phase 3):
 *   1. Check in-memory cache (5 min TTL) — instant
 *   2. Check Supabase ai_analyses table (30 min TTL) — near-instant (<100ms)
 *   3. Fall back to live /api/agents/analyze call — slow but always works
 *
 * This means users see pre-computed results instantly on page load,
 * while the cron jobs keep the Supabase cache fresh in the background.
 */

'use client';

import { useState, useCallback } from 'react';
import { OrchestratorResponse } from '@/types/agents';

interface UseAIAnalysisOptions {
  cacheEnabled?: boolean;
  cacheDurationMs?: number;
  // How old a Supabase cached result can be before we fall back to live (ms)
  supabaseStaleTtlMs?: number;
}

interface AnalysisCache {
  data: OrchestratorResponse;
  timestamp: number;
}

// In-memory cache (per browser session)
const analysisCache = new Map<string, AnalysisCache>();

// Supabase staleness threshold: 30 minutes
const DEFAULT_SUPABASE_STALE_MS = 30 * 60 * 1000;

async function fetchFromSupabase(symbol: string, setupType: string): Promise<OrchestratorResponse | null> {
  try {
    const res = await fetch(
      `/api/agents/cached?symbol=${encodeURIComponent(symbol)}&setupType=${encodeURIComponent(setupType)}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

export function useAIAnalysis(options: UseAIAnalysisOptions = {}) {
  const {
    cacheEnabled = true,
    cacheDurationMs = 5 * 60 * 1000,
    supabaseStaleTtlMs = DEFAULT_SUPABASE_STALE_MS,
  } = options;

  const [analysis, setAnalysis] = useState<OrchestratorResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCached, setIsCached] = useState(false); // true when result came from Supabase/memory cache
  const [error, setError] = useState<string | null>(null);

  const analyzeSetup = useCallback(
    async (setupData: any) => {
      const cacheKey = `${setupData.symbol}_${setupData.setupType ?? 'LEAPS_CANDIDATE'}`;

      // ── 1. In-memory cache ──────────────────────────────────────
      if (cacheEnabled) {
        const cached = analysisCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < cacheDurationMs) {
          setAnalysis(cached.data);
          setIsCached(true);
          setError(null);
          return cached.data;
        }
      }

      setIsLoading(true);
      setError(null);

      // ── 2. Supabase pre-computed cache ──────────────────────────
      const supabaseCached = await fetchFromSupabase(
        setupData.symbol,
        setupData.setupType ?? 'LEAPS_CANDIDATE'
      );

      if (supabaseCached) {
        const age = Date.now() - new Date(supabaseCached.timestamp).getTime();
        if (age < supabaseStaleTtlMs) {
          // Store in memory cache too
          analysisCache.set(cacheKey, { data: supabaseCached, timestamp: Date.now() });
          setAnalysis(supabaseCached);
          setIsCached(true);
          setError(null);
          setIsLoading(false);
          return supabaseCached;
        }
        // Stale — show it immediately while triggering background refresh below
        setAnalysis(supabaseCached);
        setIsCached(true);
      }

      // ── 3. Live call to /api/agents/analyze ────────────────────
      try {
        const response = await fetch('/api/agents/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(setupData),
        });

        if (!response.ok) {
          let errorMsg = `HTTP ${response.status}`;
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
          } catch {
            // response was HTML (e.g. 500 page) — use status code message
          }
          throw new Error(errorMsg);
        }

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Analysis failed');

        const analysisData: OrchestratorResponse = result.data;

        if (cacheEnabled) {
          analysisCache.set(cacheKey, { data: analysisData, timestamp: Date.now() });
        }

        setAnalysis(analysisData);
        setIsCached(false);
        setError(null);
        return analysisData;
      } catch (err: any) {
        // If we had a stale Supabase result, keep showing it — just set a soft warning
        const errorMsg = err.message || 'Failed to analyze setup';
        if (!supabaseCached) {
          setError(errorMsg);
          setAnalysis(null);
          throw err;
        }
        // Stale cache + live failure = silent degradation, don't throw
        setError(null);
      } finally {
        setIsLoading(false);
      }
    },
    [cacheEnabled, cacheDurationMs, supabaseStaleTtlMs]
  );

  const clearCache = useCallback(() => {
    analysisCache.clear();
  }, []);

  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setError(null);
  }, []);

  return {
    analysis,
    isLoading,
    isCached,
    error,
    analyzeSetup,
    clearAnalysis,
    clearCache,
  };
}

export default useAIAnalysis;
