import React from 'react';

export default function NewsPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-8">Market News & Headlines</h1>

      {/* Search and Filters */}
      <div className="mb-6 flex gap-4">
        <input
          type="text"
          placeholder="Search headlines or symbols..."
          className="input-field flex-1"
        />
        <button className="btn-primary">Search</button>
      </div>

      {/* News Items */}
      <div className="space-y-4">
        {[1, 2, 3].map((item) => (
          <div key={item} className="card">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-lg font-bold">Breaking News Headline {item}</h3>
              <span className="badge badge-warning">5 min ago</span>
            </div>
            <p className="text-gray-600 mb-3">
              This is a placeholder for news headline summary. Real headlines from Yahoo Finance, MSN,
              and Google Finance will be displayed here...
            </p>
            <div className="flex gap-2">
              <span className="badge badge-success">AAPL</span>
              <span className="badge badge-success">MSFT</span>
              <a href="#" className="text-blue-600 hover:underline text-sm">
                Read more →
              </a>
            </div>
          </div>
        ))}
      </div>

      <p className="text-gray-500 text-sm mt-8">
        News aggregation service under development - real headlines coming soon
      </p>
    </div>
  );
}
