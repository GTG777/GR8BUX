'use client';

import React, { useEffect, useState } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { TradeAnalytics } from '@/types';
import Link from 'next/link';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { WatchlistWidget } from './WatchlistWidget';

export function Dashboard() {
  const { analytics, isLoading, error, fetchAnalytics, fetchTrades } = useTradeStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchAnalytics();
    fetchTrades();
  }, []);

  if (!mounted) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">No trade data available</p>
        <Link href="/trades?add=true" className="text-blue-600 hover:text-blue-800 font-medium">
          Add your first trade
        </Link>
      </div>
    );
  }

  const data = analytics;

  // Format data for charts
  const strategyData = Object.entries(data.byStrategy || {}).map(([ key, val ]: any) => ({
    name: key || 'Uncategorized',
    value: val.totalPnL || 0,
    trades: val.totalTrades || 0,
  }));

  const symbolData = Object.entries(data.bySymbol || {}).map(([ key, val ]: any) => ({
    name: key,
    value: val.totalPnL || 0,
    trades: val.totalTrades || 0,
  }));

  const periodData = Object.entries(data.byPeriod || {})
    .slice(-30) // Last 30 days
    .map(([ key, val ]: any) => ({
      period: key,
      pnl: val.pnl || 0,
      trades: val.trades || 0,
    }));

  const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6'];

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Total Trades */}
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600 text-sm font-medium">Total Trades</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{data.totalTrades || 0}</p>
          <p className="text-xs text-gray-500 mt-2">All-time</p>
        </div>

        {/* Win Rate */}
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600 text-sm font-medium">Win Rate</p>
          <p className="text-3xl font-bold text-green-600 mt-2">{(data.winRate || 0).toFixed(1)}%</p>
          <p className="text-xs text-gray-500 mt-2">{data.totalTrades ? `${Math.round((data.winRate || 0) * data.totalTrades / 100)} wins` : '-'}</p>
        </div>

        {/* Total P&L */}
        <div className={`bg-white rounded-lg shadow p-6 ${(data.totalPnL || 0) >= 0 ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'}`}>
          <p className="text-gray-600 text-sm font-medium">Total P&L</p>
          <p className={`text-3xl font-bold mt-2 ${(data.totalPnL || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${(data.totalPnL || 0).toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 mt-2">Net profit/loss</p>
        </div>

        {/* Profit Factor */}
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600 text-sm font-medium">Profit Factor</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">{(data.profitFactor || 0).toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-2">{(data.profitFactor || 0) > 1 ? '✓ Profitable' : '✗ Unprofitable'}</p>
        </div>

        {/* Risk/Reward */}
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600 text-sm font-medium">Risk/Reward</p>
          <p className="text-3xl font-bold text-purple-600 mt-2">{(data.riskRewardRatio || 0).toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-2">Avg win / Avg loss</p>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Largest Win */}
        <div className="bg-green-50 rounded-lg shadow p-6 border border-green-200">
          <p className="text-gray-600 text-sm font-medium">Largest Win</p>
          <p className="text-2xl font-bold text-green-600 mt-2">${(data.largestWin || 0).toFixed(2)}</p>
        </div>

        {/* Largest Loss */}
        <div className="bg-red-50 rounded-lg shadow p-6 border border-red-200">
          <p className="text-gray-600 text-sm font-medium">Largest Loss</p>
          <p className="text-2xl font-bold text-red-600 mt-2">${(data.largestLoss || 0).toFixed(2)}</p>
        </div>

        {/* Max Drawdown */}
        <div className="bg-orange-50 rounded-lg shadow p-6 border border-orange-200">
          <p className="text-gray-600 text-sm font-medium">Max Drawdown</p>
          <p className="text-2xl font-bold text-orange-600 mt-2">${(data.maxDrawdown || 0).toFixed(2)}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* P&L Over Time */}
        {periodData.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">P&L Over Time</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={periodData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" style={{ fontSize: '12px' }} />
                <YAxis style={{ fontSize: '12px' }} />
                <Tooltip formatter={(value: any) => `$${Number(value).toFixed(2)}`} />
                <Line type="monotone" dataKey="pnl" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Win Rate Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Win/Loss Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Wins', value: Math.round((data.winRate || 0) * (data.totalTrades || 1) / 100) },
                  { name: 'Losses', value: Math.round(((100 - (data.winRate || 0)) * (data.totalTrades || 1)) / 100) },
                ]}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                <Cell fill="#10b981" />
                <Cell fill="#ef4444" />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* By Strategy */}
      {strategyData.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance by Strategy</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={strategyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" style={{ fontSize: '12px' }} />
              <YAxis style={{ fontSize: '12px' }} />
              <Tooltip formatter={(value: any) => `$${Number(value).toFixed(2)}`} />
              <Legend />
              <Bar dataKey="value" fill="#3b82f6" name="P&L" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* By Symbol - Top 5 */}
      {symbolData.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Traded Symbols</h3>
          <div className="space-y-3">
            {symbolData.slice(0, 5).map((item, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-semibold text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.trades} trades</p>
                </div>
                <p className={`font-bold ${item.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${item.value.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Link
          href="/trades?add=true"
          className="flex-1 py-3 px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-center"
        >
          Add New Trade
        </Link>
        <Link
          href="/trades"
          className="flex-1 py-3 px-6 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium text-center"
        >
          View All Trades
        </Link>
      </div>

      {/* Live Market Watchlist */}
      <WatchlistWidget />
    </div>
  );
}
