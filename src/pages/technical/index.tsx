import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
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
      const res = await fetch(`/api/market/candles?symbol=${encodeURIComponent(symbol)}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to load price data');
        return;
      }

      setPriceData(json.candles);
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

  return (
    <Layout title="Technical Analysis">
      {/* Symbol Selection */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Select Symbol</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter symbol (e.g., AAPL)"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleChangeSymbol()}
            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleChangeSymbol}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
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

      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded text-sm">{error}</div>
      )}
      {loading && (
        <div className="mb-6 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded text-sm">Loading price data...</div>
      )}

      {!loading && priceData.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <TechnicalSetups symbol={symbol} priceData={priceData} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-base font-semibold text-blue-900 mb-3">📊 What is Technical Analysis?</h3>
          <p className="text-sm text-blue-800 mb-3">
            Technical analysis uses historical price and volume data to identify trading patterns and trends.
          </p>
          <ul className="text-sm text-blue-800 space-y-1 ml-4">
            <li>• <strong>Coiling:</strong> Range tightening before major moves</li>
            <li>• <strong>Consolidation:</strong> Sideways trading between key levels</li>
            <li>• <strong>Support/Resistance:</strong> Key turning points</li>
            <li>• <strong>Trends:</strong> Momentum direction</li>
          </ul>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-base font-semibold text-yellow-900 mb-3">⚠️ Risk Disclaimer</h3>
          <p className="text-sm text-yellow-800 mb-3">
            Technical setups are analytical tools for educational purposes only and do not guarantee profits.
          </p>
          <ul className="text-sm text-yellow-800 space-y-1 ml-4">
            <li>• Always use proper risk management</li>
            <li>• Set stop losses to limit losses</li>
            <li>• Use position sizing appropriately</li>
            <li>• Consult a financial advisor before trading</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
};

export default TechnicalPage;
