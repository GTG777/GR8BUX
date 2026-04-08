import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '@/components/Layout';
import { useRouter } from 'next/router';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/Skeleton';

interface WatchlistItem {
  symbol: string;
  tsi: number | null;
  price: number | null;
  change: number | null;
  changePercent: string | null;
  isCoiling: boolean | null;
  coilingStrength: number | null;
  sparkline: { v: number }[];
  volumeRatio: number | null;
  loading: boolean;
  error: string | null;
}

const AdvancedWatchlist: React.FC = () => {
  const router = useRouter();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [symbolInput, setSymbolInput] = useState('');
  const [sortColumn, setSortColumn] = useState<keyof WatchlistItem | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const initializeWatchlist = React.useCallback((symbols: string[]) => {
    const items = symbols.map(symbol => ({
      symbol,
      tsi: null,
      price: null,
      change: null,
      changePercent: null,
      isCoiling: null,
      coilingStrength: null,
      sparkline: [],
      volumeRatio: null,
      loading: true,
      error: null,
    }));
    setWatchlist(items);
    symbols.forEach(sym => fetchSymbolData(sym));
  }, []);

  const fetchSymbolData = React.useCallback(async (symbol: string) => {
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
      // Last 20 closes for sparkline, volume ratio (today vs 20-day avg)
      const recentCandles: any[] = candleData.candles.slice(-20);
      const sparkline = recentCandles.map((c: any) => ({ v: c.close }));
      const recentVols: number[] = recentCandles.map((c: any) => c.volume);
      const avgVol = recentVols.length > 1
        ? recentVols.slice(0, -1).reduce((a, b) => a + b, 0) / (recentVols.length - 1)
        : 0;
      const todayVol = recentVols[recentVols.length - 1] ?? 0;
      const volumeRatio = avgVol > 0 ? todayVol / avgVol : null;

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
                coilingStrength: coilingData.strength ?? null,
                sparkline,
                volumeRatio,
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
  }, []);

  // Load watchlist from localStorage on mount + start 60s auto-refresh
  useEffect(() => {
    const saved = localStorage.getItem('advancedWatchlist');
    let symbols: string[];
    if (saved) {
      try {
        symbols = JSON.parse(saved) as string[];
      } catch {
        symbols = ['AAPL', 'MSFT', 'GOOGL'];
      }
    } else {
      symbols = ['AAPL', 'MSFT', 'GOOGL'];
    }
    initializeWatchlist(symbols);

    refreshTimerRef.current = setInterval(() => {
      setWatchlist(prev => {
        prev.forEach(item => fetchSymbolData(item.symbol));
        return prev;
      });
    }, 60_000);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [initializeWatchlist, fetchSymbolData]);

  const addSymbol = () => {
    const sym = symbolInput.toUpperCase().trim();
    if (sym && /^[A-Z]{1,5}$/.test(sym) && !watchlist.some(w => w.symbol === sym)) {
      setWatchlist(prev => [...prev, { symbol: sym, tsi: null, price: null, change: null, changePercent: null, isCoiling: null, coilingStrength: null, sparkline: [], volumeRatio: null, loading: true, error: null }]);
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

  const handleSort = (column: keyof WatchlistItem) => {
    if (sortColumn === column) {
      // Toggle sort order if clicking the same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column and default to ascending
      setSortColumn(column);
      setSortOrder('asc');
    }
  };

  const getSortedWatchlist = () => {
    if (!sortColumn) return watchlist;

    const sorted = [...watchlist].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      // Handle null values
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return sortOrder === 'asc' ? 1 : -1;
      if (bVal === null) return sortOrder === 'asc' ? -1 : 1;

      // Compare values
      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
        comparison = (aVal === bVal) ? 0 : aVal ? 1 : -1;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  };

  const SortIcon = ({ column }: { column: keyof WatchlistItem }) => {
    if (sortColumn !== column) {
      return <span className="ml-1 text-gray-400">⇅</span>;
    }
    return <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
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
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('symbol')}>
                    Ticker <SortIcon column="symbol" />
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('price')}>
                    Current Price <SortIcon column="price" />
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('change')}>
                    Day Change <SortIcon column="change" />
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('tsi')}>
                    True Strength Index <SortIcon column="tsi" />
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('isCoiling')}>
                    Coiling <SortIcon column="isCoiling" />
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('coilingStrength')}>
                    Coiling Strength <SortIcon column="coilingStrength" />
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('volumeRatio')}>
                    Vol Ratio <SortIcon column="volumeRatio" />
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">5D Chart</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">Action</th>
                </tr>
              </thead>
              <tbody>
                {getSortedWatchlist().map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-semibold">
                      <button
                        onClick={() => router.push(`/stocks?symbol=${item.symbol}`)}
                        className="text-blue-700 hover:text-blue-900 hover:underline font-bold"
                      >
                        {item.symbol}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-900">
                      {item.loading ? <Skeleton className="h-4 w-16 ml-auto" /> : item.error ? <span className="text-red-600 text-xs">{item.error}</span> : <span>${item.price?.toFixed(2)}</span>}
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      {item.loading ? (
                        <Skeleton className="h-4 w-20 ml-auto" />
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
                        <Skeleton className="h-4 w-12 mx-auto" />
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
                        <Skeleton className="h-4 w-10 mx-auto" />
                      ) : item.isCoiling === true ? (
                        <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 rounded font-semibold text-xs">
                          Yes ⚡
                        </span>
                      ) : (
                        <span className="text-gray-500">No</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      {item.loading ? (
                        <Skeleton className="h-4 w-14 mx-auto" />
                      ) : item.coilingStrength !== null ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-12 bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full ${
                                item.coilingStrength > 0.7 ? 'bg-red-500' : item.coilingStrength > 0.4 ? 'bg-yellow-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${item.coilingStrength * 100}%` }}
                            ></div>
                          </div>
                          <span className="font-semibold text-gray-900 text-xs">
                            {(item.coilingStrength * 100).toFixed(0)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center text-sm">
                      {item.loading ? (
                        <span className="text-gray-400">-</span>
                      ) : item.volumeRatio !== null ? (
                        <span className={`font-semibold ${
                          item.volumeRatio >= 2 ? 'text-red-600' :
                          item.volumeRatio >= 1.5 ? 'text-orange-500' :
                          item.volumeRatio >= 1 ? 'text-green-600' : 'text-gray-500'
                        }`}>
                          {item.volumeRatio.toFixed(2)}x
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {item.loading ? (
                        <Skeleton className="h-8 w-20 mx-auto" />
                      ) : item.sparkline.length > 1 ? (
                        <div className="w-20 h-8 inline-block">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={item.sparkline}>
                              <Line
                                type="monotone"
                                dataKey="v"
                                dot={false}
                                strokeWidth={1.5}
                                stroke={item.change !== null && item.change >= 0 ? '#16a34a' : '#dc2626'}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
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
