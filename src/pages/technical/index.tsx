import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TechnicalSetups } from '@/components/TechnicalSetups';

interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const TechnicalPage: React.FC = () => {
  const router = useRouter();
  const [symbol, setSymbol] = useState('AAPL');
  const [symbolInput, setSymbolInput] = useState('');
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPriceData();
  }, [symbol]);

  const loadPriceData = async () => {
    setLoading(true);
    setError(null);
    try {
      // For demo purposes, generate sample price data
      // In production, this would fetch real price data from an API
      const data: PriceData[] = [];
      const basePrice = Math.random() * 100 + 100;
      const now = new Date();

      for (let i = 59; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dailyChange = (Math.random() - 0.5) * 5;
        const price = basePrice + dailyChange * i * 0.5;

        data.push({
          date: date.toISOString().split('T')[0],
          open: price * (1 + (Math.random() - 0.5) * 0.02),
          high: price * (1 + Math.abs(Math.random() * 0.03)),
          low: price * (1 - Math.abs(Math.random() * 0.03)),
          close: price,
          volume: Math.floor(Math.random() * 5000000) + 1000000,
        });
      }

      setPriceData(data);
    } catch (err) {
      setError('Failed to load price data');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeSymbol = () => {
    const sym = symbolInput.toUpperCase().trim();
    if (sym) {
      setSymbol(sym);
      setSymbolInput('');
    }
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
              <h1 className="text-3xl font-bold text-gray-900">Technical Analysis</h1>
              <Link
                href="/auth/signin?logout=true"
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Sign Out
              </Link>
            </div>
            <p className="text-gray-600 mb-4">Identify trading setups with technical pattern recognition</p>

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
          {/* Symbol Selection */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Symbol</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter symbol (e.g., AAPL)"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleChangeSymbol()}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleChangeSymbol}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Analyze
              </button>
            </div>

            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-blue-900">
                <strong>Current Symbol:</strong> {symbol}
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-8 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="mb-8 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded">
              Loading price data...
            </div>
          )}

          {/* Technical Analysis */}
          {!loading && priceData.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <TechnicalSetups symbol={symbol} priceData={priceData} />
            </div>
          )}

          {/* Info Section */}
          <div className="mt-8 grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-3">📊 What is Technical Analysis?</h3>
              <p className="text-sm text-blue-800 mb-3">
                Technical analysis uses historical price and volume data to identify trading patterns and trends.
                Our system detects key setups like coiling, consolidation, support/resistance levels, and trend formations.
              </p>
              <ul className="text-sm text-blue-800 space-y-1 ml-4">
                <li>• <strong>Coiling:</strong> Range tightening before major moves</li>
                <li>• <strong>Consolidation:</strong> Sideways trading between key levels</li>
                <li>• <strong>Support/Resistance:</strong> Key turning points</li>
                <li>• <strong>Trends:</strong> Momentum direction (up/down)</li>
              </ul>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-yellow-900 mb-3">⚠️ Risk Disclaimer</h3>
              <p className="text-sm text-yellow-800 mb-3">
                Technical setups are analytical tools for educational purposes only. They do not guarantee profits and should
                not be the sole basis for trading decisions.
              </p>
              <ul className="text-sm text-yellow-800 space-y-1 ml-4">
                <li>• Always use proper risk management</li>
                <li>• Set stop losses to limit losses</li>
                <li>• Use position sizing appropriately</li>
                <li>• Consult a financial advisor before trading</li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
};

export default TechnicalPage;
