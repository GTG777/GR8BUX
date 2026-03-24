import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';

interface WatchlistItem {
  symbol: string;
  tsi: number | null;
  price: number | null;
  change: number | null;
  changePercent: string | null;
  isCoiling: boolean | null;
  loading: boolean;
  error: string | null;
}

const AdvancedWatchlist: React.FC = () => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [symbolInput, setSymbolInput] = useState('');

  // Load watchlist from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('advancedWatchlist');
    if (saved) {
      try {
        const symbols = JSON.parse(saved) as string[];
        initializeWatchlist(symbols);
      } catch {
        initializeWatchlist(['AAPL', 'MSFT', 'GOOGL']);
      }
    } else {
      initializeWatchlist(['AAPL', 'MSFT', 'GOOGL']);
    }
  }, []);

  const initializeWatchlist = (symbols: string[]) => {
    const items = symbols.map(symbol => ({
      symbol,
      tsi: null,
      price: null,
      change: null,
      changePercent: null,
      isCoiling: null,
      loading: true,
      error: null,
    }));
    setWatchlist(items);
    fetchDataForSymbols(items);
  };

  const fetchDataForSymbols = async (items: WatchlistItem[]) => {
    for (const item of items) {
      fetchSymbolData(item.symbol);
    }
  };

  const fetchSymbolData = async (symbol: string) => {
    setWatchlist(prev =>
      prev.map(item =>
        item.symbol === symbol ? { ...item, loading: true, error: null } : item
      )
    );

    try {
      // Fetch quote data
      const quoteRes = await fetch(`/api/market/quote?symbol=${encodeURIComponent(symbol)}`);
      if (!quoteRes.ok) throw new Error('Failed to fetch quote');
      const quoteData = await quoteRes.json();

      // Fetch candle data for TSI and coiling
      const candleRes = await fetch(`/api/market/candles?symbol=${encodeURIComponent(symbol)}&range=compact`);
      if (!candleRes.ok) throw new Error('Failed to fetch candles');
      const candleData = await candleRes.json();

      // Calculate TSI
      const closes = candleData.candles.map((c: any) => c.close);
      const tsiRes = await fetch('/api/technical/tsi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closes }),
      });
      const tsiData = tsiRes.ok ? await tsiRes.json() : { tsi: null };

      // Detect coiling
      const coilingRes = await fetch('/api/technical/coiling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candles: candleData.candles }),
      });
      const coilingData = coilingRes.ok ? await coilingRes.json() : { isCoiling: null };

      setWatchlist(prev =>
        prev.map(item =>
          item.symbol === symbol
            ? {
                ...item,
                price: quoteData.price,
                change: quoteData.change,
                changePercent: quoteData.changePercent,
                tsi: tsiData.tsi,
                isCoiling: coilingData.isCoiling,
                loading: false,
              }
            : item
        )
      );
    } catch (err) {
      setWatchlist(prev =>
        prev.map(item =>
          item.symbol === symbol
            ? { ...item, error: err instanceof Error ? err.message : 'Unknown error', loading: false }
            : item
        )
      );
    }
  };

  const addSymbol = () => {
    const sym = symbolInput.toUpperCase().trim();
    if (sym && /^[A-Z]{1,5}$/.test(sym) && !watchlist.some(w => w.symbol === sym)) {
      setWatchlist(prev => [...prev, { symbol: sym, tsi: null, price: null, change: null, changePercent: null, isCoiling: null, loading: true, error: null }]);
      setSymbolInput('');
      localStorage.setItem('advancedWatchlist', JSON.stringify([...watchlist.map(w => w.symbol), sym]));
      fetchSymbolData(sym);
    }
  };

  const removeSymbol = (symbol: string) => {
    setWatchlist(prev => prev.filter(w => w.symbol !== symbol));
    localStorage.setItem(
      'advancedWatchlist',
      JSON.stringify(watchlist.filter(w => w.symbol !== symbol).map(w => w.symbol))
    );
  };

  const refreshAll = () => {
    watchlist.forEach(item => fetchSymbolData(item.symbol));
  };

  return (
    <Layout title="Advanced Watchlist">
      <div className="space-y-6">
        {/* Add Symbol */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Symbol</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={symbolInput}
              onChange={e => setSymbolInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && addSymbol()}
              placeholder="Enter symbol (e.g., AAPL)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={5}
            />
            <button
              onClick={addSymbol}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Add
            </button>
            <button
              onClick={refreshAll}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
            >
              Refresh All
            </button>
          </div>
        </div>

        {/* Watchlist Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-300">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Ticker</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Current Price</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Day Change</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">True Strength Index</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">Coiling</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">Action</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{item.symbol}</td>
                    <td className="px-6 py-4 text-right text-sm text-gray-900">
                      {item.loading ? <span className="text-gray-400">Loading...</span> : item.error ? <span className="text-red-600 text-xs">{item.error}</span> : <span>${item.price?.toFixed(2)}</span>}
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      {item.loading ? (
                        <span className="text-gray-400">Loading...</span>
                      ) : item.change !== null ? (
                        <span className={item.change >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                          {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)} ({item.changePercent})
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      {item.loading ? (
                        <span className="text-gray-400">Loading...</span>
                      ) : item.tsi !== null ? (
                        <span className={item.tsi > 0 ? 'font-semibold text-green-600' : 'font-semibold text-red-600'}>
                          {item.tsi.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      {item.loading ? (
                        <span className="text-gray-400">Loading...</span>
                      ) : item.isCoiling === true ? (
                        <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 rounded font-semibold text-xs">
                          Yes ⚡
                        </span>
                      ) : (
                        <span className="text-gray-500">No</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      <button
                        onClick={() => removeSymbol(item.symbol)}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {watchlist.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No symbols in watchlist. Add one above.
            </div>
          )}
        </div>

        {/* Info */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">True Strength Index (TSI)</h3>
            <p className="text-sm text-blue-800">
              Momentum oscillator (-100 to +100). Positive = uptrend, Negative = downtrend. Useful for confirming price movements.
            </p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 mb-2">Day Change</h3>
            <p className="text-sm text-purple-800">
              Dollar and percentage change from previous close. Green = gain, Red = loss.
            </p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-900 mb-2">Coiling ⚡</h3>
            <p className="text-sm text-yellow-800">
              Tight consolidation with decreasing volatility. Often precedes significant breakout moves.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AdvancedWatchlist;
