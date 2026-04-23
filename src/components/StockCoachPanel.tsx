'use client';

import React, { useState, useRef, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

/* ── Types ──────────────────────────────────────────────────────── */
interface StockIndicators {
  price: number;
  changePct: number;
  ema20: number;
  ema50: number;
  ema200: number;
  tsi: number;
  tsiSignal: number;
  atr14: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
  hv20: number;
  volumeRatio: number;
  high20: number;
  low20: number;
  trendScore: number;
  rsi: number;
  obvSlope: number;
}

interface StockSetup {
  id: string;
  name: string;
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  rrRatio1: number;
  rrRatio2: number;
  pop: number;
  grade: 'A' | 'B' | 'C';
  reasons: string[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}

interface StockCoachPanelProps {
  symbol: string;
  indicators: StockIndicators | null;
  setups: StockSetup[];
}

/* ── Starter questions ───────────────────────────────────────────── */
const STARTERS = [
  'What does the current setup suggest?',
  'Is momentum bullish or bearish?',
  'Where should I set my stop loss?',
  'What is the risk/reward right now?',
];

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
        {new Date(msg.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
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

/* ── Main component ─────────────────────────────────────────────── */
export default function StockCoachPanel({ symbol, indicators, setups }: StockCoachPanelProps) {
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
    if (!query || isLoading || !indicators) return;

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

      const res = await fetch('/api/chat/stock-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ symbol, indicators, setups, query, history }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Coach error');

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: json.reply,
        timestamp: new Date().toISOString(),
        usage: json.usage,
      };
      setMessages((prev) => [...prev, assistantMsg]);
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

  const noData = !indicators;

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden" style={{ height: 480 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 shrink-0">
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm shrink-0">
          📊
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Stock Coach</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500">
            Analysis for <span className="font-bold text-indigo-600 dark:text-indigo-400">{symbol}</span>
            {' · '}Claude + live indicators
          </p>
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {noData ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400 dark:text-zinc-500 text-center">
              Scan a symbol first to activate the coach.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-sm text-gray-500 dark:text-zinc-400 text-center">
              Ask anything about <span className="font-semibold text-gray-700 dark:text-white">{symbol}</span> — I have the live indicators loaded.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  disabled={isLoading}
                  className="text-left text-xs px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 transition-colors"
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
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            {error && (
              <p className="text-xs text-red-500 text-center">{error}</p>
            )}
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
            placeholder={noData ? 'Scan a symbol first…' : `Ask about ${symbol}…`}
            disabled={noData || isLoading}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-600 disabled:opacity-50"
            style={{ maxHeight: 80 }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading || noData}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors"
          >
            Send
          </button>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-1.5">
          Enter to send · Shift+Enter for new line · Context resets when you scan a new symbol
        </p>
      </div>
    </div>
  );
}
