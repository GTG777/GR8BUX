import React, { useState, useEffect, useCallback } from 'react';

interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: string;
  high: number;
  low: number;
  volume: number;
}

const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];

export const WatchlistWidget: React.FC = () => {
  const [symbols, setSymbols] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('watchlist');
      if (saved) {
        try { return JSON.parse(saved); } catch { /* use default */ }
      }
    }
    return DEFAULT_WATCHLIST;
  });
  const [quotes, setQuotes] = useState<Map<string, QuoteData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSymbol, setNewSymbol] = useState('');

  const fetchQuotes = useCallback(async () => {
    if (symbols.length === 0) return;
    setLoading(true);
    setError(null);

    const results = new Map<string, QuoteData>();
    // Fetch sequentially to avoid hammering Yahoo Finance
    for (const sym of symbols) {
      try {
        const res = await fetch(`/api/market/quote?symbol=${encodeURIComponent(sym)}`);
        if (res.ok) {
          const data = await res.json();
          results.set(sym, data);
        } else {
          console.warn(`Quote fetch failed for ${sym}: ${res.status}`);
        }
      } catch {
        // skip individual failures
      }
    }
    setQuotes(results);
    setLoading(false);
  }, [symbols]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('watchlist', JSON.stringify(symbols));
    }
  }, [symbols]);

  const addSymbol = () => {
    const sym = newSymbol.toUpperCase().trim();
    if (sym && /^[A-Z]{1,5}$/.test(sym) && !symbols.includes(sym)) {
      setSymbols(prev => [...prev, sym]);
      setNewSymbol('');
    }
  };

  const removeSymbol = (sym: string) => {
    setSymbols(prev => prev.filter(s => s !== sym));
    setQuotes(prev => {
      const next = new Map(prev);
      next.delete(sym);
      return next;
    });
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Watchlist</h3>
        <button
          onClick={fetchQuotes}
          disabled={loading}
          className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-amber-600 mb-3">{error}</p>
      )}

      {/* Add symbol input */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newSymbol}
          onChange={e => setNewSymbol(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addSymbol()}
          placeholder="Add symbol..."
          className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          maxLength={5}
        />
        <button
          onClick={addSymbol}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          +
        </button>
      </div>

      {/* Quotes list */}
      <div className="space-y-2">
        {symbols.map(sym => {
          const q = quotes.get(sym);
          return (
            <div key={sym} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg group">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-sm">{sym}</span>
                  {q && (
                    <span className="text-lg font-bold text-gray-900">
                      ${q.price.toFixed(2)}
                    </span>
                  )}
                </div>
                {q ? (
                  <div className="flex gap-3 text-xs mt-1">
                    <span className={q.change >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {q.change >= 0 ? '+' : ''}{q.change.toFixed(2)} ({q.changePercent})
                    </span>
                    <span className="text-gray-500">Vol: {(q.volume / 1e6).toFixed(1)}M</span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">
                    {loading ? 'Loading...' : 'No data'}
                  </span>
                )}
              </div>
              <button
                onClick={() => removeSymbol(sym)}
                className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                title="Remove"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          );
        })}

        {symbols.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            Add symbols to your watchlist
          </p>
        )}
      </div>
    </div>
  );
};
