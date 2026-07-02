import React, { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { Layout } from '@/components/Layout';
import type { InsiderFiling, InsiderTradesResponse } from '@/pages/api/research/insider-trades';

// ── Constants ────────────────────────────────────────────────────────────────

const FEATURED_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'META', 'AMZN', 'TSLA', 'GOOGL', 'PLTR', 'COIN', 'AMD'];

const DATE_RANGES = [
  { label: '7d',  days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
];

type Tab = 'insider' | 'congress';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysAgo(iso: string) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return '1d ago';
  return `${diff}d ago`;
}

// ── Filing row ────────────────────────────────────────────────────────────────

function FilingRow({ filing, idx }: { filing: InsiderFiling; idx: number }) {
  return (
    <tr className={`border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-50/40 dark:bg-zinc-900/40'}`}>
      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-zinc-100 max-w-[220px]">
        <div className="truncate" title={filing.reporterName}>
          {filing.reporterName}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-zinc-400 whitespace-nowrap">
        <span title={fmtDate(filing.filedDate)}>{daysAgo(filing.filedDate)}</span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-zinc-500 whitespace-nowrap hidden sm:table-cell">
        {fmtDate(filing.periodDate)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
          {filing.formType}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-2">
          <a
            href={filing.filingIndexUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors font-medium"
          >
            Filing
          </a>
          <a
            href={filing.edgarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2.5 py-1 rounded-md bg-gray-100 dark:bg-zinc-700/50 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors font-medium"
          >
            EDGAR
          </a>
        </div>
      </td>
    </tr>
  );
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100 dark:border-zinc-800">
      {[220, 60, 80, 40, 100].map((w, i) => (
        <td key={i} className={`px-4 py-3 ${i === 2 ? 'hidden sm:table-cell' : ''}`}>
          <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

// ── Congress placeholder ──────────────────────────────────────────────────────

function CongressTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center">
        <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">
        Congressional Trades
      </h3>
      <p className="max-w-sm text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
        Track STOCK Act disclosures from members of Congress. Connect a{' '}
        <span className="font-medium text-amber-600 dark:text-amber-400">Quiver Quant API key</span>{' '}
        to unlock real-time congressional trading data.
      </p>
      <div className="flex flex-col gap-2 mt-2">
        <a
          href="https://www.quiverquant.com/congressional-trading/"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors"
        >
          Get Quiver Quant API
        </a>
        <a
          href="https://efdsearch.senate.gov/search/"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-600 text-gray-600 dark:text-zinc-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Browse Senate Disclosures (Free)
        </a>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SmartMoneyPage() {
  const [tab, setTab] = useState<Tab>('insider');
  const [days, setDays] = useState(7);
  const [query, setQuery] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [data, setData] = useState<InsiderTradesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (q: string, d: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(d) });
      if (q) params.set('q', q);
      const res = await fetch(`/api/research/insider-trades?${params}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch');
      const json: InsiderTradesResponse = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData(query, days);
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  const handleInputChange = (val: string) => {
    setInputValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(val.trim().toUpperCase());
      fetchData(val.trim().toUpperCase(), days);
    }, 400);
  };

  const handleTickerClick = (ticker: string) => {
    setInputValue(ticker);
    setQuery(ticker);
    fetchData(ticker, days);
  };

  const handleDaysChange = (d: number) => {
    setDays(d);
    fetchData(query, d);
  };

  const filings = data?.filings ?? [];

  return (
    <Layout title="Smart Money">
      <Head>
        <title>Smart Money | GR8BUX</title>
      </Head>

      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
              <span className="text-2xl">💰</span> Smart Money
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
              SEC Form 4 insider trades &amp; congressional disclosures via EDGAR
            </p>
          </div>
          {data && (
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <p className="font-bold text-lg text-gray-900 dark:text-zinc-100">{data.total.toLocaleString()}</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500">Total filings</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-lg text-gray-900 dark:text-zinc-100">{filings.length}</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500">Shown</p>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-zinc-800 rounded-xl w-fit">
          {([['insider', '📋 Insider Trades'], ['congress', '🏛️ Congress']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === t
                  ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                  : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'congress' ? (
          <div className="rounded-2xl border border-gray-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-900">
            <CongressTab />
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={inputValue}
                  onChange={e => handleInputChange(e.target.value)}
                  placeholder="Search ticker or company…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              {/* Date range */}
              <div className="flex gap-1 p-1 bg-gray-100 dark:bg-zinc-800 rounded-xl self-start">
                {DATE_RANGES.map(({ label, days: d }) => (
                  <button
                    key={d}
                    onClick={() => handleDaysChange(d)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      days === d
                        ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                        : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Refresh */}
              <button
                onClick={() => fetchData(query, days)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>

            {/* Featured ticker chips */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-gray-400 dark:text-zinc-500 self-center mr-1">Quick:</span>
              {FEATURED_TICKERS.map(ticker => (
                <button
                  key={ticker}
                  onClick={() => handleTickerClick(ticker)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                    query === ticker
                      ? 'bg-gradient-brand text-white border-transparent'
                      : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 bg-white dark:bg-zinc-800 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                >
                  {ticker}
                </button>
              ))}
              {query && (
                <button
                  onClick={() => { setQuery(''); setInputValue(''); fetchData('', days); }}
                  className="px-3 py-1 rounded-full text-xs font-bold text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
                >
                  ✕ Clear
                </button>
              )}
            </div>

            {/* Context banner for search */}
            {query && data && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-sm">
                <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-blue-700 dark:text-blue-300">
                  Showing Form 4 filings mentioning <strong>{data.query}</strong> — reporter name is the insider, not the company.
                </span>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-sm text-red-700 dark:text-red-400">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Table */}
            <div className="rounded-2xl border border-gray-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-zinc-700/60 bg-gray-50/80 dark:bg-zinc-800/80">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                        Insider (Reporter)
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                        Filed
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide hidden sm:table-cell">
                        Period
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                        Form
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                        Links
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
                      : filings.length === 0
                      ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-16 text-center text-sm text-gray-400 dark:text-zinc-500">
                            {error ? 'Error loading data' : 'No filings found for this period'}
                          </td>
                        </tr>
                      )
                      : filings.map((f, i) => <FilingRow key={f.accessionNumber} filing={f} idx={i} />)
                    }
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              {!loading && filings.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-between text-xs text-gray-400 dark:text-zinc-500">
                  <span>
                    Showing {filings.length.toLocaleString()} of {(data?.total ?? 0).toLocaleString()} filings
                    {query ? ` matching "${data?.query}"` : ''} in the last {days}d
                  </span>
                  <a
                    href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&dateb=&owner=include&count=40"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-gray-600 dark:hover:text-zinc-300 transition-colors underline underline-offset-2"
                  >
                    View all on EDGAR ↗
                  </a>
                </div>
              )}
            </div>

            {/* Data source note */}
            <p className="text-xs text-gray-400 dark:text-zinc-600 text-center">
              Data sourced from{' '}
              <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-zinc-400">
                SEC EDGAR
              </a>{' '}
              · Updated every 15 minutes · Not financial advice
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
