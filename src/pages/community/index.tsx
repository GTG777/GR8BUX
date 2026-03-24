import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { TalkOfTown } from '@/components/TalkOfTown';

const CommunityPage: React.FC = () => {
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

  return (
    <Layout title="Community Sentiment">
      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Symbols</h2>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Enter symbol (e.g., AAPL)"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddSymbol()}
                className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={handleAddSymbol} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Add</button>
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
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Source</h2>
            <div className="space-y-2">
              {(['all', 'reddit', 'stocktwits'] as const).map((src) => (
                <label key={src} className="flex items-center gap-3 cursor-pointer">
                  <input type="radio" name="source" value={src} checked={sourceFilter === src} onChange={() => setSourceFilter(src)} className="w-4 h-4 text-blue-500" />
                  <span className="text-sm text-gray-700">{src === 'all' ? 'All Sources' : src === 'reddit' ? '🔴 Reddit' : '💬 StockTwits'}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sentiment */}
      <div className="bg-white rounded-lg shadow p-6">
        <TalkOfTown symbols={selectedSymbols} source={sourceFilter} />
      </div>
    </Layout>
  );
};

export default CommunityPage;
