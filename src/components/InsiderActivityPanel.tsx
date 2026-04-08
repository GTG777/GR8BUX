import React, { useState } from 'react';
import type { InsiderData, InsiderFiling, InsiderTransaction } from '@/pages/api/insider/filings';

/* ── Sentiment badge ─────────────────────────────────────────────── */
function SentimentBadge({ sentiment }: { sentiment: InsiderData['summary']['sentiment'] }) {
  const cls =
    sentiment === 'bullish' ? 'bg-green-100 text-green-800 border-green-200' :
    sentiment === 'bearish' ? 'bg-red-100   text-red-700   border-red-200'   :
                              'bg-gray-100  text-gray-600  border-gray-200';
  const icon = sentiment === 'bullish' ? '▲' : sentiment === 'bearish' ? '▼' : '◆';
  const label = sentiment === 'bullish' ? 'Insider Buying' : sentiment === 'bearish' ? 'Insider Selling' : 'Neutral';
  return (
    <span className={`px-2.5 py-0.5 rounded border text-xs font-bold ${cls}`}>
      {icon} {label}
    </span>
  );
}

/* ── Transaction type pill ───────────────────────────────────────── */
function TypePill({ type, code }: { type: InsiderTransaction['type']; code: string }) {
  const cls =
    type === 'buy'   ? 'bg-green-100 text-green-800' :
    type === 'sell'  ? 'bg-red-100   text-red-700'   :
    type === 'grant' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-gray-100   text-gray-500';

  const label =
    code === 'P' ? 'BUY'   :
    code === 'S' ? 'SELL'  :
    code === 'D' ? 'SELL*' :
    code === 'A' ? 'GRANT' :
    code === 'F' ? 'TAX'   : code;

  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cls}`}>{label}</span>
  );
}

/* ── Role badge ──────────────────────────────────────────────────── */
function RoleBadge({ role }: { role: string }) {
  const isExec = /CEO|CFO|CTO|COO|President|Director|Officer/i.test(role);
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
      isExec ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'
    }`}>
      {role || 'Insider'}
    </span>
  );
}

/* ── Format helpers ──────────────────────────────────────────────── */
function fmtShares(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtValue(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  if (n > 0)              return `$${n.toFixed(0)}`;
  return '—';
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

/* ── Buy-vs-Sell bar ─────────────────────────────────────────────── */
function BuySellBar({ buyValue, sellValue }: { buyValue: number; sellValue: number }) {
  const total = buyValue + sellValue;
  if (total === 0) return null;
  const buyPct  = Math.round((buyValue  / total) * 100);
  const sellPct = 100 - buyPct;
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
        <span>Buy {fmtValue(buyValue)}</span>
        <span>Sell {fmtValue(sellValue)}</span>
      </div>
      <div className="flex h-3 rounded overflow-hidden">
        {buyPct  > 0 && <div className="bg-green-400 transition-all" style={{ width: `${buyPct}%` }} />}
        {sellPct > 0 && <div className="bg-red-400  transition-all" style={{ width: `${sellPct}%` }} />}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>{buyPct}%</span>
        <span>{sellPct}%</span>
      </div>
    </div>
  );
}

/* ── Single filing card ──────────────────────────────────────────── */
function FilingCard({ filing }: { filing: InsiderFiling }) {
  const [open, setOpen] = useState(false);
  const hasBuy  = filing.transactions.some((t) => t.type === 'buy');
  const hasSell = filing.transactions.some((t) => t.type === 'sell');
  const cardBorder = hasBuy && !hasSell ? 'border-green-200' : hasSell && !hasBuy ? 'border-red-100' : 'border-gray-200';

  return (
    <div className={`rounded-lg border bg-white shadow-sm overflow-hidden ${cardBorder}`}>
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-sm text-gray-800">{filing.reporterName}</span>
            <RoleBadge role={filing.role} />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {filing.transactions.slice(0, 4).map((tx, i) => (
              <span key={i} className="flex items-center gap-1 text-xs text-gray-600">
                <TypePill type={tx.type} code={tx.code} />
                <span>{fmtShares(tx.shares)} sh</span>
                {tx.pricePerShare > 0 && <span className="text-gray-400">@ ${tx.pricePerShare.toFixed(2)}</span>}
              </span>
            ))}
            {filing.transactions.length > 4 && (
              <span className="text-xs text-gray-400">+{filing.transactions.length - 4} more</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-400">Filed</p>
          <p className="text-xs font-medium text-gray-600">{fmtDate(filing.fileDate)}</p>
        </div>
        <span className="text-gray-400 text-xs ml-1">{open ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-left border-b border-gray-200">
                <th className="pb-1 pr-3">Security</th>
                <th className="pb-1 pr-3">Date</th>
                <th className="pb-1 pr-3">Type</th>
                <th className="pb-1 pr-3 text-right">Shares</th>
                <th className="pb-1 pr-3 text-right">Price</th>
                <th className="pb-1 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {filing.transactions.map((tx, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0">
                  <td className="py-1.5 pr-3 text-gray-700">{tx.security}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{fmtDate(tx.date)}</td>
                  <td className="py-1.5 pr-3">
                    <TypePill type={tx.type} code={tx.code} />
                    <span className="ml-1 text-gray-500">{tx.label}</span>
                  </td>
                  <td className={`py-1.5 pr-3 font-mono text-right ${
                    tx.type === 'buy' ? 'text-green-700' : tx.type === 'sell' ? 'text-red-600' : 'text-gray-600'
                  }`}>{fmtShares(tx.shares)}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-600 font-mono">
                    {tx.pricePerShare > 0 ? `$${tx.pricePerShare.toFixed(2)}` : '—'}
                  </td>
                  <td className={`py-1.5 text-right font-mono ${
                    tx.type === 'buy' ? 'text-green-700' : tx.type === 'sell' ? 'text-red-600' : 'text-gray-500'
                  }`}>{fmtValue(tx.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-gray-400">
            Period of report: {fmtDate(filing.periodDate)} · Source: SEC EDGAR Form 4
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
export default function InsiderActivityPanel({
  data,
  symbol,
}: {
  data: InsiderData;
  symbol?: string;
}) {
  const { summary, filings } = data;
  const sym = symbol ?? data.symbol;

  const hasTxActivity = summary.openMarketBuys > 0 || summary.openMarketSells > 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            Insider Activity — {sym}
            <span className="text-gray-400 font-normal ml-1.5">(SEC EDGAR Form 4 · {summary.period})</span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Open-market P/S transactions only. Grants, tax-withholding &amp; option exercises shown separately.
          </p>
        </div>
        <SentimentBadge sentiment={summary.sentiment} />
        <span className="ml-auto text-[10px] text-gray-400">
          {filings.length} filing{filings.length !== 1 ? 's' : ''} · {new Date(data.fetchedAt).toLocaleTimeString()}
        </span>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg bg-green-50 border border-green-100 p-3">
          <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wide mb-1">Open-Market Buys</p>
          <p className="text-2xl font-bold text-green-700">{summary.openMarketBuys}</p>
          <p className="text-xs text-green-600">{fmtShares(summary.totalBuyShares)} shares</p>
          <p className="text-xs text-green-500">{fmtValue(summary.totalBuyValue)}</p>
        </div>
        <div className="rounded-lg bg-red-50 border border-red-100 p-3">
          <p className="text-[10px] text-red-500 font-semibold uppercase tracking-wide mb-1">Open-Market Sells</p>
          <p className="text-2xl font-bold text-red-600">{summary.openMarketSells}</p>
          <p className="text-xs text-red-500">{fmtShares(summary.totalSellShares)} shares</p>
          <p className="text-xs text-red-400">{fmtValue(summary.totalSellValue)}</p>
        </div>
        <div className="col-span-2">
          {hasTxActivity ? (
            <div className="h-full flex flex-col justify-between">
              <BuySellBar
                buyValue={summary.totalBuyValue}
                sellValue={summary.totalSellValue}
              />
              <p className="mt-2 text-xs text-gray-500">{summary.verdict}</p>
            </div>
          ) : (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 h-full">
              <p className="text-xs font-semibold text-gray-600">RSU / Option Grants</p>
              <p className="text-2xl font-bold text-indigo-600 my-1">{summary.grants}</p>
              <p className="text-xs text-gray-500">{summary.verdict}</p>
            </div>
          )}
        </div>
      </div>

      {/* Filing list */}
      {filings.length > 0 ? (
        <div className="space-y-2">
          {filings.map((filing, i) => (
            <FilingCard key={i} filing={filing} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400 text-sm">
          No Form 4 filings found for {sym} in the last 90 days.
        </div>
      )}

      {/* Interpretation guide */}
      <div className="mt-4 pt-3 border-t flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
        <span>🟢 <strong>P (Open-Market Buy)</strong> = strongest bullish signal — insiders pay market price</span>
        <span>🔴 <strong>S/D (Open-Market Sell)</strong> = insider selling; may reflect personal liquidity needs</span>
        <span>⚪ <strong>A (Grant/RSU)</strong> = scheduled compensation award — not a directional signal</span>
        <span>⚪ <strong>F (Tax Withholding)</strong> = involuntary sale to cover taxes — not bearish</span>
      </div>
    </div>
  );
}
