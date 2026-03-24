import React from 'react';

export default function TradeList() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-8">Trades</h1>

      <div className="table-container">
        <table className="table-base">
          <thead className="table-header">
            <tr>
              <th className="table-header">Symbol</th>
              <th>Type</th>
              <th>Entry Date</th>
              <th>Exit Date</th>
              <th>Status</th>
              <th>P&L</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7} className="text-center py-8 text-gray-500">
                No trades found. Create your first trade to get started!
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-gray-500 text-sm mt-4">Trade list component under development</p>
    </div>
  );
}
