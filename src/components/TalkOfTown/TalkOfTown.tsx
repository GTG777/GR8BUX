import React from 'react';

export default function TalkOfTown() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-8">Talk of the Town</h1>

      <p className="text-lg text-gray-600 mb-8">
        Community sentiment and trending discussions from Reddit and StockTwits
      </p>

      <div className="space-y-4">
        {[1, 2, 3].map((item) => (
          <div key={item} className="card">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="text-lg font-bold">SYMBOL {item}</h3>
                <p className="text-gray-600 text-sm">Reddit r/stocks - 42 mentions | StockTwits - 18% bullish</p>
              </div>
              <span className="badge badge-success">Trending ↑</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-gray-500 text-sm mt-8">Community sentiment aggregation under development</p>
    </div>
  );
}
