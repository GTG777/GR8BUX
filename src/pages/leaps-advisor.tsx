import React, { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { Layout } from '@/components/Layout';
import type { ChatResponse, LeapsCandidate, ChatIntent } from './api/chat/leaps-advisor';

// ── Types ─────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  candidates?: LeapsCandidate[];
  intent?: ChatIntent;
  dataAge?: string;
  timestamp: Date;
}

// ── Verdict badge ─────────────────────────────────────────────────────────
const VERDICT_STYLES: Record<string, string> = {
  STRONG_BUY: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
  BUY:        'bg-green-500/20 text-green-400 border border-green-500/40',
  NEUTRAL:    'bg-zinc-600/20 text-zinc-400 border border-zinc-600/40',
  WAIT:       'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40',
  AVOID:      'bg-red-500/20 text-red-400 border border-red-500/40',
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const cls = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.NEUTRAL;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${cls}`}>
      {verdict.replace('_', ' ')}
    </span>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? 'bg-emerald-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-zinc-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-xs text-zinc-400">{score}</span>
    </div>
  );
}

// ── Candidates table ──────────────────────────────────────────────────────
function CandidatesTable({
  candidates,
  goalAmount,
}: {
  candidates: LeapsCandidate[];
  goalAmount: number;
}) {
  if (!candidates.length) return null;

  return (
    <div className="mt-3 rounded-xl border border-zinc-700/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr className="bg-zinc-800/90 text-zinc-400 border-b border-zinc-700/60">
              <th className="px-3 py-2.5 text-left font-semibold">#</th>
              <th className="px-3 py-2.5 text-left font-semibold">Ticker</th>
              <th className="px-3 py-2.5 text-right font-semibold">Price</th>
              <th className="px-3 py-2.5 text-right font-semibold">Strike</th>
              <th className="px-3 py-2.5 text-left font-semibold">Expiry</th>
              <th className="px-3 py-2.5 text-right font-semibold">Δ</th>
              <th className="px-3 py-2.5 text-right font-semibold">Mid/Contract</th>
              <th className="px-3 py-2.5 text-right font-semibold">Contracts</th>
              <th className="px-3 py-2.5 text-right font-semibold">Capital</th>
              <th className="px-3 py-2.5 text-right font-semibold">≈@2%</th>
              <th className="px-3 py-2.5 text-right font-semibold">≈@3%</th>
              <th className="px-3 py-2.5 text-right font-semibold">≈@5%</th>
              <th className="px-3 py-2.5 text-right font-semibold">IVR</th>
              <th className="px-3 py-2.5 text-right font-semibold">RSI</th>
              <th className="px-3 py-2.5 text-center font-semibold">AI Score</th>
              <th className="px-3 py-2.5 text-center font-semibold">Verdict</th>
              <th className="px-3 py-2.5 text-center font-semibold">Earnings</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, i) => {
              const gainAt2 = c.gainAt2Pct * c.contractsNeeded;
              const gainAt3 = c.gainAt3Pct * c.contractsNeeded;
              const gainAt5 = c.gainAt5Pct * c.contractsNeeded;
              const goalMet = gainAt3 >= goalAmount;

              return (
                <tr
                  key={c.symbol}
                  className={`border-t border-zinc-700/30 hover:bg-zinc-700/20 transition-colors ${
                    i % 2 === 0 ? 'bg-zinc-900/40' : 'bg-zinc-800/20'
                  }`}
                >
                  {/* Rank */}
                  <td className="px-3 py-2 text-zinc-500 font-mono">{c.rank}</td>

                  {/* Ticker */}
                  <td className="px-3 py-2">
                    <div className="font-bold text-white">{c.symbol}</div>
                    <div className="text-zinc-500">{c.sector}</div>
                  </td>

                  {/* Price */}
                  <td className="px-3 py-2 text-right text-zinc-200 font-mono">
                    ${c.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>

                  {/* Strike */}
                  <td className="px-3 py-2 text-right">
                    <span className={c.inTheMoney ? 'text-emerald-400 font-medium' : 'text-zinc-300'}>
                      ${c.strike.toLocaleString()}
                    </span>
                    {c.inTheMoney && (
                      <span className="ml-1 text-emerald-600">ITM</span>
                    )}
                  </td>

                  {/* Expiry */}
                  <td className="px-3 py-2">
                    <div className="text-zinc-200">{c.expiry}</div>
                    <div className="text-zinc-500">{c.dte}d</div>
                  </td>

                  {/* Delta */}
                  <td className="px-3 py-2 text-right">
                    <span className="text-indigo-400 font-mono">{c.delta.toFixed(2)}</span>
                    <div className="text-zinc-600">{c.probITM}% ITM</div>
                  </td>

                  {/* Mid per contract */}
                  <td className="px-3 py-2 text-right font-mono text-zinc-200">
                    ${c.costPerContract.toLocaleString()}
                  </td>

                  {/* Contracts needed */}
                  <td className="px-3 py-2 text-right">
                    <span className="font-bold text-white">{c.contractsNeeded}×</span>
                  </td>

                  {/* Total capital */}
                  <td className="px-3 py-2 text-right font-mono">
                    <span
                      className={
                        c.totalCost > 50000
                          ? 'text-red-400'
                          : c.totalCost > 20000
                          ? 'text-yellow-400'
                          : 'text-zinc-200'
                      }
                    >
                      ${c.totalCost.toLocaleString()}
                    </span>
                  </td>

                  {/* Gain at 2% */}
                  <td className="px-3 py-2 text-right font-mono text-zinc-400">
                    ${gainAt2.toLocaleString()}
                  </td>

                  {/* Gain at 3% */}
                  <td className="px-3 py-2 text-right font-mono">
                    <span className={goalMet ? 'text-emerald-400 font-semibold' : 'text-zinc-300'}>
                      ${gainAt3.toLocaleString()}
                    </span>
                    {goalMet && <span className="ml-1 text-emerald-600">✓</span>}
                  </td>

                  {/* Gain at 5% */}
                  <td className="px-3 py-2 text-right font-mono text-emerald-300">
                    ${gainAt5.toLocaleString()}
                  </td>

                  {/* IV Rank */}
                  <td className="px-3 py-2 text-right">
                    <span
                      className={
                        c.ivRank < 25
                          ? 'text-emerald-400'
                          : c.ivRank < 50
                          ? 'text-yellow-400'
                          : 'text-red-400'
                      }
                    >
                      {c.ivRank.toFixed(0)}
                    </span>
                  </td>

                  {/* RSI */}
                  <td className="px-3 py-2 text-right">
                    <span
                      className={
                        c.rsi < 35
                          ? 'text-blue-400'
                          : c.rsi > 70
                          ? 'text-red-400'
                          : 'text-zinc-300'
                      }
                    >
                      {c.rsi.toFixed(0)}
                    </span>
                  </td>

                  {/* AI Score */}
                  <td className="px-3 py-2 text-center">
                    <ScoreBar score={c.aiScore} />
                  </td>

                  {/* Verdict */}
                  <td className="px-3 py-2 text-center">
                    <VerdictBadge verdict={c.aiConsensus} />
                  </td>

                  {/* Earnings risk */}
                  <td className="px-3 py-2 text-center">
                    {c.earningsDaysOut != null ? (
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${
                          c.earningsDaysOut <= 7
                            ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                            : c.earningsDaysOut <= 14
                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                            : 'bg-zinc-700/30 text-zinc-500 border border-zinc-700'
                        }`}
                        title={`Reports ${c.earningsDate ?? ''}`}
                      >
                        {c.earningsDaysOut === 0 ? 'Today!' : `${c.earningsDaysOut}d`}
                      </span>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 px-4 py-2.5 bg-zinc-900/60 border-t border-zinc-700/30 text-zinc-600">
        <span>Δ = delta (≈ prob. ITM at expiry)</span>
        <span>≈@X% = approx gain if stock moves X% (delta approx, no theta)</span>
        <span>IVR: &lt;25 = cheap ✓ &gt;50 = expensive</span>
        <span>Earnings: days until report (red ≤7d, orange ≤14d — binary event risk)</span>
        <span className="text-zinc-700">Not financial advice.</span>
      </div>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </div>
  );
}

// ── Message content renderer (supports **bold** and *italic* markers) ─────
function MessageContent({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={i} className="not-italic font-semibold text-indigo-300">{part.slice(1, -1)}</em>;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

// ── Intent pills ─────────────────────────────────────────────────────────
function IntentPills({ intent }: { intent: ChatIntent }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 pl-1">
      <span className="text-xs bg-zinc-800/80 text-zinc-400 rounded-full px-2.5 py-0.5 border border-zinc-700/50">
        ${intent.goalAmount.toLocaleString()} goal
      </span>
      <span className="text-xs bg-zinc-800/80 text-zinc-400 rounded-full px-2.5 py-0.5 border border-zinc-700/50">
        {intent.riskLevel} risk
      </span>
      <span className="text-xs bg-zinc-800/80 text-zinc-400 rounded-full px-2.5 py-0.5 border border-zinc-700/50">
        {intent.strategy.replace('_', ' ')}
      </span>
      <span className="text-xs bg-zinc-800/80 text-zinc-400 rounded-full px-2.5 py-0.5 border border-zinc-700/50">
        {intent.timeframe}
      </span>
      {intent.sectors?.map((s) => (
        <span key={s} className="text-xs bg-indigo-900/40 text-indigo-400 rounded-full px-2.5 py-0.5 border border-indigo-700/40">
          {s}
        </span>
      ))}
    </div>
  );
}

// ── Quick chips ───────────────────────────────────────────────────────────
const QUICK_CHIPS = [
  { label: 'Make $1,000 today', icon: '💵' },
  { label: 'Make $500 with low risk', icon: '🛡️' },
  { label: 'Best tech LEAPS right now', icon: '💻' },
  { label: 'Aggressive play with $20k', icon: '🚀' },
  { label: 'Show all opportunities', icon: '📊' },
];

// ── Welcome message ───────────────────────────────────────────────────────
const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! I'm your LEAPS Advisor — powered by Claude AI + live Massive.com market data. Tell me your profit goal and I'll scan all 18 LEAPS candidates, run a multi-agent AI analysis, and show you the best setups ranked by probability of success with exact position sizing.\n\nTry: *\"Make $1,000 today\"* or *\"Low-risk LEAPS for $10k capital\"*.",
  timestamp: new Date(),
};

// ── Main page ─────────────────────────────────────────────────────────────
export default function LeapsAdvisorPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);

      // Build conversation history for context window
      const history = messages
        .filter((m) => m.id !== 'welcome')
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch('/api/chat/leaps-advisor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed, history }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }

        const data: ChatResponse = await res.json();

        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: data.message,
            candidates: data.candidates,
            intent: data.intent,
            dataAge: data.dataAge,
            timestamp: new Date(),
          },
        ]);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: `Something went wrong: ${err.message ?? 'Unknown error'}. Please try again.`,
            timestamp: new Date(),
          },
        ]);
      } finally {
        setLoading(false);
        textareaRef.current?.focus();
      }
    },
    [messages, loading]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  return (
    <Layout>
      <Head>
        <title>LEAPS Advisor | GR8BUX</title>
      </Head>

      {/* Full-height chat container, negates Layout's p-6 */}
      <div className="-m-6 flex flex-col bg-zinc-950 overflow-hidden" style={{ height: 'calc(100vh - 4rem)' }}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-sm px-5 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">LEAPS Advisor</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              AI-powered scanner · 18 tickers · Claude + live Massive.com data
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>15-min delayed</span>
          </div>
        </div>

        {/* ── Messages ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 min-h-0">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {/* AI avatar */}
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-xs font-bold text-white mr-3 flex-shrink-0 mt-0.5 shadow-lg">
                  AI
                </div>
              )}

              <div className={`${msg.role === 'user' ? 'max-w-lg' : 'max-w-5xl w-full'}`}>
                {/* Bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-zinc-800/70 text-zinc-100 rounded-tl-sm border border-zinc-700/40'
                  }`}
                >
                  {msg.content.split('\n').map((line, i, arr) => (
                    <span key={i}>
                      <MessageContent text={line} />
                      {i < arr.length - 1 && <br />}
                    </span>
                  ))}
                </div>

                {/* Candidates table */}
                {msg.candidates && msg.candidates.length > 0 && (
                  <CandidatesTable
                    candidates={msg.candidates}
                    goalAmount={msg.intent?.goalAmount ?? 1000}
                  />
                )}

                {/* Intent pills + data age */}
                {msg.intent && msg.candidates && msg.candidates.length > 0 && (
                  <>
                    <IntentPills intent={msg.intent} />
                    {msg.dataAge && (
                      <p className="text-xs text-zinc-600 mt-1.5 pl-1">
                        Market data: {msg.dataAge}
                      </p>
                    )}
                  </>
                )}

                {/* Timestamp */}
                <p className="text-xs text-zinc-700 mt-1 pl-1">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center text-xs font-bold text-white mr-3 flex-shrink-0 shadow-lg">
                AI
              </div>
              <div className="bg-zinc-800/70 border border-zinc-700/40 rounded-2xl rounded-tl-sm">
                <TypingDots />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input area ────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-900/70 backdrop-blur-sm px-4 py-3">
          {/* Quick-start chips */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip.label}
                onClick={() => sendMessage(chip.label)}
                disabled={loading}
                className="flex-shrink-0 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-600 rounded-full px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <span>{chip.icon}</span>
                <span>{chip.label}</span>
              </button>
            ))}
          </div>

          {/* Textarea + send button */}
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize(e.target);
              }}
              onKeyDown={handleKeyDown}
              placeholder='Try: "Make $2,000 this week with moderate risk" or "Best tech LEAPS under $5k capital"'
              disabled={loading}
              rows={1}
              className="flex-1 bg-zinc-800/80 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-sm resize-none outline-none border border-zinc-700 focus:border-indigo-500 transition-colors disabled:opacity-50"
              style={{ maxHeight: '120px' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors flex-shrink-0 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-zinc-700 mt-2 text-center">
            Enter to send · Shift+Enter for new line · Gains are delta approximations, not financial advice
          </p>
        </div>
      </div>
    </Layout>
  );
}
