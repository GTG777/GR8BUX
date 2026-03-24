import React from 'react';

export default function TradeForm() {
  return (
    <div className="card max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">New Trade</h2>
      
      {/* Placeholder form */}
      <form>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">Trade Type</label>
            <select className="input-field">
              <option>Stock</option>
              <option>Option</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Symbol</label>
            <input type="text" placeholder="AAPL" className="input-field" />
          </div>
        </div>

        <div className="flex gap-4">
          <button type="submit" className="btn-primary flex-1">
            Log Trade
          </button>
          <button type="button" className="btn-secondary flex-1">
            Cancel
          </button>
        </div>
      </form>

      <p className="text-gray-500 text-sm mt-4">Component under development - full form coming soon</p>
    </div>
  );
}
