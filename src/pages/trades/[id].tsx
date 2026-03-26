import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import axios from 'axios';
import { Layout } from '@/components/Layout';
import { Trade, OptionLeg } from '@/types';
import { getSupabaseClient } from '@/lib/supabase';

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseClient();
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function TradeDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeDate, setCloseDate] = useState('');
  const [closePnl, setClosePnl] = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);

  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    setLoading(true);
    authHeaders().then((headers) =>
      axios
        .get(`/api/trades/${id}`, { headers })
        .then((res) => {
          if (res.data.success) setTrade(res.data.data);
          else setError(res.data.error || 'Failed to load trade');
        })
        .catch(() => setError('Trade not found or you do not have access.'))
        .finally(() => setLoading(false))
    );
  }, [id]);

  const handleClose = async () => {
    if (!trade) return;
    setClosing(true);
    try {
      const headers = await authHeaders();
      await axios.put(
        `/api/trades/${trade.id}`,
        {
          status: 'closed',
          exit_date: closeDate ? new Date(closeDate).toISOString() : new Date().toISOString(),
          pnl: closePnl ? parseFloat(closePnl) : null,
        },
        { headers }
      );
      setTrade((t) => t ? { ...t, status: 'closed', exitDate: closeDate || new Date().toISOString(), pnl: closePnl ? parseFloat(closePnl) : t.pnl } : t);
      setShowCloseForm(false);
    } catch {
      setError('Failed to close trade.');
    } finally {
      setClosing(false);
    }
  };

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const dirColor = (dir: 'long' | 'short') =>
    dir === 'long' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';

  const typeColor = (t: 'call' | 'put') =>
    t === 'call' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800';

  if (loading) {
    return (
      <Layout title="Trade Detail">
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </Layout>
    );
  }

  if (error || !trade) {
    return (
      <Layout title="Trade Detail">
        <div className="max-w-2xl mx-auto mt-12">
          <p className="text-red-600 mb-4">{error || 'Trade not found.'}</p>
          <Link href="/trades" className="text-blue-600 hover:underline">← Back to Trades</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`${trade.symbol} — Trade Detail`}>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link href="/trades" className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1">
            ← Back to Trades
          </Link>
          {trade.status === 'open' && (
            <button
              onClick={() => setShowCloseForm((v) => !v)}
              className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 font-medium"
            >
              {showCloseForm ? 'Cancel' : 'Mark as Closed'}
            </button>
          )}
        </div>

        {/* Close Trade Form */}
        {showCloseForm && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-gray-800">Close this trade</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Exit Date</label>
                <input
                  type="date"
                  value={closeDate}
                  onChange={(e) => setCloseDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Realized P&L ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={closePnl}
                  onChange={(e) => setClosePnl(e.target.value)}
                  placeholder="e.g. 250.00 or -120.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={closing}
              className="px-6 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
            >
              {closing ? 'Saving…' : 'Confirm Close'}
            </button>
          </div>
        )}

        {/* Header Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-extrabold text-gray-900">{trade.symbol}</h1>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                  trade.status === 'closed' ? 'bg-gray-100 text-gray-700' : 'bg-blue-100 text-blue-700'
                }`}>{trade.status}</span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 capitalize">{trade.type}</span>
              </div>
              {trade.optionData?.strategy && (
                <p className="text-sm text-gray-500 font-medium">{trade.optionData.strategy}</p>
              )}
            </div>

            {/* P&L */}
            <div className="text-right">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Realized P&L</p>
              <p className={`text-3xl font-extrabold ${
                trade.pnl == null ? 'text-gray-400' :
                trade.pnl > 0 ? 'text-green-600' : trade.pnl < 0 ? 'text-red-600' : 'text-gray-600'
              }`}>
                {trade.pnl == null ? '—' : `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}`}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Entry Date</p>
              <p className="font-semibold text-gray-800">{fmt(trade.entryDate)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Exit Date</p>
              <p className="font-semibold text-gray-800">{trade.exitDate ? fmt(trade.exitDate) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Commission</p>
              <p className="font-semibold text-gray-800">${(trade.commission || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Tags</p>
              <div className="flex flex-wrap gap-1">
                {trade.tags && trade.tags.length > 0
                  ? trade.tags.map((t) => (
                      <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{t}</span>
                    ))
                  : <span className="text-gray-400">—</span>
                }
              </div>
            </div>
          </div>
        </div>

        {/* Option Legs */}
        {trade.type === 'option' && trade.optionData && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-bold text-gray-800">Option Legs</h2>
              <div className="flex gap-3 text-sm text-gray-500">
                <span>Net Credit: <strong className="text-gray-800">
                  {trade.optionData.totalCost != null
                    ? (trade.optionData.totalCost <= 0
                        ? `+$${Math.abs(trade.optionData.totalCost).toFixed(2)}`
                        : `-$${trade.optionData.totalCost.toFixed(2)}`)
                    : '—'}
                </strong></span>
                <span>Total Premium: <strong className="text-gray-800">
                  ${(trade.optionData.totalPremium || 0).toFixed(2)}
                </strong></span>
              </div>
            </div>

            {trade.optionData.legs && trade.optionData.legs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Direction</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Call/Put</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Strike</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Expiry</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Entry Premium</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Exit Premium</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Leg P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trade.optionData.legs.map((leg: OptionLeg, i: number) => {
                      const legPnl =
                        leg.exitPrice != null
                          ? leg.direction === 'short'
                            ? (leg.entryPrice - leg.exitPrice) * leg.quantity * 100
                            : (leg.exitPrice - leg.entryPrice) * leg.quantity * 100
                          : null;
                      return (
                        <tr key={leg.id || i} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                          <td className="px-3 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${dirColor(leg.direction)}`}>
                              {leg.direction}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${typeColor(leg.type)}`}>
                              {leg.type}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono font-semibold text-gray-800">${leg.strikePrice}</td>
                          <td className="px-3 py-3 text-gray-600">{leg.expirationDate}</td>
                          <td className="px-3 py-3 text-right text-gray-800">{leg.quantity}</td>
                          <td className="px-3 py-3 text-right font-mono text-gray-800">${leg.entryPrice.toFixed(2)}</td>
                          <td className="px-3 py-3 text-right font-mono text-gray-500">
                            {leg.exitPrice != null ? `$${leg.exitPrice.toFixed(2)}` : '—'}
                          </td>
                          <td className={`px-3 py-3 text-right font-semibold ${
                            legPnl == null ? 'text-gray-400' :
                            legPnl > 0 ? 'text-green-600' : legPnl < 0 ? 'text-red-600' : 'text-gray-600'
                          }`}>
                            {legPnl == null ? '—' : `${legPnl >= 0 ? '+' : ''}$${legPnl.toFixed(2)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No leg data recorded.</p>
            )}
          </div>
        )}

        {/* Stock Details */}
        {trade.type === 'stock' && trade.stockData && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-4">Stock Details</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Quantity</p>
                <p className="font-semibold text-gray-800">{trade.stockData.quantity}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Entry Price</p>
                <p className="font-semibold text-gray-800">${trade.stockData.entryPrice?.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Exit Price</p>
                <p className="font-semibold text-gray-800">
                  {trade.stockData.exitPrice != null ? `$${trade.stockData.exitPrice.toFixed(2)}` : '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {(trade.planNotes || trade.notes) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
            {trade.planNotes && (
              <div>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2">Plan Notes</h2>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{trade.planNotes}</p>
              </div>
            )}
            {trade.notes && (
              <div>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2">Trade Notes</h2>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{trade.notes}</p>
              </div>
            )}
          </div>
        )}

      </div>
    </Layout>
  );
}
