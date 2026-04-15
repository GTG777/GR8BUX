/**
 * AI Advisor Panel Component
 * Displays technical analysis and AI recommendations
 */

'use client';

import React, { useState } from 'react';
import { OrchestratorResponse } from '@/types/agents';

interface AIAdvisorPanelProps {
  analysis?: OrchestratorResponse;
  isLoading?: boolean;
  error?: string;
  onTradeClick?: () => void;
  compact?: boolean;
}

export const AIAdvisorPanel: React.FC<AIAdvisorPanelProps> = ({
  analysis,
  isLoading = false,
  error,
  onTradeClick,
  compact = false,
}) => {
  const [expanded, setExpanded] = useState(!compact);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
        <p className="font-semibold text-red-900">AI Analysis Error</p>
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="animate-pulse rounded-lg bg-gray-200 h-6 w-32"></div>
        <div className="animate-pulse rounded-lg bg-gray-200 h-4 w-full"></div>
        <div className="animate-pulse rounded-lg bg-gray-200 h-4 w-3/4"></div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
        No analysis available
      </div>
    );
  }

  const consensus = analysis.consensusRecommendation;
  const technical = analysis.analyses.technical;

  // Styling based on recommendation
  const getRecommendationColor = (action: string) => {
    switch (action) {
      case 'STRONG_BUY':
        return 'bg-green-600 text-white';
      case 'BUY':
        return 'bg-green-500 text-white';
      case 'WAIT':
        return 'bg-yellow-500 text-white';
      case 'AVOID':
        return 'bg-red-600 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-green-500';
    if (score >= 55) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {/* Header with toggle */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">🤖</span>
          <h3 className="font-semibold">AI Advisor Analysis</h3>
          {technical && (
            <span className={`text-xs font-bold ${getScoreColor(technical.qualityScore)}`}>
              Setup Quality: {technical.qualityScore}/100
            </span>
          )}
        </div>
        <span className="text-gray-400 text-lg">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Recommendation Banner */}
          <div className={`rounded-lg p-3 ${getRecommendationColor(consensus.action)}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold opacity-90">Recommendation</p>
                <p className="text-2xl font-bold">{consensus.action}</p>
              </div>
              <div className="text-right">
                <p className="text-sm opacity-90">Confidence</p>
                <p className="text-2xl font-bold">{(consensus.confidence * 100).toFixed(0)}%</p>
              </div>
            </div>
          </div>

          {/* Main Reasoning */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Analysis</p>
            <p className="text-sm text-gray-600">{consensus.reasoning}</p>
          </div>

          {/* Technical Details */}
          {technical && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {technical.riskRewardRatio != null && (
                <div className="rounded bg-blue-50 p-2">
                  <p className="text-xs text-gray-500 font-semibold">Risk/Reward</p>
                  <p className="font-semibold text-blue-900">1:{technical.riskRewardRatio.toFixed(1)}</p>
                </div>
              )}
              {technical.targetPrice != null && (
                <div className="rounded bg-green-50 p-2">
                  <p className="text-xs text-gray-500 font-semibold">Target Price</p>
                  <p className="font-semibold text-green-900">${technical.targetPrice.toFixed(2)}</p>
                </div>
              )}
              {technical.stopPrice != null && (
                <div className="rounded bg-red-50 p-2">
                  <p className="text-xs text-gray-500 font-semibold">Stop Loss</p>
                  <p className="font-semibold text-red-900">${technical.stopPrice.toFixed(2)}</p>
                </div>
              )}
              <div className="rounded bg-gray-50 p-2">
                <p className="text-xs text-gray-500 font-semibold">Confidence</p>
                <p className="font-semibold text-gray-900">{(technical.confidence * 100).toFixed(0)}%</p>
              </div>
            </div>
          )}

          {/* Key Signals */}
          {technical && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Key Signals</p>
              <div className="space-y-2">
                {technical.keySignals.positive.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-700">✓ Positive</p>
                    <ul className="text-xs text-green-600 space-y-1 ml-2">
                      {technical.keySignals.positive.map((signal, i) => (
                        <li key={i}>• {signal}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {technical.keySignals.negative.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-700">⚠ Cautions</p>
                    <ul className="text-xs text-red-600 space-y-1 ml-2">
                      {technical.keySignals.negative.map((signal, i) => (
                        <li key={i}>• {signal}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Red Flags */}
          {technical && technical.redFlags.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-semibold text-red-900 mb-2">🚩 Red Flags</p>
              <ul className="text-xs text-red-700 space-y-1">
                {technical.redFlags.map((flag, i) => (
                  <li key={i}>• {flag}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Cautions */}
          {consensus.cautions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-2">⚠️ Items to Consider</p>
              <ul className="text-xs text-amber-600 space-y-1">
                {consensus.cautions.map((caution, i) => (
                  <li key={i}>• {caution}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Next Steps */}
          {consensus.nextSteps.length > 0 && (
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="text-xs font-semibold text-blue-900 mb-2">👉 Suggested Next Steps</p>
              <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                {consensus.nextSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Trade Button */}
          {(consensus.action === 'BUY' || consensus.action === 'STRONG_BUY') && onTradeClick && (
            <button
              onClick={onTradeClick}
              className="w-full rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 transition"
            >
              Proceed to Trade Entry
            </button>
          )}

          {/* Timestamp */}
          <p className="text-xs text-gray-400 text-right">
            Analysis: {new Date(analysis.timestamp).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
};

export default AIAdvisorPanel;
