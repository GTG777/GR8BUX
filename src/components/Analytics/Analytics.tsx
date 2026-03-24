import React from 'react';

export default function Analytics() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-8">Analytics & Performance</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {['Total P&L', 'Win Rate', 'Profit Factor', 'Max Drawdown', 'Avg Win', 'Avg Loss'].map(
          (metric, idx) => (
            <div key={idx} className="card">
              <p className="text-sm text-gray-600">{metric}</p>
              <p className="text-2xl font-bold">0</p>
            </div>
          )
        )}
      </div>

      <div className="space-y-8">
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Performance by Strategy</h2>
          <p className="text-gray-500">Strategy breakdown coming soon...</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-4">Performance by Symbol</h2>
          <p className="text-gray-500">Symbol analysis coming soon...</p>
        </div>
      </div>

      <p className="text-gray-500 text-sm mt-8">Analytics module under development</p>
    </div>
  );
}
