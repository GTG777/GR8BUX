import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { NewsDisplay } from '@/components/NewsDisplay';

const NewsPage: React.FC = () => {
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['AAPL', 'GOOGL', 'MSFT', 'TSLA']);
  const [symbolInput, setSymbolInput] = useState('');

  const handleAddSymbol = () => {
    const sym = symbolInput.toUpperCase().trim();
    // Validate symbol format: 1-5 uppercase letters
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
      {/* Symbol Selection */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
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
      <div className="bg-white rounded-lg shadow p-6">
        <NewsDisplay symbols={selectedSymbols} maxArticles={50} />
      </div>
    </Layout>
  );
};

export default NewsPage;
