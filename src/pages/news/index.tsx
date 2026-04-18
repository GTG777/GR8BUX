import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { NewsDisplay } from '@/components/NewsDisplay';
import SectorNewsGrid from '@/components/NewsPage/SectorNewsGrid';

const NewsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'symbols' | 'sectors'>('symbols');
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['AAPL', 'GOOGL', 'MSFT', 'TSLA']);
  const [symbolInput, setSymbolInput] = useState('');
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);

  const loadFromWatchlist = () => {
    try {
      const saved = localStorage.getItem('advancedWatchlist');
      if (saved) {
        const symbols = JSON.parse(saved) as string[];
        setSelectedSymbols(prev => {
          const merged = [...new Set([...prev, ...symbols])];
          return merged;
        });
        setWatchlistLoaded(true);
        setTimeout(() => setWatchlistLoaded(false), 2000);
      }
    } catch {
      // ignore parse errors
    }
  };

  const handleAddSymbol = () => {
    const sym = symbolInput.toUpperCase().trim();
    if (sym && /^[A-Z]{1,5}$/.test(sym) && !selectedSymbols.includes(sym)) {
      setSelectedSymbols([...selectedSymbols, sym]);
      setSymbolInput('');
    } else if (sym && !/^[A-Z]{1,5}$/.test(sym)) {
      alert('Invalid symbol format. Use 1-5 uppercase letters (e.g., AAPL)');
    }
  };

  const handleRemoveSymbol = (symbol: string) => {
    setSelectedSymbols(selectedSymbols.filter((s) => s !== symbol));
  };

  return (
    <Layout title="Market News">
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-zinc-800 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('symbols')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'symbols'
              ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 shadow'
              : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300'
          }`}
        >
          📰 By Symbol
        </button>
        <button
          onClick={() => setActiveTab('sectors')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'sectors'
              ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 shadow'
              : 'text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300'
          }`}
        >
          🏛️ All 11 Sectors
        </button>
      </div>

      {activeTab === 'symbols' ? (
        <>
          {/* Symbol Selection */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Symbols</h2>
              <button
                onClick={loadFromWatchlist}
                className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
              >
                {watchlistLoaded ? '✓ Loaded!' : '📋 Load from Watchlist'}
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Enter symbol (e.g., AAPL)"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddSymbol()}
                className="flex-1 px-3 py-2 border border-zinc-700 rounded text-sm bg-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleAddSymbol}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedSymbols.map((symbol) => (
                <div key={symbol} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full flex items-center gap-2 text-sm">
                  <span>{symbol}</span>
                  <button onClick={() => handleRemoveSymbol(symbol)} className="hover:text-blue-600 font-bold">×</button>
                </div>
              ))}
            </div>
          </div>

          {/* News Display */}
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow p-6">
            <NewsDisplay symbols={selectedSymbols} maxArticles={50} />
          </div>
        </>
      ) : (
        <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sector News Dashboard</h2>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Latest news and sentiment across all 11 GICS sectors, tracked via sector ETFs.
            </p>
          </div>
          <SectorNewsGrid />
        </div>
      )}
    </Layout>
  );
};

export default NewsPage;
