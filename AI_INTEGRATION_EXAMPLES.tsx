/**
 * AI Agent System - Integration Example
 * Shows how to integrate AI analysis into GR8BUX components
 */

// ============================================================================
// EXAMPLE 1: LEAPS Screener with AI Quality Scores
// ============================================================================

import React, { useState } from 'react';
import { useAIAnalysis } from '@/hooks/useAIAnalysis';
import { AIAdvisorPanel } from '@/components';

interface ScreenerRow {
  symbol: string;
  sector: string;
  price: number;
  hv20: number;
  ivr: number; // IV Rank
  bestExpiry: string;
  bestDelta: number;
  bestPremium: number;
  support?: number;
  resistance?: number;
}

export function LeapsScreenerWithAI() {
  const [selectedRow, setSelectedRow] = useState<ScreenerRow | null>(null);
  const { analysis, isLoading, error, analyzeSetup } = useAIAnalysis({
    cacheDurationMs: 10 * 60 * 1000, // 10 minute cache
  });

  const handleRowClick = async (row: ScreenerRow) => {
    setSelectedRow(row);

    // Trigger AI analysis on the LEAPS setup
    await analyzeSetup({
      symbol: row.symbol,
      setupType: 'leaps_opportunity',
      currentPrice: row.price,
      support: row.support || row.price * 0.95,
      resistance: row.resistance || row.price * 1.05,
      ivRank: row.ivr,
      hv20: row.hv20,
      delta: row.bestDelta,
      premium: row.bestPremium,
      detectedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left sidebar: Screener table */}
      <div className="lg:col-span-2">
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="text-left p-3 font-semibold">Symbol</th>
                <th className="text-right p-3 font-semibold">Price</th>
                <th className="text-right p-3 font-semibold">IV Rank</th>
                <th className="text-right p-3 font-semibold">HV20</th>
              </tr>
            </thead>
            <tbody>
              {/* Map screener rows */}
              {[
                {
                  symbol: 'AAPL',
                  price: 190.5,
                  ivr: 45,
                  hv20: 0.18,
                  bestDelta: 0.65,
                  bestPremium: 4.2,
                },
              ].map((row) => (
                <tr
                  key={row.symbol}
                  onClick={() => handleRowClick(row as any)}
                  className={`border-b cursor-pointer transition ${
                    selectedRow?.symbol === row.symbol
                      ? 'bg-blue-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="p-3 font-semibold">{row.symbol}</td>
                  <td className="p-3 text-right">${row.price}</td>
                  <td className="p-3 text-right">{row.ivr}%</td>
                  <td className="p-3 text-right">{(row.hv20 * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right sidebar: AI Analysis */}
      <div>
        {selectedRow ? (
          <AIAdvisorPanel
            analysis={analysis}
            isLoading={isLoading}
            error={error}
            onTradeClick={() => console.log('Trade clicked for', selectedRow.symbol)}
            compact={false}
          />
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
            Click a row to see AI analysis
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// EXAMPLE 2: Trade Entry Form with Pre-Trade AI Validation
// ============================================================================

export function TradeEntryWithAIValidation() {
  const [formData, setFormData] = useState({
    symbol: 'TSLA',
    setupType: 'support_bounce',
    currentPrice: 240.5,
  });

  const { analysis, isLoading, error, analyzeSetup } = useAIAnalysis();

  const handleSetupTypeChange = async (setupType: string) => {
    setFormData((prev) => ({ ...prev, setupType }));

    // Auto-trigger analysis when setup type changes
    await analyzeSetup({
      symbol: formData.symbol,
      setupType: setupType,
      currentPrice: formData.currentPrice,
      rsi: 32, // Would come from real market data
      support: formData.currentPrice * 0.98,
      resistance: formData.currentPrice * 1.02,
      detectedAt: new Date().toISOString(),
    });
  };

  const handleSubmitTrade = () => {
    // Check AI recommendation before proceeding
    if (analysis?.consensusRecommendation.action === 'AVOID') {
      const confirm = window.confirm(
        'AI recommends avoiding this setup. Trade anyway?'
      );
      if (!confirm) return;
    }

    // Submit trade
    console.log('Trade submitted with AI validation');
  };

  return (
    <form className="space-y-4">
      <div>
        <label>Setup Type</label>
        <select
          value={formData.setupType}
          onChange={(e) => handleSetupTypeChange(e.target.value)}
        >
          <option value="support_bounce">Support Bounce</option>
          <option value="breakout">Breakout</option>
          <option value="coiling">Coiling</option>
        </select>
      </div>

      {/* AI Analysis Preview */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">AI Pre-Trade Check</h3>
        <AIAdvisorPanel analysis={analysis} isLoading={isLoading} error={error} compact={true} />
      </div>

      <button
        type="button"
        onClick={handleSubmitTrade}
        className="bg-green-600 text-white px-4 py-2 rounded"
      >
        Submit Trade
      </button>
    </form>
  );
}

// ============================================================================
// EXAMPLE 3: Direct API Usage (Backend)
// ============================================================================

// Use this in server-side code or API routes
export async function analyzeSetupDirectly(setupData: any) {
  const response = await fetch('/api/agents/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.GR8BUX_API_KEY || '',
    },
    body: JSON.stringify(setupData),
  });

  if (!response.ok) {
    throw new Error(`Analysis failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

// Example usage in API route
export async function exampleAPIRoute(req: any, res: any) {
  try {
    const analysis = await analyzeSetupDirectly({
      symbol: 'SPY',
      setupType: 'support_bounce',
      currentPrice: 510.25,
      rsi: 28,
      support: 508.0,
      resistance: 515.0,
      detectedAt: new Date().toISOString(),
    });

    res.json({ success: true, analysis });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================================================
// EXAMPLE 4: Batch Analysis of Multiple Setups
// ============================================================================

export async function batchAnalyzeSetups(setupsData: any[]) {
  const results = await Promise.all(
    setupsData.map((setup) =>
      fetch('/api/agents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setup),
      })
        .then((r) => r.json())
        .then((r) => r.data)
    )
  );

  return results;
}

// Usage
async function scanForBuyOpportunities() {
  const setups = [
    {
      symbol: 'AAPL',
      setupType: 'support_bounce',
      currentPrice: 190.5,
      rsi: 28,
      detectedAt: new Date().toISOString(),
    },
    {
      symbol: 'MSFT',
      setupType: 'breakout',
      currentPrice: 415.2,
      rsi: 65,
      detectedAt: new Date().toISOString(),
    },
  ];

  const analyses = await batchAnalyzeSetups(setups);

  // Filter for BUY recommendations
  const buyOpportunities = analyses.filter(
    (a) => a.consensusRecommendation.action === 'BUY' || a.consensusRecommendation.action === 'STRONG_BUY'
  );

  console.log(`Found ${buyOpportunities.length} BUY opportunities`);
  return buyOpportunities;
}

// ============================================================================
// EXAMPLE 5: Using in Custom Components
// ============================================================================

export function TechnicalSetupCard({ setup }: { setup: any }) {
  const { analysis, analyzeSetup, isLoading } = useAIAnalysis();

  React.useEffect(() => {
    analyzeSetup(setup);
  }, [setup]);

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h2 className="text-xl font-bold">{setup.symbol}</h2>
      <p className="text-gray-600">{setup.setupType}</p>

      {analysis && (
        <>
          {/* Show quality score prominently */}
          <div className="text-4xl font-bold">
            {analysis.analyses.technical?.qualityScore}
            <span className="text-lg text-gray-500">/100</span>
          </div>

          {/* Show recommendation badge */}
          <div
            className={`px-3 py-1 rounded-full text-white font-semibold text-center ${
              analysis.consensusRecommendation.action === 'BUY'
                ? 'bg-green-600'
                : analysis.consensusRecommendation.action === 'WAIT'
                ? 'bg-yellow-600'
                : 'bg-red-600'
            }`}
          >
            {analysis.consensusRecommendation.action}
          </div>

          {/* Show key signals */}
          {analysis.analyses.technical?.keySignals.positive && (
            <div>
              <h3 className="font-semibold text-green-600">✓ Positive Signals</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                {analysis.analyses.technical.keySignals.positive.map((signal: string, i: number) => (
                  <li key={i}>• {signal}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {isLoading && <p className="text-sm text-gray-500">Analyzing...</p>}
    </div>
  );
}

export default {
  LeapsScreenerWithAI,
  TradeEntryWithAIValidation,
  TechnicalSetupCard,
  analyzeSetupDirectly,
  batchAnalyzeSetups,
};
