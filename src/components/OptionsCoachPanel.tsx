'use client';

import React, { useState, useRef, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { OptionsContext, TradeContext } from '@/pages/api/chat/options-coach';

/* ── Types ──────────────────────────────────────────────────────── */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}

export interface OptionsCoachPanelProps {
  symbol: string;
  optionsContext: OptionsContext | null;
  tradeContext: TradeContext | null;
}

/* ── Starter questions ───────────────────────────────────────────── */
function getStarters(hasTrade: boolean): string[] {
  const base = [
    'Is IV expensive or cheap right now?',
    'What strategy suits this IV environment?',
    'What does max pain level suggest?',
    'Should I be buying or selling premium?',
  ];
  if (hasTrade) base[3] = 'Break down my trade risk and theta decay.';
  return base;
}

/* ── Message bubble ─────────────────────────────────────────────── */
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-none'
            : 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white rounded-bl-none border border-gray-200 dark:border-zinc-700'
        }`}
      >
        {msg.content}
      </div>
      <p className="text-[10px] text-gray-400 dark:text-zinc-500">
        {new Date(msg.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        {' · '}
        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        {!isUser && msg.usage && (
          <span className="ml-2 opacity-60">
            {msg.usage.inputTokens.toLocaleString()} in · {msg.usage.outputTokens.toLocaleString()} out · ${msg.usage.estimatedCostUsd.toFixed(4)}
          </span>
        )}
      </p>
    </div>
  );
}

/* ── IV environment badge ────────────────────────────────────────── */
function IVBadge({ ivr }: { ivr: number | null }) {
  if (ivr === null) return null;
  const [label, cls] =
    ivr >= 70 ? ['High IV — Sell Premium', 'bg-red-100 text-red-700 border-red-200'] :
    ivr >= 40 ? ['Moderate IV', 'bg-amber-100 text-amber-700 border-amber-200'] :
                ['Low IV — Buy Options', 'bg-blue-100 text-blue-700 border-blue-200'];
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      IVR {ivr.toFixed(0)} · {label}
    </span>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export default function OptionsCoachPanel({ symbol, optionsContext, tradeContext }: OptionsCoachPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Reset conversation when symbol changes
  useEffect(() => {
    setMessages([]);
    setError('');
  }, [symbol]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    const query = text.trim();
    if (!query || isLoading || !optionsContext) return;

    setError('');
    setInput('');

    const userMsg: ChatMessage = {
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

      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/chat/options-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ symbol, optionsContext, tradeContext, query, history }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Coach error');

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: json.reply,
          timestamp: new Date().toISOString(),
          usage: json.usage,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
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

  const noData = !optionsContext;
  const starters = getStarters(!!tradeContext);

  return (
    <div
      className="flex flex-col rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden"
      style={{ height: 520 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 shrink-0">
        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-sm shrink-0">
          ⚡
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Options Coach</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-gray-400 dark:text-zinc-500">
              <span className="font-bold text-violet-600 dark:text-violet-400">{symbol}</span>
              {' · '}Claude + live IV data
            </p>
            {optionsContext && <IVBadge ivr={optionsContext.ivr} />}
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0"
            title="Clear conversation"
          >
            Clear
          </button>
        )}
      </div>

      {/* IV snapshot bar (when data loaded) */}
      {optionsContext && (
        <div className="flex gap-4 px-4 py-2 bg-gray-50 dark:bg-zinc-900/50 border-b border-gray-100 dark:border-zinc-800 text-[11px] text-gray-500 dark:text-zinc-400 shrink-0 overflow-x-auto">
          <span>HV20: <strong className="text-gray-700 dark:text-white">{optionsContext.hv20 !== null ? optionsContext.hv20.toFixed(1) + '%' : '—'}</strong></span>
          <span>Avg IV: <strong className="text-gray-700 dark:text-white">{optionsContext.avgIV !== null ? optionsContext.avgIV.toFixed(1) + '%' : '—'}</strong></span>
          {optionsContext.ivHvSpread !== null && (
            <span>
              IV−HV: <strong className={optionsContext.ivHvSpread > 3 ? 'text-red-600' : optionsContext.ivHvSpread < -3 ? 'text-blue-600' : 'text-gray-700 dark:text-white'}>
                {optionsContext.ivHvSpread > 0 ? '+' : ''}{optionsContext.ivHvSpread.toFixed(1)}%
              </strong>
            </span>
          )}
          {optionsContext.gexPositive !== null && (
            <span>GEX: <strong className={optionsContext.gexPositive ? 'text-green-600' : 'text-red-600'}>{optionsContext.gexPositive ? '+GEX' : '−GEX'}</strong></span>
          )}
          {optionsContext.maxPainPct !== null && optionsContext.topOIStrike !== null && (
            <span>Max Pain: <strong className="text-gray-700 dark:text-white">${optionsContext.topOIStrike} ({optionsContext.maxPainPct > 0 ? '+' : ''}{optionsContext.maxPainPct.toFixed(1)}%)</strong></span>
          )}
          {tradeContext && (
            <span className="text-violet-600 font-medium shrink-0">
              📊 {tradeContext.stratName} loaded
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {noData ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400 dark:text-zinc-500 text-center">
              Select a symbol and load market data to activate the coach.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-sm text-gray-500 dark:text-zinc-400 text-center">
              Ask anything about <span className="font-semibold text-gray-700 dark:text-white">{symbol}</span> options — I have the live IV environment loaded.
              {tradeContext && (
                <span className="block mt-1 text-xs text-violet-600 dark:text-violet-400">
                  Your {tradeContext.stratName} trade is also loaded — ask about risk, breakevens, or theta.
                </span>
              )}
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {starters.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  disabled={isLoading}
                  className="text-left text-xs px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 border border-violet-100 dark:border-violet-900 hover:bg-violet-100 dark:hover:bg-violet-950/60 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            {isLoading && (
              <div className="flex items-start gap-2">
                <div className="bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-2xl rounded-bl-none px-4 py-3">
                  <span className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <div ref={bottomRef} />
          </>
        )}
        {messages.length > 0 && <div ref={bottomRef} />}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={noData ? 'Load a symbol first…' : 'Ask about IV, strategy, max pain, your trade…'}
            disabled={noData || isLoading}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 dark:focus:ring-violet-600 placeholder-gray-400 dark:placeholder-zinc-500 disabled:opacity-50"
            style={{ maxHeight: 100, overflowY: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 100) + 'px';
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading || noData}
            className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            aria-label="Send"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1.5">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
