/**
 * useAIAnalysis - React Hook for AI Agent Analysis
 * Handles fetching and caching agent analysis
 */

'use client';

import { useState, useCallback } from 'react';
import { OrchestratorResponse } from '@/types/agents';

interface UseAIAnalysisOptions {
  cacheEnabled?: boolean;
  cacheDurationMs?: number;
}

interface AnalysisCache {
  data: OrchestratorResponse;
  timestamp: number;
}

// Global cache for analysis results
const analysisCache = new Map<string, AnalysisCache>();

export function useAIAnalysis(options: UseAIAnalysisOptions = {}) {
  const { cacheEnabled = true, cacheDurationMs = 5 * 60 * 1000 } = options; // 5 min default
  const [analysis, setAnalysis] = useState<OrchestratorResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeSetup = useCallback(
    async (setupData: any) => {
      const cacheKey = `${setupData.symbol}_${setupData.setupType}`;

      // Check cache
      if (cacheEnabled) {
        const cached = analysisCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < cacheDurationMs) {
          setAnalysis(cached.data);
          setError(null);
          return cached.data;
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/agents/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(setupData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Analysis failed');
        }

        const analysisData = result.data;

        // Cache the result
        if (cacheEnabled) {
          analysisCache.set(cacheKey, {
            data: analysisData,
            timestamp: Date.now(),
          });
        }

        setAnalysis(analysisData);
        setError(null);
        return analysisData;
      } catch (err: any) {
        const errorMsg = err.message || 'Failed to analyze setup';
        setError(errorMsg);
        setAnalysis(null);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cacheEnabled, cacheDurationMs]
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
    error,
    analyzeSetup,
    clearAnalysis,
    clearCache,
  };
}

export default useAIAnalysis;
