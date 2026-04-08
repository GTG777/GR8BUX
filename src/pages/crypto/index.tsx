import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import type { CryptoOverview, CryptoTicker } from '@/pages/api/crypto/overview';

/* ── Format helpers ─────────────────────────────────────────────── */
function fmtPrice(n: number): string {
  if (n >= 10000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (n >= 100)   return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(4)}`;
}

function fmtVol(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${(n / 1e3).toFixed(1)}K`;
}

/* ── Signal badge ───────────────────────────────────────────────── */
function SignalBadge({ signal }: { signal: CryptoOverview['marketSignal'] }) {
  const cfg = {
    'risk-on':  { cls: 'bg-green-100 text-green-800 border-green-200', label: '▲ Risk-On' },
    'risk-off': { cls: 'bg-red-100   text-red-700   border-red-200',   label: '▼ Risk-Off' },
    'neutral':  { cls: 'bg-gray-100  text-gray-600  border-gray-200',  label: '◆ Neutral' },
  }[signal];
  return (
    <span className={`px-3 py-1 rounded-full border text-sm font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

/* ── Fear & Greed gauge ─────────────────────────────────────────── */
function FearGreedGauge({ value, label }: { value: number; label: string }) {
  const colour =
    value <= 25 ? '#ef4444' :
    value <= 45 ? '#f97316' :
    value <= 55 ? '#6b7280' :
    value <= 75 ? '#22c55e' : '#16a34a';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">Fear &amp; Greed</p>
      {/* Semi-circle gauge */}
      <div className="relative inline-flex items-end justify-center mb-2" style={{ width: 120, height: 64 }}>
        <svg viewBox="0 0 120 64" width={120} height={64}>
          {/* Track */}
          <path d="M10,60 A50,50 0 0,1 110,60" fill="none" stroke="#e5e7eb" strokeWidth={10} strokeLinecap="round" />
          {/* Fill — strokeDasharray for a 157 total arc length */}
          <path
            d="M10,60 A50,50 0 0,1 110,60"
            fill="none"
            stroke={colour}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * 157} 157`}
          />
        </svg>
        <div className="absolute bottom-0 text-2xl font-bold" style={{ color: colour }}>
          {value}
        </div>
      </div>
      <p className="text-sm font-semibold" style={{ color: colour }}>{label}</p>
      <div className="flex justify-between text-[10px] text-gray-300 mt-1 px-1">
        <span>Fear</span><span>Greed</span>
      </div>
    </div>
  );
}

/* ── BTC Dominance card ─────────────────────────────────────────── */
function DominanceCard({ value }: { value: number | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">BTC Dominance</p>
      {value !== null ? (
        <>
          <p className="text-3xl font-bold text-gray-800 mb-2">{value.toFixed(1)}%</p>
          {/* BTC vs Alt bar */}
          <div className="flex h-3 rounded overflow-hidden mb-2">
            <div className="bg-orange-400 transition-all" style={{ width: `${value}%` }} />
            <div className="bg-indigo-300 flex-1" />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>🟠 BTC {value.toFixed(1)}%</span>
            <span>🟣 Alts {(100 - value).toFixed(1)}%</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {value > 55
              ? 'Rising dominance — capital rotating into BTC (defensive)'
              : value < 48
              ? 'Low dominance — altseason environment (risk-on)'
              : 'Balanced dominance — no strong rotation signal'}
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-400">Unavailable</p>
      )}
    </div>
  );
}

/* ── Coin card ──────────────────────────────────────────────────── */
function CoinCard({ ticker }: { ticker: CryptoTicker }) {
  const up   = ticker.change24h >= 0;
  const trendColour =
    ticker.trend === 'up'       ? 'text-green-600' :
    ticker.trend === 'down'     ? 'text-red-500'   : 'text-gray-500';
  const trendBg =
    ticker.trend === 'up'       ? 'bg-green-50 border-green-200' :
    ticker.trend === 'down'     ? 'bg-red-50   border-red-100'   : 'bg-gray-50 border-gray-200';

  const fundingColour =
    ticker.fundingRate === null  ? 'text-gray-400' :
    ticker.fundingRate > 30      ? 'text-red-600'  :
    ticker.fundingRate > 5       ? 'text-amber-600':
    ticker.fundingRate < -5      ? 'text-blue-600' : 'text-gray-600';

  return (
    <div className={`rounded-xl border bg-white shadow-sm p-4 ${trendBg}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-base font-bold text-gray-800">{ticker.symbol}</p>
          <p className="text-xs text-gray-400">{ticker.name}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-800">{fmtPrice(ticker.price)}</p>
          <p className={`text-sm font-semibold ${up ? 'text-green-600' : 'text-red-500'}`}>
            {up ? '+' : ''}{ticker.change24h.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Trend */}
      <div className="flex items-center gap-1 mb-2">
        <span className={`text-xs font-semibold ${trendColour}`}>
          {ticker.trend === 'up' ? '▲' : ticker.trend === 'down' ? '▼' : '◆'} Trend:
        </span>
        <span className={`text-xs ${trendColour}`}>{ticker.trendLabel}</span>
      </div>

      {/* High / Low bar */}
      <div className="mb-2">
        <div className="relative h-1.5 bg-gray-200 rounded overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-400 to-green-400 rounded"
            style={{
              width: '100%',
              clipPath: `inset(0 ${100 - Math.round(((ticker.price - ticker.low24h) / (ticker.high24h - ticker.low24h)) * 100)}% 0 0)`,
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
          <span>L {fmtPrice(ticker.low24h)}</span>
          <span>H {fmtPrice(ticker.high24h)}</span>
        </div>
      </div>

      {/* Funding + Volume */}
      <div className="text-xs text-gray-400 flex flex-col gap-0.5">
        <span>Vol 24h: <span className="text-gray-600">{fmtVol(ticker.volume24h)}</span></span>
        <span>Funding: <span className={fundingColour}>{ticker.fundingLabel}</span></span>
      </div>
    </div>
  );
}

/* ── Funding rate table ─────────────────────────────────────────── */
function FundingTable({ tickers }: { tickers: CryptoTicker[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        Funding Rates <span className="text-xs font-normal text-gray-400">(annualised — positive = longs pay shorts)</span>
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 border-b border-gray-100 text-left">
            <th className="pb-2 pr-4">Coin</th>
            <th className="pb-2 pr-4 text-right">Rate (ann.)</th>
            <th className="pb-2">Interpretation</th>
          </tr>
        </thead>
        <tbody>
          {tickers.map((t) => {
            const colour =
              t.fundingRate === null ? 'text-gray-400' :
              t.fundingRate > 30     ? 'text-red-600'  :
              t.fundingRate > 5      ? 'text-amber-600':
              t.fundingRate < -5     ? 'text-blue-600' : 'text-gray-600';
            return (
              <tr key={t.symbol} className="border-b border-gray-50 last:border-0">
                <td className="py-2 pr-4 font-semibold text-gray-700">{t.symbol}</td>
                <td className={`py-2 pr-4 text-right font-mono font-bold ${colour}`}>
                  {t.fundingRate !== null ? `${t.fundingRate > 0 ? '+' : ''}${t.fundingRate.toFixed(2)}%` : '—'}
                </td>
                <td className={`py-2 text-xs ${colour}`}>{t.fundingLabel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 mt-3">
        High positive rates (+30%+) signal excessive long leverage — squeeze risk increases.
        Negative rates indicate shorts are dominant.
      </p>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */
export default function CryptoPage() {
  const [data, setData]       = useState<CryptoOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [lastRefresh, setLastRefresh] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/crypto/overview');
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      const json: CryptoOverview = await res.json();
      setData(json);
      setLastRefresh(new Date().toLocaleTimeString());
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load crypto data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000); // refresh every 60s
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Crypto Signals</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Layer 11 — BTC/ETH/SOL/BNB · Fear &amp; Greed · Funding Rates · Dominance · Risk Signal
            </p>
          </div>
          {data && <SignalBadge signal={data.marketSignal} />}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-400">Auto-refreshes every 60s{lastRefresh ? ` · last ${lastRefresh}` : ''}</span>
            <button
              onClick={() => { setLoading(true); fetchData(); }}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            >
              ↺ Refresh
            </button>
          </div>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <svg className="animate-spin w-6 h-6 mr-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Fetching crypto data…
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm">
            {error}
          </div>
        )}

        {/* ── Content ── */}
        {!loading && data && (
          <div className="space-y-6">
            {/* Signal verdict */}
            <div className={`rounded-xl border p-4 text-sm font-medium ${
              data.marketSignal === 'risk-on'  ? 'bg-green-50 border-green-200 text-green-800' :
              data.marketSignal === 'risk-off' ? 'bg-red-50   border-red-200   text-red-700'   :
                                                 'bg-gray-50  border-gray-200  text-gray-700'
            }`}>
              {data.marketSignal === 'risk-on'  ? '▲ ' :
               data.marketSignal === 'risk-off' ? '▼ ' : '◆ '}
              {data.signalVerdict}
            </div>

            {/* Fear & Greed + Dominance */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FearGreedGauge value={data.fearGreed.value} label={data.fearGreed.label} />
              <DominanceCard value={data.btcDominance} />
            </div>

            {/* Coin cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {data.tickers.map((t) => (
                <CoinCard key={t.symbol} ticker={t} />
              ))}
            </div>

            {/* Funding rates */}
            <FundingTable tickers={data.tickers} />

            {/* Signal methodology */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Signal Methodology</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-xs text-gray-500">
                <span>▲ <strong>Risk-On</strong>: BTC above EMA20 + Fear &amp; Greed &gt; 55</span>
                <span>▼ <strong>Risk-Off</strong>: BTC below EMA20 + Fear &amp; Greed &lt; 45</span>
                <span>🟠 <strong>High Dominance (&gt;55%)</strong>: Capital defensive in BTC</span>
                <span>🟣 <strong>Low Dominance (&lt;48%)</strong>: Altseason / risk-on</span>
                <span>📈 <strong>Funding &gt;30%</strong>: Longs overextended — squeeze risk</span>
                <span>📉 <strong>Funding &lt;−10%</strong>: Shorts dominant — potential short squeeze</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Data: CoinGecko (prices, OHLC, dominance) · Alternative.me (Fear &amp; Greed) · Bybit (funding rates)
              </p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
