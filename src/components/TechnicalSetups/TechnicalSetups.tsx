import React from 'react';

export default function TechnicalSetups() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-8">Technical Setups</h1>

      <p className="text-lg text-gray-600 mb-8">
        Automatic detection of coiling stocks and consolidation patterns
      </p>

      <div className="space-y-4">
        {['Coiling', 'Consolidation', 'Breakout Setup'].map((setupType, idx) => (
          <div key={idx} className="card">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold">{setupType} Setups</h3>
              <span className="badge badge-warning">Daily</span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-4 py-2 bg-gray-50 rounded">
                <span>AAPL</span>
                <span className="text-sm text-gray-600">RSI: 42 | BB%: 28%</span>
              </div>
              <div className="flex justify-between items-center px-4 py-2 bg-gray-50 rounded">
                <span>MSFT</span>
                <span className="text-sm text-gray-600">RSI: 38 | BB%: 15%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-gray-500 text-sm mt-8">Technical analysis under development - real indicators coming soon</p>
    </div>
  );
}
