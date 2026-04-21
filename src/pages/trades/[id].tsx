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

interface EditData {
  symbol: string;
  status: string;
  entryDate: string;
  exitDate: string;
  commission: string;
  pnl: string;
  tags: string;
  planNotes: string;
  notes: string;
  stockQty: string;
  stockEntry: string;
  stockExit: string;
  legExitPrices: Record<string, string>;
}

function toDateInput(d?: string | null) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

export default function TradeDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<EditData | null>(null);
  const [saving, setSaving] = useState(false);

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

  function openEdit() {
    if (!trade) return;
    const legExitPrices: Record<string, string> = {};
    trade.optionData?.legs?.forEach((leg) => {
      if (leg.id) legExitPrices[leg.id] = leg.exitPrice != null ? String(leg.exitPrice) : '';
    });
    setEditData({
      symbol: trade.symbol,
      status: trade.status,
      entryDate: toDateInput(trade.entryDate),
      exitDate: toDateInput(trade.exitDate),
      commission: trade.commission != null ? String(trade.commission) : '',
      pnl: trade.pnl != null ? String(trade.pnl) : '',
      tags: trade.tags?.join(', ') ?? '',
      planNotes: trade.planNotes ?? '',
      notes: trade.notes ?? '',
      stockQty: trade.stockData?.quantity != null ? String(trade.stockData.quantity) : '',
      stockEntry: trade.stockData?.entryPrice != null ? String(trade.stockData.entryPrice) : '',
      stockExit: trade.stockData?.exitPrice != null ? String(trade.stockData.exitPrice) : '',
      legExitPrices,
    });
    setEditMode(true);
  }

  function set(field: keyof Omit<EditData, 'legExitPrices'>, value: string) {
    setEditData((d) => d ? { ...d, [field]: value } : d);
  }

  function setLegExit(legId: string, value: string) {
    setEditData((d) => d ? { ...d, legExitPrices: { ...d.legExitPrices, [legId]: value } } : d);
  }

  async function handleSave() {
    if (!trade || !editData) return;
    setSaving(true);
    try {
      const headers = await authHeaders();
      const legUpdates = Object.entries(editData.legExitPrices)
        .filter(([, v]) => v !== '')
        .map(([legId, v]) => ({ id: legId, exit_price: parseFloat(v) }));
      const body: Record<string, any> = {
        symbol: editData.symbol,
        status: editData.status,
        entry_date: editData.entryDate ? new Date(editData.entryDate).toISOString() : undefined,
        exit_date: editData.exitDate ? new Date(editData.exitDate).toISOString() : null,
        commission: editData.commission ? parseFloat(editData.commission) : null,
        pnl: editData.pnl ? parseFloat(editData.pnl) : null,
        tags: editData.tags ? editData.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        plan_notes: editData.planNotes,
        notes: editData.notes,
        legUpdates,
      };
      if (trade.type === 'stock') {
        body.stockData = {
          quantity: editData.stockQty ? parseInt(editData.stockQty) : null,
          entry_price: editData.stockEntry ? parseFloat(editData.stockEntry) : null,
          exit_price: editData.stockExit ? parseFloat(editData.stockExit) : null,
        };
      }
      const res = await axios.put(`/api/trades/${trade.id}`, body, { headers });
      if (res.data.success) {
        setTrade(res.data.data);
        setEditMode(false);
        setEditData(null);
      } else {
        setError(res.data.error || 'Failed to save changes.');
      }
    } catch {
      setError('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const dirColor = (dir: 'long' | 'short') =>
    dir === 'long' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400';

  const typeColor = (t: 'call' | 'put') =>
    t === 'call' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400';

  const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm';

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
      <div className="max-w-4xl mx-auto space-y-6 pb-28">

        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link href="/trades" className="text-sm text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-100 flex items-center gap-1">
            ← Back to Trades
          </Link>
          {!editMode ? (
            <button
              onClick={openEdit}
              className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 font-medium"
            >
              ✏️ Edit Trade
            </button>
          ) : (
            <button
              onClick={() => { setEditMode(false); setEditData(null); }}
              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 font-medium"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Header Card */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-6">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                {editMode ? (
                  <input
                    value={editData!.symbol}
                    onChange={(e) => set('symbol', e.target.value.toUpperCase())}
                    className="text-3xl font-extrabold text-gray-900 dark:text-white border-b-2 border-blue-400 bg-transparent focus:outline-none w-32"
                  />
                ) : (
                  <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">{trade.symbol}</h1>
                )}
                {editMode ? (
                  <select
                    value={editData!.status}
                    onChange={(e) => set('status', e.target.value)}
                    className="px-3 py-1 rounded-full text-xs font-semibold border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="open">open</option>
                    <option value="closed">closed</option>
                    <option value="pending">pending</option>
                  </select>
                ) : (
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                    trade.status === 'closed' ? 'bg-gray-100 text-gray-700 dark:bg-zinc-700 dark:text-zinc-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  }`}>{trade.status}</span>
                )}
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 capitalize">{trade.type}</span>
              </div>
              {trade.optionData?.strategy && (
                <p className="text-sm text-gray-500 font-medium">{trade.optionData.strategy}</p>
              )}
            </div>

            {/* P&L */}
            <div className="text-right">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Realized P&L</p>
              {editMode ? (
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={editData!.pnl}
                  onChange={(e) => set('pnl', e.target.value)}
                  className="text-right text-2xl font-extrabold text-gray-900 dark:text-white border-b-2 border-blue-400 bg-transparent focus:outline-none w-36"
                />
              ) : (
                <p className={`text-3xl font-extrabold ${
                  trade.pnl == null ? 'text-gray-400' :
                  trade.pnl > 0 ? 'text-green-500' : trade.pnl < 0 ? 'text-red-500' : 'text-gray-500 dark:text-zinc-400'
                }`}>
                  {trade.pnl == null ? '—' : `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}`}
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Entry Date</p>
              {editMode ? (
                <input type="date" value={editData!.entryDate} onChange={(e) => set('entryDate', e.target.value)} className={inputCls} />
              ) : (
                <p className="font-semibold text-gray-800 dark:text-zinc-100">{fmt(trade.entryDate)}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Exit Date</p>
              {editMode ? (
                <input type="date" value={editData!.exitDate} onChange={(e) => set('exitDate', e.target.value)} className={inputCls} />
              ) : (
                <p className="font-semibold text-gray-800 dark:text-zinc-100">{trade.exitDate ? fmt(trade.exitDate) : '—'}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Commission</p>
              {editMode ? (
                <input type="number" step="0.01" placeholder="0.00" value={editData!.commission} onChange={(e) => set('commission', e.target.value)} className={inputCls} />
              ) : (
                <p className="font-semibold text-gray-800 dark:text-zinc-100">${(trade.commission || 0).toFixed(2)}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Tags</p>
              {editMode ? (
                <input type="text" placeholder="tag1, tag2" value={editData!.tags} onChange={(e) => set('tags', e.target.value)} className={inputCls} />
              ) : (
                <div className="flex flex-wrap gap-1">
                  {trade.tags && trade.tags.length > 0
                    ? trade.tags.map((t) => (
                        <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-zinc-300 rounded text-xs">{t}</span>
                      ))
                    : <span className="text-gray-400">—</span>
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Option Legs */}
        {trade.type === 'option' && trade.optionData && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-6">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-bold text-gray-800 dark:text-white">Option Legs</h2>
              <div className="flex gap-3 text-sm text-gray-500">
                <span>Net Credit: <strong className="text-gray-800 dark:text-zinc-100">
                  {trade.optionData.totalCost != null
                    ? (trade.optionData.totalCost <= 0
                        ? `+$${Math.abs(trade.optionData.totalCost).toFixed(2)}`
                        : `-$${trade.optionData.totalCost.toFixed(2)}`)
                    : '—'}
                </strong></span>
                <span>Total Premium: <strong className="text-gray-800 dark:text-zinc-100">
                  ${(trade.optionData.totalPremium || 0).toFixed(2)}
                </strong></span>
              </div>
            </div>

            {trade.optionData.legs && trade.optionData.legs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800">
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
                      const exitVal = editMode && leg.id ? editData!.legExitPrices[leg.id] : undefined;
                      const exitPrice = exitVal !== undefined
                        ? (exitVal === '' ? null : parseFloat(exitVal))
                        : leg.exitPrice;
                      const legPnl =
                        exitPrice != null
                          ? leg.direction === 'short'
                            ? (leg.entryPrice - exitPrice) * leg.quantity * 100
                            : (exitPrice - leg.entryPrice) * leg.quantity * 100
                          : null;
                      return (
                        <tr key={leg.id || i} className={`border-b border-gray-50 dark:border-zinc-800 ${i % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-gray-50/40 dark:bg-zinc-800/40'}`}>
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
                          <td className="px-3 py-3 font-mono font-semibold text-gray-800 dark:text-zinc-100">${leg.strikePrice}</td>
                          <td className="px-3 py-3 text-gray-600 dark:text-zinc-400">{leg.expirationDate}</td>
                          <td className="px-3 py-3 text-right text-gray-800 dark:text-zinc-100">{leg.quantity}</td>
                          <td className="px-3 py-3 text-right font-mono text-gray-800 dark:text-zinc-100">${leg.entryPrice.toFixed(2)}</td>
                          <td className="px-3 py-3 text-right font-mono">
                            {editMode && leg.id ? (
                              <input
                                type="number"
                                step="0.01"
                                placeholder="—"
                                value={editData!.legExitPrices[leg.id] ?? ''}
                                onChange={(e) => setLegExit(leg.id!, e.target.value)}
                                className="w-24 px-2 py-1 border border-gray-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-right text-sm"
                              />
                            ) : (
                              <span className="text-gray-500 dark:text-zinc-400">
                                {leg.exitPrice != null ? `$${leg.exitPrice.toFixed(2)}` : '—'}
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-3 text-right font-semibold ${
                            legPnl == null ? 'text-gray-400' :
                            legPnl > 0 ? 'text-green-500' : legPnl < 0 ? 'text-red-500' : 'text-gray-500 dark:text-zinc-400'
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
        {trade.type === 'stock' && (trade.stockData || editMode) && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-6">
            <h2 className="text-base font-bold text-gray-800 dark:text-white mb-4">Stock Details</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Quantity</p>
                {editMode ? (
                  <input type="number" value={editData!.stockQty} onChange={(e) => set('stockQty', e.target.value)} className={inputCls} />
                ) : (
                  <p className="font-semibold text-gray-800 dark:text-zinc-100">{trade.stockData?.quantity}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Entry Price</p>
                {editMode ? (
                  <input type="number" step="0.01" value={editData!.stockEntry} onChange={(e) => set('stockEntry', e.target.value)} className={inputCls} />
                ) : (
                  <p className="font-semibold text-gray-800 dark:text-zinc-100">${trade.stockData?.entryPrice?.toFixed(2)}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Exit Price</p>
                {editMode ? (
                  <input type="number" step="0.01" value={editData!.stockExit} onChange={(e) => set('stockExit', e.target.value)} className={inputCls} />
                ) : (
                  <p className="font-semibold text-gray-800 dark:text-zinc-100">
                    {trade.stockData?.exitPrice != null ? `$${trade.stockData.exitPrice.toFixed(2)}` : '—'}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-widest mb-2">Plan Notes</h2>
            {editMode ? (
              <textarea
                rows={4}
                value={editData!.planNotes}
                onChange={(e) => set('planNotes', e.target.value)}
                placeholder="Trade rationale, setup notes…"
                className={inputCls}
              />
            ) : (
              <p className="text-sm text-gray-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {trade.planNotes || <span className="text-gray-400">—</span>}
              </p>
            )}
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-widest mb-2">Trade Notes</h2>
            {editMode ? (
              <textarea
                rows={4}
                value={editData!.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Post-trade journal, learnings…"
                className={inputCls}
              />
            ) : (
              <p className="text-sm text-gray-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {trade.notes || <span className="text-gray-400">—</span>}
              </p>
            )}
          </div>
        </div>

      </div>

      {/* Sticky Save Bar */}
      {editMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800 shadow-lg px-6 py-4 flex items-center justify-between z-50">
          <p className="text-sm text-gray-500 dark:text-zinc-400">Editing <strong>{trade.symbol}</strong> — unsaved changes</p>
          <div className="flex gap-3">
            <button
              onClick={() => { setEditMode(false); setEditData(null); }}
              className="px-5 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
