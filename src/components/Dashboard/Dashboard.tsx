import React from 'react';

export default function Dashboard() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Trades', value: '0', color: 'bg-blue-100' },
          { label: 'Win Rate', value: '0%', color: 'bg-green-100' },
          { label: 'Total P&L', value: '$0', color: 'bg-purple-100' },
          { label: 'Largest Win', value: '$0', color: 'bg-emerald-100' },
        ].map((metric, idx) => (
          <div key={idx} className={`${metric.color} p-4 rounded-lg`}>
            <p className="text-sm text-gray-600">{metric.label}</p>
            <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="card">
          <h2 className="text-xl font-bold mb-4">P&L Over Time</h2>
          <div className="h-64 bg-gray-100 rounded flex items-center justify-center">
            <p className="text-gray-500">Chart coming soon...</p>
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-4">Win/Loss Distribution</h2>
          <div className="h-64 bg-gray-100 rounded flex items-center justify-center">
            <p className="text-gray-500">Chart coming soon...</p>
          </div>
        </div>
      </div>

      <div className="text-gray-500 text-sm">Dashboard under development - interactive charts and real data coming soon</div>
    </div>
  );
}
