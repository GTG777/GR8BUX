import React, { useState, useMemo } from 'react';
import { detectCandlePatterns, type Candle, type CandlePattern, type PatternSignal } from '@/lib/candlePatterns';

/* ── Tooltip (fixed-position to escape overflow clips) ───────────── */
function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
      className="relative"
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e)  => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={()  => setPos(null)}
    >
      {children}
      {pos && (
        <span
          className="fixed z-50 max-w-xs rounded-lg bg-gray-900 text-white text-xs px-3 py-2.5 shadow-xl pointer-events-none whitespace-pre-wrap leading-relaxed"
          style={{ left: pos.x + 14, top: pos.y - 8 }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

/* ── Signal colour helpers ─────────────────────────────────────── */
const SIGNAL_STYLE: Record<PatternSignal, { badge: string; dot: string; label: string }> = {
  bullish: {
    badge: 'bg-green-50  border-green-300 text-green-800',
    dot:   'bg-green-500',
    label: 'Bullish',
  },
  bearish: {
    badge: 'bg-red-50    border-red-300   text-red-800',
    dot:   'bg-red-500',
    label: 'Bearish',
  },
  neutral: {
    badge: 'bg-gray-50   border-gray-300  text-gray-700',
    dot:   'bg-gray-400',
    label: 'Neutral',
  },
};

const STRENGTH_STARS: Record<1 | 2 | 3, string> = { 1: '★☆☆', 2: '★★☆', 3: '★★★' };

/* ── Single pattern badge ─────────────────────────────────────── */
function PatternBadge({ p }: { p: CandlePattern }) {
  const style = SIGNAL_STYLE[p.signal];
  const tipText = [
    `${p.emoji} ${p.name}  [${p.spanCandles}-candle]`,
    `Signal: ${style.label}  ·  Reliability: ${STRENGTH_STARS[p.strength]}`,
    '',
    p.description,
    '',
    `📋 Trading implication: ${p.tradingImplication}`,
  ].join('\n');

  return (
    <Tip text={tipText}>
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold cursor-help select-none ${style.badge}`}>
        <span>{p.emoji}</span>
        <span>{p.name}</span>
        <span className="font-normal opacity-60">{STRENGTH_STARS[p.strength]}</span>
      </span>
    </Tip>
  );
}

/* ── Summary verdict ─────────────────────────────────────────── */
function SummaryVerdict({ patterns }: { patterns: CandlePattern[] }) {
  const bull = patterns.filter((p) => p.signal === 'bullish').reduce((s, p) => s + p.strength, 0);
  const bear = patterns.filter((p) => p.signal === 'bearish').reduce((s, p) => s + p.strength, 0);

  if (bull === 0 && bear === 0) return null;

  const diff = bull - bear;
  const label =
    diff >= 4 ? 'Strong Bullish' :
    diff >= 2 ? 'Bullish' :
    diff >= 1 ? 'Mildly Bullish' :
    diff <= -4 ? 'Strong Bearish' :
    diff <= -2 ? 'Bearish' :
    diff <= -1 ? 'Mildly Bearish' :
    'Conflicted';

  const cls =
    diff >= 2 ? 'bg-green-100 text-green-800 border-green-300' :
    diff <= -2 ? 'bg-red-100 text-red-800 border-red-300' :
    'bg-amber-100 text-amber-800 border-amber-300';

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold ${cls}`}>
      {label}
    </span>
  );
}

/* ── Main component ───────────────────────────────────────────── */
interface Props {
  candles: Candle[];
  symbol?: string;
  compact?: boolean; // if true, renders as a single line (for scanner BiasBar)
}

export default function CandlePatternsPanel({ candles, symbol, compact = false }: Props) {
  const patterns = useMemo(() => detectCandlePatterns(candles), [candles]);
  const lastCandle = candles[candles.length - 1];

  if (compact) {
    // Compact mode: single line of badges for use inside BiasBar or inline
    if (!patterns.length || !lastCandle) {
      return (
        <div>
          <span className="text-xs text-gray-400 block">Candle Patterns</span>
          <span className="text-xs text-gray-500">No pattern</span>
        </div>
      );
    }
    return (
      <div>
        <span className="text-xs text-gray-400 block">Candle Patterns</span>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {patterns.slice(0, 2).map((p) => (
            <PatternBadge key={p.name} p={p} />
          ))}
        </div>
      </div>
    );
  }

  // Full panel mode
  if (!lastCandle) return null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-5 py-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h3 className="text-sm font-bold text-gray-700">
          🕯️ Candlestick Patterns
          {symbol && <span className="font-normal text-gray-400 ml-1">· {symbol}</span>}
        </h3>
        <span className="text-xs text-gray-400">
          Last candle: {lastCandle.date} ·
          O ${lastCandle.open.toFixed(2)} H ${lastCandle.high.toFixed(2)} L ${lastCandle.low.toFixed(2)} C ${lastCandle.close.toFixed(2)}
        </span>
        {patterns.length > 0 && (
          <div className="ml-auto">
            <SummaryVerdict patterns={patterns} />
          </div>
        )}
      </div>

      {/* Pattern badges or empty state */}
      {patterns.length === 0 ? (
        <p className="text-xs text-gray-400 italic">
          No classic candlestick patterns detected on the last 3 candles.
          Check back after the current session closes for updated readings.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {patterns.map((p) => (
              <PatternBadge key={p.name} p={p} />
            ))}
          </div>

          {/* Detail table for strongest patterns */}
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden mt-2">
            {patterns.slice(0, 4).map((p) => (
              <div key={p.name} className="flex items-start gap-3 px-3 py-2.5 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                <span className="text-base mt-0.5">{p.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-800">{p.name}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${SIGNAL_STYLE[p.signal].badge} border`}>
                      {SIGNAL_STYLE[p.signal].label}
                    </span>
                    <span className="text-[10px] text-gray-400">{STRENGTH_STARS[p.strength]} · {p.spanCandles}-candle</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                  <p className="text-xs text-indigo-600 mt-0.5">📋 {p.tradingImplication}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
