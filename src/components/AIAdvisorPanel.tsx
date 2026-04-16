/**
 * AI Advisor Panel Component
 * Displays multi-agent AI analysis (Technical, Greeks, Sentiment, Risk, Strategy)
 */

'use client';

import React, { useState } from 'react';
import {
  OrchestratorResponse,
  TechnicalAnalysis,
  GreeksAnalysis,
  RiskAssessment,
  SentimentAnalysis,
  TradeStrategy,
} from '@/types/agents';

type TabId = 'overview' | 'technical' | 'greeks' | 'sentiment' | 'risk' | 'strategy';

interface AIAdvisorPanelProps {
  analysis?: OrchestratorResponse;
  isLoading?: boolean;
  error?: string;
  onTradeClick?: () => void;
  compact?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const getRecommendationBg = (action: string) => {
  switch (action) {
    case 'STRONG_BUY': return 'bg-green-600 text-white';
    case 'BUY':         return 'bg-green-500 text-white';
    case 'WAIT':        return 'bg-yellow-500 text-white';
    case 'AVOID':       return 'bg-red-600 text-white';
    default:            return 'bg-gray-500 text-white';
  }
};

const getScoreColor = (score: number) => {
  if (score >= 85) return 'text-green-600';
  if (score >= 70) return 'text-green-500';
  if (score >= 55) return 'text-yellow-600';
  return 'text-red-600';
};

const getSentimentBadgeColor = (sentiment: string) => {
  switch (sentiment) {
    case 'VERY_BULLISH': return 'bg-green-600 text-white';
    case 'BULLISH':      return 'bg-green-400 text-white';
    case 'NEUTRAL':      return 'bg-gray-400 text-white';
    case 'BEARISH':      return 'bg-red-400 text-white';
    case 'VERY_BEARISH': return 'bg-red-700 text-white';
    default:             return 'bg-gray-300 text-gray-800';
  }
};

const getAlertBg = (severity: 'HIGH' | 'MEDIUM' | 'LOW') => {
  switch (severity) {
    case 'HIGH':   return 'border-red-300 bg-red-50 text-red-800';
    case 'MEDIUM': return 'border-yellow-300 bg-yellow-50 text-yellow-800';
    case 'LOW':    return 'border-blue-200 bg-blue-50 text-blue-800';
  }
};

const fmtPct = (n: any) => n != null ? `${Number(n) >= 0 ? '+' : ''}${(Number(n) * 100).toFixed(0)}%` : '—';
const fmtDollar = (n: any) => n != null ? `${Number(n) >= 0 ? '+' : '-'}$${Math.abs(Number(n)).toFixed(0)}` : '—';

// ─── Sub-sections ────────────────────────────────────────────────────────────

function TechnicalSection({ t }: { t: TechnicalAnalysis }) {
  return (
    <div className="space-y-4">
      {/* Score + quick stats */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded bg-blue-50 p-2">
          <p className="text-xs text-gray-500 font-semibold">Setup Quality</p>
          <p className={`font-bold text-lg ${getScoreColor(t.qualityScore)}`}>{t.qualityScore}/100</p>
        </div>
        <div className="rounded bg-gray-50 p-2">
          <p className="text-xs text-gray-500 font-semibold">Confidence</p>
          <p className="font-semibold text-gray-900">{t.confidence != null ? (t.confidence * 100).toFixed(0) : '—'}%</p>
        </div>
        {t.riskRewardRatio != null && (
          <div className="rounded bg-blue-50 p-2">
            <p className="text-xs text-gray-500 font-semibold">Risk / Reward</p>
            <p className="font-semibold text-blue-900">1 : {t.riskRewardRatio.toFixed(1)}</p>
          </div>
        )}
        {t.targetPrice != null && (
          <div className="rounded bg-green-50 p-2">
            <p className="text-xs text-gray-500 font-semibold">Target Price</p>
            <p className="font-semibold text-green-900">${t.targetPrice.toFixed(2)}</p>
          </div>
        )}
        {t.stopPrice != null && (
          <div className="rounded bg-red-50 p-2">
            <p className="text-xs text-gray-500 font-semibold">Stop Loss</p>
            <p className="font-semibold text-red-900">${t.stopPrice.toFixed(2)}</p>
          </div>
        )}
      </div>

      {/* Reasoning */}
      <p className="text-sm text-gray-600">{t.reasoning}</p>

      {/* Signals */}
      <div className="space-y-2">
        {t.keySignals?.positive?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-green-700 mb-1">✓ Positive Signals</p>
            <ul className="text-xs text-green-700 space-y-1 ml-2">
              {t.keySignals.positive.map((s, i) => <li key={i}>• {s}</li>)}
            </ul>
          </div>
        )}
        {t.keySignals?.negative?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-700 mb-1">⚠ Cautions</p>
            <ul className="text-xs text-red-600 space-y-1 ml-2">
              {t.keySignals.negative.map((s, i) => <li key={i}>• {s}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Red Flags */}
      {t.redFlags?.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-900 mb-2">🚩 Red Flags</p>
          <ul className="text-xs text-red-700 space-y-1">
            {t.redFlags.map((f, i) => <li key={i}>• {f}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function GreeksSection({ g }: { g: GreeksAnalysis }) {
  const ge = g.greeksAtEntry;
  const sa = g.scenarioAnalysis;
  return (
    <div className="space-y-4">
      {/* Strategy name */}
      <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
        <p className="text-xs font-semibold text-indigo-500 mb-1">Recommended Strategy</p>
        <p className="text-base font-bold text-indigo-900">{g.recommendedStrategy.name}</p>
        <p className="text-xs text-indigo-700 mt-1">{g.recommendedStrategy.description}</p>
        <p className="text-xs text-gray-500 mt-1">DTE: {g.recommendedStrategy.expirationDaysToExpiry} days</p>
      </div>

      {/* IV Analysis */}
      <div className="rounded-lg bg-purple-50 p-3">
        <p className="text-xs font-semibold text-purple-700 mb-1">IV Environment</p>
        <div className="flex gap-4 text-xs mb-1">
          <span className="text-gray-600">IV Rank: <strong className="text-purple-900">{g.ivAnalysis.currentIVRank}</strong></span>
          <span className="text-gray-600">HV: <strong className="text-purple-900">{g.ivAnalysis.historical}</strong></span>
        </div>
        <p className="text-xs text-purple-800">{g.ivAnalysis.interpretation}</p>
      </div>

      {/* Greeks at entry */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">Greeks at Entry</p>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          {[
            { label: 'Delta', value: ge?.delta != null ? ge.delta.toFixed(2) : '—', color: 'text-blue-700' },
            { label: 'Gamma', value: ge?.gamma != null ? ge.gamma.toFixed(3) : '—', color: 'text-purple-700' },
            { label: 'Theta', value: ge?.theta != null ? ge.theta.toFixed(2) : '—', color: 'text-red-700' },
            { label: 'Vega',  value: ge?.vega  != null ? ge.vega.toFixed(2)  : '—', color: 'text-green-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded bg-gray-50 p-2">
              <p className="text-gray-400 font-semibold">{label}</p>
              <p className={`font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scenario P&L */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">Scenario Analysis (P&L per contract)</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: 'Stock +10%', value: sa.moveUp10pct,   bg: 'bg-green-50', text: 'text-green-800' },
            { label: 'Stock +5%',  value: sa.moveUp5pct,    bg: 'bg-green-50', text: 'text-green-700' },
            { label: 'Stock -5%',  value: sa.moveDown5pct,  bg: 'bg-red-50',   text: 'text-red-700' },
            { label: 'Stock -10%', value: sa.moveDown10pct, bg: 'bg-red-50',   text: 'text-red-800' },
          ].map(({ label, value, bg, text }) => (
            <div key={label} className={`rounded p-2 ${bg}`}>
              <p className="text-gray-500">{label}</p>
              <p className={`font-bold ${text}`}>{fmtDollar(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Risks + optimization */}
      {g.risks?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-700 mb-1">⚠ Key Risks</p>
          <ul className="text-xs text-red-600 space-y-1 ml-2">
            {g.risks.map((r, i) => <li key={i}>• {r}</li>)}
          </ul>
        </div>
      )}
      {g.optimization && (
        <div className="rounded bg-blue-50 p-2">
          <p className="text-xs font-semibold text-blue-700 mb-1">💡 Optimization Tip</p>
          <p className="text-xs text-blue-700">{g.optimization}</p>
        </div>
      )}
    </div>
  );
}

function SentimentSection({ s }: { s: SentimentAnalysis }) {
  const score = s.sentimentScore;
  const barPct = Math.round(((score + 1) / 2) * 100);
  return (
    <div className="space-y-4">
      {/* Badge + score bar */}
      <div className="flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${getSentimentBadgeColor(s.overallSentiment)}`}>
          {s.overallSentiment.replace('_', ' ')}
        </span>
        <div className="flex-1">
          <div className="text-xs text-gray-500 mb-1">Score: {score != null ? score.toFixed(2) : '—'}</div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${score >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
              style={{ width: `${barPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>-1 Bearish</span><span>+1 Bullish</span>
          </div>
        </div>
      </div>

      {/* Source breakdown */}
      <div className="grid grid-cols-3 gap-2 text-xs text-center">
        <div className="rounded bg-gray-50 p-2">
          <p className="text-gray-400 font-semibold">News</p>
          <p className={`font-bold ${s.sources.news.score >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {fmtPct(s.sources.news.score)}
          </p>
          <p className="text-gray-400">{s.sources.news.count} articles</p>
        </div>
        <div className="rounded bg-gray-50 p-2">
          <p className="text-gray-400 font-semibold">Social</p>
          <p className={`font-bold ${s.sources.social.score >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {fmtPct(s.sources.social.score)}
          </p>
          <p className="text-gray-400">{s.sources.social.mentionCount} mentions</p>
        </div>
        <div className="rounded bg-gray-50 p-2">
          <p className="text-gray-400 font-semibold">Insider</p>
          <p className={`font-bold ${s.sources.insider.score >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {fmtPct(s.sources.insider.score)}
          </p>
          <p className="text-gray-400">{s.sources.insider.buyCount}B / {s.sources.insider.sellCount}S</p>
        </div>
      </div>

      {/* Market consensus */}
      <p className="text-sm text-gray-600">{s.marketConsensus}</p>

      {/* Key Drivers */}
      {s.keyDrivers?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-green-700 mb-1">📈 Key Drivers</p>
          <ul className="text-xs text-gray-600 space-y-1 ml-2">
            {s.keyDrivers.map((d, i) => <li key={i}>• {d}</li>)}
          </ul>
        </div>
      )}

      {/* Conflicting Signals */}
      {s.conflictingSignals?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-700 mb-1">⚡ Conflicting Signals</p>
          <ul className="text-xs text-amber-600 space-y-1 ml-2">
            {s.conflictingSignals.map((c, i) => <li key={i}>• {c}</li>)}
          </ul>
        </div>
      )}

      {/* Upcoming Catalysts */}
      {s.catalysts?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-blue-700 mb-2">📅 Upcoming Catalysts</p>
          <div className="space-y-1">
            {s.catalysts.map((cat, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-gray-400 w-20 shrink-0">{cat.date}</span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                  cat.expectedImpact === 'POSITIVE' ? 'bg-green-100 text-green-800' :
                  cat.expectedImpact === 'NEGATIVE' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-700'
                }`}>{cat.expectedImpact}</span>
                <span className="text-gray-700">{cat.event}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RiskSection({ r }: { r: RiskAssessment }) {
  const pi = r.portfolioImpact;
  const fmt = (v: any, dec = 2) => v != null ? Number(v).toFixed(dec) : '—';
  return (
    <div className="space-y-4">
      {/* Recommended size */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-blue-500">Recommended Position Size</p>
          <p className="text-2xl font-bold text-blue-900">{r.recommendedPositionSize ?? '—'} contracts</p>
        </div>
        <div className="text-right text-xs text-gray-600">
          <p>Max Loss: <strong className="text-red-700">${fmt(r.maxLossScenario, 0)}</strong></p>
          <p>Max Profit: <strong className="text-green-700">${fmt(r.maxProfitScenario, 0)}</strong></p>
        </div>
      </div>

      {/* Rationale */}
      {r.rationale && <p className="text-sm text-gray-600">{r.rationale}</p>}

      {/* Exposure Alerts */}
      {r.exposureAlerts?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-700">Exposure Alerts</p>
          {r.exposureAlerts.map((alert, i) => (
            <div key={i} className={`rounded border p-2 text-xs ${getAlertBg(alert.severity)}`}>
              <strong>{alert.severity}</strong>: {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Portfolio Impact (Greeks delta) */}
      {pi && (
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">Portfolio Greeks Impact</p>
          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            {[
              { label: 'Delta', before: pi.deltaBefore, after: pi.deltaAfter },
              { label: 'Vega',  before: pi.vegaBefore,  after: pi.vegaAfter  },
              { label: 'Theta', before: pi.thetaBefore, after: pi.thetaAfter },
            ].map(({ label, before, after }) => (
              <div key={label} className="rounded bg-gray-50 p-2">
                <p className="text-gray-400 font-semibold">{label}</p>
                <p className="text-gray-500">{fmt(before)}</p>
                <p className="text-xs text-gray-400">↓</p>
                <p className={`font-bold ${(after ?? 0) > (before ?? 0) ? 'text-green-700' : 'text-red-700'}`}>{fmt(after)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hedge Suggestions */}
      {r.hedgeSuggestions?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-purple-700 mb-2">🛡 Hedge Suggestions</p>
          {r.hedgeSuggestions.map((h, i) => (
            <div key={i} className="rounded bg-purple-50 border border-purple-200 p-2 mb-2">
              <p className="text-xs font-bold text-purple-900">{h.instrument}</p>
              <p className="text-xs text-purple-700">{h.rationale}</p>
              <p className="text-xs text-gray-500">Est. Cost: ${fmt(h.expectedCost, 0)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StrategySection({ s }: { s: TradeStrategy }) {
  const confluenceColor = s.confluenceScore >= 80 ? 'text-green-600' : s.confluenceScore >= 60 ? 'text-yellow-600' : 'text-red-600';
  return (
    <div className="space-y-4">
      {/* Trade idea + confluence */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 rounded-lg bg-indigo-50 border border-indigo-200 p-3">
          <p className="text-xs font-semibold text-indigo-500">Trade Idea</p>
          <p className="text-base font-bold text-indigo-900">{s.tradeIdea.type.replace('_', ' ')}</p>
          <p className="text-xs text-indigo-700 mt-1">{s.tradeIdea.description}</p>
        </div>
        <div className="text-center rounded-lg bg-gray-50 border border-gray-200 p-3 min-w-[72px]">
          <p className="text-xs text-gray-500 font-semibold">Confluence</p>
          <p className={`text-2xl font-bold ${confluenceColor}`}>{s.confluenceScore}</p>
          <p className="text-xs text-gray-400">/100</p>
        </div>
      </div>

      {/* Reasoning */}
      <p className="text-sm text-gray-600">{s.reasoning}</p>

      {/* Entry / Targets / Stop */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded bg-blue-50 p-2">
          <p className="text-gray-500 font-semibold">Entry Trigger</p>
          <p className="font-bold text-blue-900">${s.entry.triggerPrice.toFixed(2)}</p>
          <p className="text-gray-500 mt-0.5">{s.entry.signal} — {s.entry.timing}</p>
        </div>
        <div className="rounded bg-red-50 p-2">
          <p className="text-gray-500 font-semibold">Stop Loss</p>
          <p className="font-bold text-red-900">${s.stopLoss.price.toFixed(2)}</p>
          <p className="text-red-600 mt-0.5">-{s.stopLoss.lossPercent.toFixed(1)}%</p>
        </div>
        <div className="rounded bg-green-50 p-2">
          <p className="text-gray-500 font-semibold">Target 1</p>
          <p className="font-bold text-green-800">${s.targets.target1.price.toFixed(2)}</p>
          <p className="text-green-700 mt-0.5">+{s.targets.target1.profitPercent.toFixed(1)}%</p>
        </div>
        <div className="rounded bg-green-50 p-2">
          <p className="text-gray-500 font-semibold">Target 2</p>
          <p className="font-bold text-green-900">${s.targets.target2.price.toFixed(2)}</p>
          <p className="text-green-700 mt-0.5">+{s.targets.target2.profitPercent.toFixed(1)}%</p>
        </div>
      </div>

      {/* Historical Similarity */}
      <div className="rounded bg-gray-50 p-3 text-xs">
        <p className="font-semibold text-gray-700 mb-1">📊 Historical Similarity</p>
        <div className="flex gap-4">
          <span>Matches: <strong>{s.historicalSimilarity.matchCount}</strong></span>
          <span>Win Rate: <strong className={s.historicalSimilarity.winRate >= 0.6 ? 'text-green-700' : 'text-red-700'}>{(s.historicalSimilarity.winRate * 100).toFixed(0)}%</strong></span>
          <span>Avg R/R: <strong>1:{s.historicalSimilarity.avgRiskReward.toFixed(1)}</strong></span>
        </div>
      </div>

      {/* Risk Warnings */}
      {s.riskWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-900 mb-1">⚠ Risk Warnings</p>
          <ul className="text-xs text-amber-700 space-y-1">
            {s.riskWarnings.map((w, i) => <li key={i}>• {w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const AIAdvisorPanel: React.FC<AIAdvisorPanelProps> = ({
  analysis,
  isLoading = false,
  error,
  onTradeClick,
  compact = false,
}) => {
  const [expanded, setExpanded] = useState(!compact);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  if (error && !analysis) {
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
  const { technical, greeks, sentiment, risk, strategy } = analysis.analyses;

  // Build available tabs
  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'overview',   label: 'Overview',   icon: '📋' },
    { id: 'technical',  label: 'Technical',  icon: '📈' },
    ...(greeks    ? [{ id: 'greeks'    as TabId, label: 'Greeks',    icon: '🔢' }] : []),
    ...(sentiment ? [{ id: 'sentiment' as TabId, label: 'Sentiment', icon: '📰' }] : []),
    ...(risk      ? [{ id: 'risk'      as TabId, label: 'Risk',      icon: '⚠️' }] : []),
    ...(strategy  ? [{ id: 'strategy'  as TabId, label: 'Strategy',  icon: '🎯' }] : []),
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {/* Header with toggle */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">🤖</span>
          <h3 className="font-semibold">AI Advisor</h3>
          {technical && (
            <span className={`text-xs font-bold ${getScoreColor(technical.qualityScore)}`}>
              {technical.qualityScore}/100
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${getRecommendationBg(consensus.action)}`}>
            {consensus.action}
          </span>
        </div>
        <span className="text-gray-400 text-lg">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="mt-4">
          {/* Tab Bar */}
          <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="space-y-4">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                {/* Recommendation Banner */}
                <div className={`rounded-lg p-3 ${getRecommendationBg(consensus.action)}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold opacity-90">Consensus Recommendation</p>
                      <p className="text-2xl font-bold">{consensus.action}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm opacity-90">Confidence</p>
                      <p className="text-2xl font-bold">{(consensus.confidence * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                </div>

                {/* Reasoning */}
                <p className="text-sm text-gray-600">{consensus.reasoning}</p>

                {/* Agent summary badges */}
                <div className="flex flex-wrap gap-2">
                  {technical && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getRecommendationBg(technical.recommendation)}`}>
                      Tech: {technical.recommendation}
                    </span>
                  )}
                  {sentiment && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getSentimentBadgeColor(sentiment.overallSentiment)}`}>
                      Sent: {sentiment.overallSentiment.replace('_', ' ')}
                    </span>
                  )}
                  {strategy && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      strategy.confluenceScore >= 70 ? 'bg-green-500 text-white' :
                      strategy.confluenceScore >= 50 ? 'bg-yellow-500 text-white' :
                      'bg-red-500 text-white'
                    }`}>
                      Confluence: {strategy.confluenceScore}
                    </span>
                  )}
                  {risk && risk.exposureAlerts.filter(a => a.severity === 'HIGH').length > 0 && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-red-600 text-white">
                      ⚠ High Risk Alerts
                    </span>
                  )}
                </div>

                {/* Cautions */}
                {consensus.cautions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-700 mb-1">⚠️ Items to Consider</p>
                    <ul className="text-xs text-amber-600 space-y-1">
                      {consensus.cautions.map((c, i) => <li key={i}>• {c}</li>)}
                    </ul>
                  </div>
                )}

                {/* Next Steps */}
                {consensus.nextSteps.length > 0 && (
                  <div className="rounded-lg bg-blue-50 p-3">
                    <p className="text-xs font-semibold text-blue-900 mb-2">👉 Suggested Next Steps</p>
                    <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                      {consensus.nextSteps.map((step, i) => <li key={i}>{step}</li>)}
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
              </div>
            )}

            {/* Technical Tab */}
            {activeTab === 'technical' && technical && <TechnicalSection t={technical} />}
            {activeTab === 'technical' && !technical && (
              <p className="text-sm text-gray-400 text-center py-4">Technical analysis not available</p>
            )}

            {/* Greeks Tab */}
            {activeTab === 'greeks' && greeks && <GreeksSection g={greeks} />}

            {/* Sentiment Tab */}
            {activeTab === 'sentiment' && sentiment && <SentimentSection s={sentiment} />}

            {/* Risk Tab */}
            {activeTab === 'risk' && risk && <RiskSection r={risk} />}

            {/* Strategy Tab */}
            {activeTab === 'strategy' && strategy && <StrategySection s={strategy} />}
          </div>

          {/* Timestamp */}
          <p className="text-xs text-gray-400 text-right mt-4">
            Analysis: {new Date(analysis.timestamp).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
};

export default AIAdvisorPanel;
