import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TalkOfTown } from '@/components/TalkOfTown';

const CommunityPage: React.FC = () => {
  const router = useRouter();
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['AAPL', 'GOOGL', 'MSFT']);
  const [symbolInput, setSymbolInput] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'reddit' | 'stocktwits'>('all');

  const handleAddSymbol = () => {
    const sym = symbolInput.toUpperCase().trim();
    if (sym && !selectedSymbols.includes(sym)) {
      setSelectedSymbols([...selectedSymbols, sym]);
      setSymbolInput('');
    }
  };

  const handleRemoveSymbol = (symbol: string) => {
    setSelectedSymbols(selectedSymbols.filter((s) => s !== symbol));
  };

  const navLinks = [
    { href: '/dashboard', label: '📊 Dashboard', icon: '📊' },
    { href: '/trades', label: '📈 Trades', icon: '📈' },
    { href: '/news', label: '📰 News', icon: '📰' },
    { href: '/community', label: '💬 Community', icon: '💬' },
    { href: '/technical', label: '⚙️ Technical', icon: '⚙️' },
  ];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4 mb-4">
              <h1 className="text-3xl font-bold text-gray-900">Talk of the Town</h1>
              <Link
                href="/auth/signin?logout=true"
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Sign Out
              </Link>
            </div>
            <p className="text-gray-600 mb-4">
              Community sentiment from Reddit and StockTwits • Track what traders are talking about
            </p>

            {/* Navigation Tabs */}
            <div className="flex gap-2 overflow-x-auto border-b border-gray-200">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`whitespace-nowrap px-4 py-2 font-medium transition-colors ${
                    router.pathname === link.href
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Controls */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Symbol Selection */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Symbols</h2>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Enter symbol (e.g., AAPL)"
                    value={symbolInput}
                    onChange={(e) => setSymbolInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddSymbol()}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAddSymbol}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedSymbols.map((symbol) => (
                    <div
                      key={symbol}
                      className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full flex items-center gap-2"
                    >
                      <span>{symbol}</span>
                      <button
                        onClick={() => handleRemoveSymbol(symbol)}
                        className="hover:text-blue-600 font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Source Filter */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Source</h2>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="source"
                      value="all"
                      checked={sourceFilter === 'all'}
                      onChange={(e) => setSourceFilter(e.target.value as 'all' | 'reddit' | 'stocktwits')}
                      className="w-4 h-4 text-blue-500"
                    />
                    <span className="text-gray-700">All Sources (Reddit + StockTwits)</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="source"
                      value="reddit"
                      checked={sourceFilter === 'reddit'}
                      onChange={(e) => setSourceFilter(e.target.value as 'all' | 'reddit' | 'stocktwits')}
                      className="w-4 h-4 text-blue-500"
                    />
                    <span className="text-gray-700">🔴 Reddit Only</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="source"
                      value="stocktwits"
                      checked={sourceFilter === 'stocktwits'}
                      onChange={(e) => setSourceFilter(e.target.value as 'all' | 'reddit' | 'stocktwits')}
                      className="w-4 h-4 text-blue-500"
                    />
                    <span className="text-gray-700">💬 StockTwits Only</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Sentiment Display */}
          <div className="bg-white rounded-lg shadow p-6">
            <TalkOfTown symbols={selectedSymbols} source={sourceFilter} />
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
};

export default CommunityPage;
