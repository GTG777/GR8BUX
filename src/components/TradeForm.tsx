'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTradeStore } from '@/store/tradeStore';

interface TradeFormData {
  type: 'stock' | 'option';
  symbol: string;
  entryDate: string;
  commission: number;
  notes: string;
  planNotes: string;
  tags: string;
  // For stock trades
  quantity?: number;
  entryPrice?: number;
  exitPrice?: number;
  // For option trades
  strategy?: string;
  totalPremium?: number;
  totalCost?: number;
  expirationDate?: string;
  strikePrice?: number;
  optionType?: 'call' | 'put';
}

export function TradeForm() {
  const { createTrade, isLoading, error, clearError } = useTradeStore();
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<TradeFormData>({
    defaultValues: {
      type: 'stock',
      commission: 0,
      notes: '',
      planNotes: '',
      tags: '',
    },
  });

  const [successMessage, setSuccessMessage] = useState('');
  const tradeType = watch('type');

  const onSubmit = async (data: TradeFormData) => {
    clearError();
    setSuccessMessage('');

    try {
      const basePayload = {
        type: data.type,
        symbol: data.symbol.toUpperCase(),
        entryDate: new Date(data.entryDate).toISOString(),
        commission: parseFloat(data.commission.toString()) || 0,
        notes: data.notes,
        planNotes: data.planNotes,
        tags: data.tags ? data.tags.split(',').map((t) => t.trim()) : [],
      };

      let tradePayload: any;

      if (data.type === 'stock') {
        tradePayload = {
          ...basePayload,
          stockData: {
            quantity: parseFloat(data.quantity?.toString() || '0'),
            entryPrice: parseFloat(data.entryPrice?.toString() || '0'),
            exitPrice: data.exitPrice ? parseFloat(data.exitPrice.toString()) : null,
          },
        };
      } else {
        // Option trade
        tradePayload = {
          ...basePayload,
          optionData: {
            strategy: data.strategy || 'single',
            totalPremium: parseFloat(data.totalPremium?.toString() || '0'),
            totalCost: data.totalCost ? parseFloat(data.totalCost.toString()) : null,
            legs: [
              {
                symbol: data.symbol.toUpperCase(),
                type: data.optionType || 'call',
                strikePrice: parseFloat(data.strikePrice?.toString() || '0'),
                expirationDate: data.expirationDate,
                direction: 'long',
                quantity: 1,
                entryPrice: parseFloat(data.totalPremium?.toString() || '0'),
                exitPrice: null,
              },
            ],
          },
        };
      }

      const result = await createTrade(tradePayload);
      if (result) {
        setSuccessMessage(`Trade created successfully (${data.symbol})`);
        reset();
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (err) {
      console.error('Form submission error:', err);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New Trade</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Trade Type Selection */}
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-400"
                 style={{ borderColor: tradeType === 'stock' ? '#3b82f6' : undefined }}>
            <input type="radio" {...register('type')} value="stock" className="mr-3" />
            <span className="font-medium text-gray-700">Stock Trade</span>
          </label>
          <label className="flex items-center p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-400"
                 style={{ borderColor: tradeType === 'option' ? '#3b82f6' : undefined }}>
            <input type="radio" {...register('type')} value="option" className="mr-3" />
            <span className="font-medium text-gray-700">Option Trade</span>
          </label>
        </div>

        {/* Common Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Symbol *</label>
            <input
              type="text"
              {...register('symbol', { required: 'Symbol is required' })}
              placeholder="AAPL"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
            />
            {errors.symbol && <p className="text-red-500 text-xs mt-1">{errors.symbol.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Entry Date *</label>
            <input
              type="datetime-local"
              {...register('entryDate', { required: 'Entry date is required' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.entryDate && <p className="text-red-500 text-xs mt-1">{errors.entryDate.message}</p>}
          </div>
        </div>

        {/* Stock-Specific Fields */}
        {tradeType === 'stock' && (
          <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-gray-900 mb-3">Stock Details</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('quantity', { required: 'Quantity is required' })}
                  placeholder="100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entry Price *</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('entryPrice', { required: 'Entry price is required' })}
                  placeholder="150.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Exit Price</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('exitPrice')}
                  placeholder="151.50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Option-Specific Fields */}
        {tradeType === 'option' && (
          <div className="space-y-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
            <h3 className="font-semibold text-gray-900 mb-3">Option Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Option Type *</label>
                <select
                  {...register('optionType')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="call">Call</option>
                  <option value="put">Put</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Strategy</label>
                <input
                  type="text"
                  {...register('strategy')}
                  placeholder="Single, Spread, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Strike Price *</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('strikePrice', { required: 'Strike price is required' })}
                  placeholder="150.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiration Date *</label>
                <input
                  type="date"
                  {...register('expirationDate', { required: 'Expiration date is required' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Premium *</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('totalPremium', { required: 'Premium is required' })}
                  placeholder="350.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Common Additional Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Commission</label>
            <input
              type="number"
              step="0.01"
              {...register('commission')}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              {...register('tags')}
              placeholder="breakout, earnings, technicals"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Plan Notes</label>
          <textarea
            {...register('planNotes')}
            placeholder="What was your trading plan?"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Trade Notes</label>
          <textarea
            {...register('notes')}
            placeholder="How did the trade go? What did you learn?"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition"
        >
          {isLoading ? 'Creating Trade...' : 'Create Trade'}
        </button>
      </form>
    </div>
  );
}
