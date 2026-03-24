'use client';

import React, { useState, useEffect } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { Trade } from '@/types';
import Link from 'next/link';

export function TradeList() {
  const { trades, isLoading, error, fetchTrades, deleteTrade, clearError } = useTradeStore();

  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'closed'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'pnl' | 'symbol'>('date');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 20;

  useEffect(() => {
    fetchTrades(
      {
        symbol: filterSymbol || undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined,
      },
      limit,
      page * limit
    );
  }, [filterSymbol, filterStatus, page]);

  const handleDelete = async (id: string) => {
    if (await deleteTrade(id)) {
      setDeleteConfirm(null);
    }
  };

  const handleClearFilters = () => {
    clearError();
    setFilterSymbol('');
    setFilterStatus('all');
    setPage(0);
  };

  const sortedTrades = [...trades].sort((a, b) => {
    switch (sortBy) {
      case 'pnl':
        return (b.pnl || 0) - (a.pnl || 0);
      case 'symbol':
        return a.symbol.localeCompare(b.symbol);
      case 'date':
      default:
        return new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime();
    }
  });

  const getWinLossColor = (pnl?: number) => {
    if (pnl === null || pnl === undefined) return 'text-gray-600';
    return pnl > 0 ? 'text-green-600 font-semibold' : pnl < 0 ? 'text-red-600 font-semibold' : 'text-gray-600';
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatCurrency = (value?: number) => {
    if (value === null || value === undefined) return '-';
    return `$${value.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Symbol</label>
            <input
              type="text"
              value={filterSymbol}
              onChange={(e) => {
                setFilterSymbol(e.target.value.toUpperCase());
                setPage(0);
              }}
              placeholder="Filter by symbol (e.g., AAPL)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value as any);
                setPage(0);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Trades</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="date">Date (Newest)</option>
              <option value="pnl">P&L (Highest)</option>
              <option value="symbol">Symbol (A-Z)</option>
            </select>
          </div>

          <button
            onClick={handleClearFilters}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-600 mt-4">Loading trades...</p>
        </div>
      )}

      {/* Trades Table */}
      {!isLoading && sortedTrades.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Symbol</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Entry Date</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">P&L</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Tags</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrades.map((trade) => (
                  <tr key={trade.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{trade.symbol}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 capitalize">{trade.type}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(trade.entryDate)}</td>
                    <td className={`px-6 py-4 text-sm text-right ${getWinLossColor(trade.pnl)}`}>
                      {formatCurrency(trade.pnl)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          trade.status === 'closed'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {trade.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {trade.tags && trade.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {trade.tags.slice(0, 2).map((tag) => (
                            <span key={tag} className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                              {tag}
                            </span>
                          ))}
                          {trade.tags.length > 2 && (
                            <span className="text-gray-500 text-xs">+{trade.tags.length - 2}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/trades/${trade.id}`}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => setDeleteConfirm(trade.id)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t">
            <div className="text-sm text-gray-600">
              Showing {page * limit + 1} to {Math.min((page + 1) * limit, trades.length)} of {trades.length} trades
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={trades.length <= (page + 1) * limit}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && sortedTrades.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-600 mb-4">No trades found</p>
          <Link href="/trades?add=true" className="text-blue-600 hover:text-blue-800 font-medium">
            Create your first trade
          </Link>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Delete Trade?</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this trade? This action cannot be undone.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
