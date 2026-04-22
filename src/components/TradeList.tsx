'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { Trade } from '@/types';
import Link from 'next/link';
import axios from 'axios';
import { getSupabaseClient } from '@/lib/supabase';

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseClient();
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface InlineEdit {
  exitDate: string;
  exitPrice: string;
  status: 'open' | 'closed';
}

export function TradeList() {
  const { trades, totalCount, isLoading, error, fetchTrades, deleteTrade, clearError } = useTradeStore();

  const [filterSymbol, setFilterSymbol] = useState('');
  const [debouncedSymbol, setDebouncedSymbol] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'closed'>('all');
  const [filterType, setFilterType] = useState<'all' | 'stock' | 'option'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'pnl' | 'symbol'>('date');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 20;

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<InlineEdit | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  function toDateInput(d?: string | null) {
    if (!d) return '';
    return d.slice(0, 10);
  }

  function openInlineEdit(trade: Trade) {
    setInlineError(null);
    const exitPrice = trade.stockData?.exitPrice != null
      ? String(trade.stockData.exitPrice)
      : trade.optionData?.legs?.[0]?.exitPrice != null
      ? String(trade.optionData.legs[0].exitPrice)
      : '';
    setEditRow({
      exitDate: toDateInput(trade.exitDate),
      exitPrice,
      status: trade.status as 'open' | 'closed',
    });
    setEditingId(trade.id);
  }

  async function handleInlineSave(trade: Trade) {
    if (!editRow) return;
    setSavingId(trade.id);
    setInlineError(null);
    try {
      const headers = await authHeaders();
      const body: Record<string, any> = {
        status: editRow.status,
        exit_date: editRow.exitDate ? new Date(editRow.exitDate + 'T12:00:00').toISOString() : null,
      };
      const ep = editRow.exitPrice !== '' ? parseFloat(editRow.exitPrice) : undefined;
      if (trade.type === 'stock' && trade.stockData) {
        body.stockData = {
          quantity: trade.stockData.quantity,
          entryPrice: trade.stockData.entryPrice,
          exitPrice: ep,
        };
      } else if (trade.type === 'option' && trade.optionData?.legs?.length) {
        body.legUpdates = trade.optionData.legs.map((leg) => ({
          id: leg.id,
          exitPrice: ep,
          entryPrice: leg.entryPrice,
          quantity: leg.quantity,
          direction: leg.direction,
        }));
      }
      const res = await axios.put(`/api/trades/${trade.id}`, body, { headers });
      if (res.data.success) {
        // Update local store trades list directly
        useTradeStore.setState((state) => ({
          trades: state.trades.map((t) => t.id === trade.id ? res.data.data : t),
        }));
        setEditingId(null);
        setEditRow(null);
      } else {
        setInlineError(res.data.error || 'Failed to save');
      }
    } catch {
      setInlineError('Failed to save changes.');
    } finally {
      setSavingId(null);
    }
  }

  // Debounce symbol input — only fire fetch after 350ms of no typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSymbol(filterSymbol.trim()), 350);
    return () => clearTimeout(timer);
  }, [filterSymbol]);

  // Reset to page 0 when symbol changes
  useEffect(() => {
    setPage(0);
  }, [debouncedSymbol]);

  useEffect(() => {
    fetchTrades(
      {
        symbol: debouncedSymbol || undefined,
        status: filterStatus !== 'all' ? filterStatus : undefined,
        type: filterType !== 'all' ? filterType : undefined,
      },
      limit,
      page * limit
    );
  }, [debouncedSymbol, filterStatus, filterType, page]);

  const handleDelete = async (id: string) => {
    if (await deleteTrade(id)) {
      setDeleteConfirm(null);
    }
  };

  const handleClearFilters = () => {
    clearError();
    setFilterSymbol('');
    setDebouncedSymbol('');
    setFilterStatus('all');
    setFilterType('all');
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
    const [y, m, d] = date.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
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
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-400 mb-1">Symbol</label>
            <input
              type="text"
              value={filterSymbol}
              onChange={(e) => {
                setFilterSymbol(e.target.value.toUpperCase());
                setPage(0);
              }}
              placeholder="Filter by symbol (e.g., AAPL)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-400 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value as any);
                setPage(0);
              }}
              className="px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Trades</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-400 mb-1">Type</label>
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value as any);
                setPage(0);
              }}
              className="px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="stock">Stock</option>
              <option value="option">Option</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-400 mb-1">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="date">Date (Newest)</option>
              <option value="pnl">P&L (Highest)</option>
              <option value="symbol">Symbol (A-Z)</option>
            </select>
          </div>

          <button
            onClick={handleClearFilters}
            className="px-4 py-2 bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-zinc-200 rounded-lg hover:bg-gray-300 dark:hover:bg-zinc-600 font-medium"
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

      {/* Inline edit error */}
      {inlineError && (
        <div className="px-4 py-2 bg-red-900/30 border border-red-700/50 rounded-lg text-red-400 text-sm">
          {inlineError}
        </div>
      )}

      {/* Trades Table */}
      {!isLoading && sortedTrades.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow">
          <div className="overflow-x-auto rounded-lg">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-zinc-800/60 border-b dark:border-zinc-700/50">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-zinc-300">Symbol</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-zinc-300">Type</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 dark:text-zinc-300">Side</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-zinc-300">Qty</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-zinc-300">Entry Date</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-zinc-300">Exit Date</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-zinc-300">Entry $</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-zinc-300">Exit $</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-zinc-300">P&L</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 dark:text-zinc-300">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-zinc-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrades.map((trade) => {
                  const isEditing = editingId === trade.id;
                  const isSaving = savingId === trade.id;
                  const inCls = 'w-full px-1.5 py-1 text-xs rounded border border-zinc-600 bg-zinc-800 text-white focus:ring-1 focus:ring-primary focus:outline-none';
                  return (
                  <tr key={trade.id} className={`border-b dark:border-zinc-700/20 transition-colors ${
                    isEditing ? 'bg-zinc-800/60' : 'hover:bg-gray-50 dark:hover:bg-zinc-800/40'
                  }`}>
                    <td className="px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white">{trade.symbol}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-zinc-400 capitalize">{trade.type}</td>
                    <td className="px-3 py-2 text-xs text-center">
                      {(() => {
                        const isShort = trade.type === 'option'
                          ? trade.optionData?.legs?.[0]?.direction === 'short'
                          : trade.tags?.includes('short');
                        return isShort
                          ? <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-bear/15 text-bear">Sell</span>
                          : <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-bull/15 text-bull">Buy</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2 text-xs text-right text-gray-600 dark:text-zinc-400">
                      {trade.stockData?.quantity != null
                        ? trade.stockData.quantity
                        : trade.optionData?.legs?.[0]?.quantity != null
                        ? trade.optionData.legs[0].quantity
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 dark:text-zinc-400 whitespace-nowrap">{formatDate(trade.entryDate)}</td>

                    {/* Exit Date — editable */}
                    <td className="px-2 py-1.5 text-xs text-gray-600 dark:text-zinc-400 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editRow!.exitDate}
                          onChange={(e) => setEditRow((r) => r ? { ...r, exitDate: e.target.value } : r)}
                          className={inCls}
                        />
                      ) : trade.exitDate ? formatDate(trade.exitDate) : <span className="text-gray-400">—</span>}
                    </td>

                    <td className="px-3 py-2 text-xs text-right text-gray-600 dark:text-zinc-400">
                      {trade.stockData?.entryPrice != null
                        ? formatCurrency(trade.stockData.entryPrice)
                        : trade.optionData?.legs?.[0]?.entryPrice != null
                        ? formatCurrency(trade.optionData.legs[0].entryPrice)
                        : <span className="text-gray-400">—</span>}
                    </td>

                    {/* Exit Price — editable */}
                    <td className="px-2 py-1.5 text-xs text-right text-gray-600 dark:text-zinc-400">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={editRow!.exitPrice}
                          onChange={(e) => setEditRow((r) => r ? { ...r, exitPrice: e.target.value } : r)}
                          className={inCls + ' text-right w-24'}
                        />
                      ) : (
                        trade.stockData?.exitPrice != null
                          ? formatCurrency(trade.stockData.exitPrice)
                          : trade.optionData?.legs?.[0]?.exitPrice != null
                          ? formatCurrency(trade.optionData.legs[0].exitPrice)
                          : <span className="text-gray-400">—</span>
                      )}
                    </td>

                    <td className={`px-3 py-2 text-xs text-right ${getWinLossColor(trade.pnl)}`}>
                      {formatCurrency(trade.pnl)}
                    </td>

                    {/* Status — editable */}
                    <td className="px-2 py-1.5 text-center">
                      {isEditing ? (
                        <select
                          value={editRow!.status}
                          onChange={(e) => setEditRow((r) => r ? { ...r, status: e.target.value as 'open' | 'closed' } : r)}
                          className={inCls}
                        >
                          <option value="open">open</option>
                          <option value="closed">closed</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          trade.status === 'closed'
                            ? 'bg-gray-100 dark:bg-zinc-700 text-gray-800 dark:text-zinc-200'
                            : 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300'
                        }`}>{trade.status}</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-1.5 text-xs text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex justify-end items-center gap-2">
                          <button
                            onClick={() => handleInlineSave(trade)}
                            disabled={isSaving}
                            className="px-2 py-1 rounded text-xs font-semibold bg-bull/20 text-bull hover:bg-bull/30 disabled:opacity-50"
                          >
                            {isSaving ? '…' : 'Save'}
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditRow(null); setInlineError(null); }}
                            className="px-2 py-1 rounded text-xs font-semibold bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => openInlineEdit(trade)}
                            className="text-primary hover:opacity-80 font-medium"
                          >
                            Edit
                          </button>
                          <Link
                            href={`/trades/${trade.id}`}
                            className="text-muted-foreground hover:text-foreground font-medium"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => setDeleteConfirm(trade.id)}
                            className="text-bear hover:opacity-80 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="bg-gray-50 dark:bg-zinc-800/60 px-6 py-4 flex justify-between items-center border-t dark:border-zinc-700/50">
            <div className="text-sm text-gray-600 dark:text-zinc-400">
              Showing {page * limit + 1} to {Math.min((page + 1) * limit, totalCount)} of {totalCount} trades
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={totalCount <= (page + 1) * limit}
                className="px-4 py-2 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && sortedTrades.length === 0 && (
        <div className="text-center py-12 bg-zinc-900 rounded-lg shadow">
          <p className="text-gray-600 mb-4">No trades found</p>
          <Link href="/trades?add=true" className="text-blue-600 hover:text-blue-800 font-medium">
            Create your first trade
          </Link>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Delete Trade?</h3>
            <p className="text-gray-600 dark:text-zinc-400 mb-6">
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
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 font-medium"
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
