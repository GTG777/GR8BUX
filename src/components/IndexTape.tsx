import React, { useEffect, useState, useCallback } from 'react';

const SYMBOLS = [
  'SPY', 'QQQ', 'IWM', 'DIA',
  'NVDA', 'AAPL', 'MSFT', 'TSLA', 'META', 'GOOGL', 'AMZN', 'JPM',
  'NVDA', 'AMD', 'NFLX', 'DIS', 'BAC', 'GS', 'XOM', 'GLD',
];

interface Quote {
  symbol: string;
  price: number;
  changePct: number;
}

function QuoteItem({ q }: { q: Quote }) {
  const up = q.changePct >= 0;
  return (
    <div className="flex items-center gap-1.5 shrink-0 px-4 border-r border-gray-100 dark:border-zinc-800">
      <span className="text-[11px] font-bold text-gray-600 dark:text-zinc-400 uppercase tracking-wide">
        {q.symbol}
      </span>
      <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
        {q.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span className={`text-[11px] font-medium tabular-nums ${up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
        {up ? '▲' : '▼'} {Math.abs(q.changePct).toFixed(2)}%
      </span>
    </div>
  );
}

export default function IndexTape() {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  const fetchQuotes = useCallback(async () => {
    try {
      const results = await Promise.all(
        // Deduplicate symbols for fetch
        [...new Set(SYMBOLS)].map(async (sym) => {
          const res = await fetch(`/api/market/quote?symbol=${encodeURIComponent(sym)}`);
          if (!res.ok) return null;
          const d = await res.json();
          const price: number = d.price ?? 0;
          const changePct: number = parseFloat((d.changePercent ?? '0').toString().replace('%', ''));
          return { symbol: sym, price, changePct } as Quote;
        }),
      );
      setQuotes(results.filter(Boolean) as Quote[]);
    } catch {
      // silently fail — tape is decorative
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
    const id = setInterval(fetchQuotes, 60_000);
    return () => clearInterval(id);
  }, [fetchQuotes]);

  if (quotes.length === 0) {
    return (
      <div className="h-9 flex items-center px-4">
        <span className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
        <span className="text-xs text-gray-400 dark:text-zinc-500">Loading market data…</span>
      </div>
    );
  }

  // Duplicate content so the CSS marquee loops seamlessly
  const allQuotes = [...quotes, ...quotes];

  return (
    <div className="overflow-hidden py-1.5 bg-white dark:bg-zinc-900">
      <div className="flex animate-ticker whitespace-nowrap">
        {allQuotes.map((q, i) => (
          <QuoteItem key={`${q.symbol}-${i}`} q={q} />
        ))}
      </div>
    </div>
  );
}
