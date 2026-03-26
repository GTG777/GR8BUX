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
  // For option trades (summary)
  strategy?: string;
}

interface LegInput {
  direction: 'long' | 'short';
  type: 'call' | 'put';
  strikePrice: string;
  expirationDate: string;
  quantity: string;
  entryPrice: string;
  exitPrice: string;
}

const defaultLeg = (): LegInput => ({
  direction: 'long',
  type: 'call',
  strikePrice: '',
  expirationDate: '',
  quantity: '1',
  entryPrice: '',
  exitPrice: '',
});

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
  const [legs, setLegs] = useState<LegInput[]>([defaultLeg()]);
  const tradeType = watch('type');

  const addLeg = () => setLegs((prev) => [...prev, defaultLeg()]);
  const removeLeg = (index: number) =>
    setLegs((prev) => prev.filter((_, i) => i !== index));
  const updateLeg = (index: number, field: keyof LegInput, value: string) =>
    setLegs((prev) =>
      prev.map((leg, i) => (i === index ? { ...leg, [field]: value } : leg))
    );

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
          quantity: parseFloat(data.quantity?.toString() || '0'),
          entryPrice: parseFloat(data.entryPrice?.toString() || '0'),
          exitPrice: data.exitPrice ? parseFloat(data.exitPrice.toString()) : null,
        };
      } else {
        // Option trade with multi-leg support
        const parsedLegs = legs.map((leg) => ({
          direction: leg.direction,
          type: leg.type,
          strikePrice: parseFloat(leg.strikePrice) || 0,
          expirationDate: leg.expirationDate,
          quantity: parseFloat(leg.quantity) || 1,
          entryPrice: parseFloat(leg.entryPrice) || 0,
          exitPrice: leg.exitPrice ? parseFloat(leg.exitPrice) : null,
        }));

        // Net cost: long legs pay premium (+), short legs receive premium (-)
        const netCost = parsedLegs.reduce((sum, leg) => {
          const legValue = leg.entryPrice * leg.quantity * 100;
          return sum + (leg.direction === 'long' ? legValue : -legValue);
        }, 0);

        tradePayload = {
          ...basePayload,
          strategy: data.strategy || 'single',
          totalPremium: Math.abs(netCost),
          totalCost: netCost,
          legs: parsedLegs,
        };
      }

      const result = await createTrade(tradePayload);
      if (result) {
        setSuccessMessage(`Trade created successfully (${data.symbol})`);
        reset();
        setLegs([defaultLeg()]);
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

        {/* Option-Specific Fields - Multi-Leg */}
        {tradeType === 'option' && (
          <div className="space-y-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Option Legs</h3>
              <button
                type="button"
                onClick={addLeg}
                className="text-sm px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
              >
                + Add Leg
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Strategy</label>
              <input
                type="text"
                {...register('strategy')}
                placeholder="Call Debit Spread, Bull Put Spread, Iron Condor…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {legs.map((leg, index) => (
              <div key={index} className="p-3 bg-white rounded-lg border border-purple-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-700">Leg {index + 1}</span>
                  {legs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLeg(index)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {/* Direction + Call/Put toggles */}
                <div className="flex gap-3 mb-3">
                  <div className="flex rounded-lg overflow-hidden border border-gray-300">
                    {(['long', 'short'] as const).map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        onClick={() => updateLeg(index, 'direction', dir)}
                        className={`px-4 py-1.5 text-sm font-medium capitalize transition ${
                          leg.direction === dir
                            ? dir === 'long'
                              ? 'bg-green-500 text-white'
                              : 'bg-red-500 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {dir}
                      </button>
                    ))}
                  </div>
                  <div className="flex rounded-lg overflow-hidden border border-gray-300">
                    {(['call', 'put'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => updateLeg(index, 'type', t)}
                        className={`px-4 py-1.5 text-sm font-medium capitalize transition ${
                          leg.type === t
                            ? 'bg-blue-500 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Strike *</label>
                    <input
                      type="number"
                      step="0.5"
                      value={leg.strikePrice}
                      onChange={(e) => updateLeg(index, 'strikePrice', e.target.value)}
                      placeholder="150"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Expiration *</label>
                    <input
                      type="date"
                      value={leg.expirationDate}
                      onChange={(e) => updateLeg(index, 'expirationDate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Qty (contracts) *</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={leg.quantity}
                      onChange={(e) => updateLeg(index, 'quantity', e.target.value)}
                      placeholder="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Entry Premium (per share) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={leg.entryPrice}
                      onChange={(e) => updateLeg(index, 'entryPrice', e.target.value)}
                      placeholder="3.50"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Exit Premium (per share)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={leg.exitPrice}
                      onChange={(e) => updateLeg(index, 'exitPrice', e.target.value)}
                      placeholder="5.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            ))}
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
