import React, { useEffect, useState, useCallback } from 'react';

const SYMBOLS = [
  'SPY', 'QQQ', 'IWM', 'DIA',
  'NVDA', 'AAPL', 'MSFT', 'TSLA', 'META', 'GOOGL', 'AMZN', 'JPM',
];

interface Quote {
  symbol: string;
  price: number;
  changePct: number;
}

export default function IndexTape() {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  const fetchQuotes = useCallback(async () => {
    try {
      const results = await Promise.all(
        SYMBOLS.map(async (sym) => {
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
      <div className="h-10 flex items-center px-4">
        <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
        <span className="text-xs text-gray-400 dark:text-zinc-500">Loading quotes…</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto scrollbar-hide py-2 px-4">
      <div className="flex gap-6 min-w-max">
        {quotes.map((q) => (
          <div key={q.symbol} className="flex items-baseline gap-1.5 shrink-0">
            <span className="text-xs font-bold text-gray-700 dark:text-zinc-300 uppercase tracking-wide">
              {q.symbol}
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
              {q.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span
              className={`text-xs font-medium tabular-nums ${
                q.changePct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {q.changePct >= 0 ? '+' : ''}{q.changePct.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
