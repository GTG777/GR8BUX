'use client';

/**
 * TradeCoachPanel
 *
 * RAG-powered conversational trading coach.
 * Retrieves semantically similar past trades and uses Claude to deliver
 * personalized, evidence-based coaching grounded in the user's own history.
 *
 * Props:
 *   currentTrade? — if provided, seeds the retrieval query with trade context
 */

import React, { useState, useRef, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { CoachChatMessage, CoachSimilarTrade, CoachPatterns } from '@/types/agents';

interface CurrentTrade {
  symbol?: string;
  type?: string;
  setupType?: string;
  pnl?: number;
  notes?: string;
  tags?: string[];
}

interface TradeCoachPanelProps {
  currentTrade?: CurrentTrade;
  className?: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SimilarTradeCard({ trade }: { trade: CoachSimilarTrade }) {
  const outcomeColors = {
    win:        'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
    loss:       'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    breakeven:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-foreground">{trade.symbol}</span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${outcomeColors[trade.outcome]}`}>
          {trade.outcome.toUpperCase()}
        </span>
        <span className="text-muted-foreground ml-auto">{Math.round(trade.similarity * 100)}% match</span>
      </div>
      {trade.pnl != null && (
        <p className={trade.pnl >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
          {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
        </p>
      )}
      {trade.setup_type && <p className="text-muted-foreground">Setup: {trade.setup_type}</p>}
      {trade.tags?.length > 0 && (
        <p className="text-muted-foreground truncate">Tags: {trade.tags.join(', ')}</p>
      )}
    </div>
  );
}

function PatternsBadge({ patterns }: { patterns: CoachPatterns }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-medium">
        Win Rate: {patterns.winRate}%
      </span>
      {patterns.avgWin > 0 && (
        <span className="bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded font-medium">
          Avg Win: +${patterns.avgWin.toFixed(0)}
        </span>
      )}
      {patterns.avgLoss < 0 && (
        <span className="bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded font-medium">
          Avg Loss: ${patterns.avgLoss.toFixed(0)}
        </span>
      )}
      {patterns.riskWarnings.map((w, i) => (
        <span key={i} className="bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded font-medium">
          ⚠️ {w}
        </span>
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: CoachChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-gradient-brand text-white rounded-br-none'
            : 'bg-muted text-foreground rounded-bl-none border border-border'
        }`}
      >
        {msg.content}
      </div>

      {/* Patterns from RAG (on assistant messages) */}
      {!isUser && msg.patterns && msg.patterns.topSetups.length > 0 && (
        <div className="max-w-[85%] w-full">
          <PatternsBadge patterns={msg.patterns} />
        </div>
      )}

      {/* Similar trades retrieved */}
      {!isUser && msg.similarTrades && msg.similarTrades.length > 0 && (
        <div className="max-w-[85%] w-full space-y-1">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
            📂 Similar trades from your journal
          </p>
          {msg.similarTrades.map((t) => (
            <SimilarTradeCard key={t.trade_id} trade={t} />
          ))}
        </div>
      )}

      {/* Suggested actions */}
      {!isUser && msg.suggestedActions && msg.suggestedActions.length > 0 && (
        <div className="max-w-[85%] w-full space-y-1">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
            ✅ Suggested actions
          </p>
          <ul className="space-y-1">
            {msg.suggestedActions.map((a, i) => (
              <li key={i} className="flex gap-2 text-xs text-foreground">
                <span className="text-blue-500 font-bold shrink-0">→</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        {new Date(msg.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
        {' · '}
        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
}

// ─── Suggested starters ───────────────────────────────────────────────────────

const STARTERS = [
  'What are my strongest setups?',
  'Where do I tend to lose money?',
  'Am I taking too much risk?',
  'What should I work on this week?',
];

// ─── Main component ───────────────────────────────────────────────────────────

export function TradeCoachPanel({ currentTrade, className = '' }: TradeCoachPanelProps) {
  const [messages, setMessages] = useState<CoachChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Load session from DB on mount ─────────────────────────────────────────
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) { setSessionLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data?.session?.access_token;
      if (!token) { setSessionLoading(false); return; }
      try {
        const res = await fetch('/api/chat/coach-session', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data.messages.length > 0) {
            setMessages(json.data.messages);
          }
        }
      } finally {
        setSessionLoading(false);
      }
    });
  }, []);

  // ── Persist session to DB (fire-and-forget) ───────────────────────────────
  const saveSession = async (msgs: CoachChatMessage[]) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    fetch('/api/chat/coach-session', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: msgs }),
    }).catch(() => {/* silent */});
  };

  // ── Clear session ─────────────────────────────────────────────────────────
  const clearSession = async () => {
    setMessages([]);
    saveSession([]);
  };

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    const query = text.trim();
    if (!query || isLoading) return;

    setError('');
    setInput('');

    const userMsg: CoachChatMessage = {
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Database not configured');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      // Build history (exclude current user message — it's sent as `query`)
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/chat/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, currentTrade, history }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Coach error');

      const { reply, similarTrades, patterns, suggestedActions } = json.data;

      const assistantMsg: CoachChatMessage = {
        role: 'assistant',
        content: reply,
        timestamp: new Date().toISOString(),
        similarTrades,
        patterns,
        suggestedActions,
      };
      setMessages((prev) => {
        const next = [...prev, assistantMsg];
        saveSession(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      // Remove the optimistic user message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-background rounded-xl border border-border overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-brand flex items-center justify-center text-white text-sm">
          🎓
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Trade Coach</p>
          <p className="text-xs text-muted-foreground">Powered by RAG + Claude — grounded in your own trade history</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearSession}
            title="Clear chat history"
            className="text-xs text-muted-foreground hover:text-red-500 transition-colors shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {sessionLoading && (
          <div className="flex justify-center pt-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        )}
        {!sessionLoading && messages.length === 0 && (
          <div className="text-center pt-6 pb-2">
            <p className="text-2xl mb-2">📚</p>
            <p className="text-sm font-medium text-foreground mb-1">Your personal trading coach</p>
            <p className="text-xs text-muted-foreground mb-6">
              Ask anything &mdash; I&apos;ll ground my answer in your actual past trades.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="bg-muted border border-border rounded-2xl rounded-bl-none px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 shrink-0 bg-card">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your coach… (Enter to send, Shift+Enter for new line)"
            rows={2}
            className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="px-4 rounded-xl bg-gradient-brand text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          Coach uses your trade journal for personalized coaching. Not financial advice.
        </p>
      </div>
    </div>
  );
}
