import React, { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { Layout } from '@/components/Layout';
import type { InsiderFiling, InsiderTradesResponse } from '@/pages/api/research/insider-trades';
import type { FilingDetail } from '@/pages/api/research/insider-filing';

// ── Constants ────────────────────────────────────────────────────────────────

const FEATURED_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'META', 'AMZN', 'TSLA', 'GOOGL', 'PLTR', 'COIN', 'AMD'];

const DATE_RANGES = [
  { label: '7d',  days: 7  },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
];

type Tab = 'insider' | 'congress';

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function daysAgo(iso: string) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return '1d ago';
  return `${diff}d ago`;
}

function fmtShares(n: number): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function fmtValue(n: number): string {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ── Shimmer ───────────────────────────────────────────────────────────────────

function Shimmer({ w = 60 }: { w?: number }) {
  return (
    <div
      className="h-3.5 rounded animate-pulse bg-gray-200 dark:bg-zinc-700 inline-block"
      style={{ width: w }}
    />
  );
}

// ── Action badge ──────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: FilingDetail['dominantAction'] }) {
  const map = {
    BUY:   'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
    SELL:  'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
    MIXED: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
    NONE:  'bg-gray-100 dark:bg-zinc-700/50 text-gray-500 dark:text-zinc-400',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap ${map[action]}`}>
      {action === 'NONE' ? 'N/A' : action}
    </span>
  );
}

// ── Filing row ────────────────────────────────────────────────────────────────

interface FilingRowProps {
  filing: InsiderFiling;
  detail: FilingDetail | null | undefined; // undefined = still loading
  idx: number;
}

function FilingRow({ filing, detail, idx }: FilingRowProps) {
  const loading = detail === undefined;

  const buyShares = detail?.totalBuyShares ?? 0;
  const sellShares = detail?.totalSellShares ?? 0;
  const buyValue = detail?.totalBuyValue ?? 0;
  const sellValue = detail?.totalSellValue ?? 0;
  const dominantShares = detail?.dominantAction === 'BUY' ? buyShares
    : detail?.dominantAction === 'SELL' ? sellShares
    : buyShares + sellShares;
  const dominantValue = detail?.dominantAction === 'BUY' ? buyValue
    : detail?.dominantAction === 'SELL' ? sellValue
    : buyValue + sellValue;

  return (
    <tr
      className={`border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors ${
        idx % 2 === 0 ? '' : 'bg-gray-50/40 dark:bg-zinc-900/40'
      }`}
    >
      {/* Insider */}
      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-zinc-100 max-w-[180px]">
        <div className="truncate" title={detail?.reporterName || filing.reporterName}>
          {detail?.reporterName || filing.reporterName}
        </div>
        {loading ? (
          <Shimmer w={70} />
        ) : detail?.role ? (
          <div className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5 truncate">
            {detail.role}
          </div>
        ) : null}
      </td>

      {/* Ticker */}
      <td className="px-4 py-3 whitespace-nowrap">
        {loading ? (
          <Shimmer w={36} />
        ) : detail?.ticker ? (
          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
            {detail.ticker}
          </span>
        ) : (
          <span className="text-[11px] text-gray-400 dark:text-zinc-600">—</span>
        )}
      </td>

      {/* Action */}
      <td className="px-4 py-3 whitespace-nowrap">
        {loading ? <Shimmer w={44} /> : detail ? <ActionBadge action={detail.dominantAction} /> : <span className="text-xs text-gray-400">—</span>}
      </td>

      {/* Shares */}
      <td className="px-4 py-3 text-sm text-right whitespace-nowrap hidden md:table-cell">
        {loading ? <Shimmer w={48} /> : (
          <span className="text-gray-700 dark:text-zinc-300 font-mono text-xs">
            {fmtShares(dominantShares)}
          </span>
        )}
      </td>

      {/* Value */}
      <td className="px-4 py-3 text-sm text-right whitespace-nowrap hidden md:table-cell">
        {loading ? <Shimmer w={56} /> : (
          <span className={`font-semibold text-xs ${
            detail?.dominantAction === 'BUY'
              ? 'text-emerald-600 dark:text-emerald-400'
              : detail?.dominantAction === 'SELL'
              ? 'text-red-500 dark:text-red-400'
              : 'text-gray-600 dark:text-zinc-400'
          }`}>
            {fmtValue(dominantValue)}
          </span>
        )}
      </td>

      {/* Filed */}
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-zinc-400 whitespace-nowrap hidden sm:table-cell">
        <span title={fmtDate(filing.filedDate)}>{daysAgo(filing.filedDate)}</span>
      </td>

      {/* Links */}
      <td className="px-4 py-3 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-1.5">
          <a
            href={filing.filingIndexUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors font-medium"
          >
            Filing
          </a>
          <a
            href={filing.edgarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-zinc-700/50 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors font-medium"
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
      {[160, 40, 44, 48, 56, 50, 80].map((w, i) => (
        <td key={i} className={`px-4 py-3 ${[3, 4].includes(i) ? 'hidden md:table-cell' : i === 5 ? 'hidden sm:table-cell' : ''}`}>
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
      <h3 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Congressional Trades</h3>
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

  // Keyed by accessionNumber: undefined = loading, null = failed, FilingDetail = success
  const [enriched, setEnriched] = useState<Record<string, FilingDetail | null>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enrichAbortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (q: string, d: number) => {
    setLoading(true);
    setError(null);
    setEnriched({});
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

  // Lazy-enrich filings in batches of 8
  useEffect(() => {
    const filings = data?.filings ?? [];
    if (!filings.length) return;

    enrichAbortRef.current?.abort();
    const controller = new AbortController();
    enrichAbortRef.current = controller;

    const BATCH = 8;

    (async () => {
      for (let i = 0; i < filings.length; i += BATCH) {
        if (controller.signal.aborted) break;
        const batch = filings.slice(i, i + BATCH);

        await Promise.all(
          batch.map(async (f) => {
            if (!f.accessionNumber || !f.entityId) return;
            try {
              const params = new URLSearchParams({ acc: f.accessionNumber, cik: f.entityId });
              const res = await fetch(`/api/research/insider-filing?${params}`, {
                signal: controller.signal,
              });
              const detail: FilingDetail | null = res.ok ? await res.json() : null;
              if (!controller.signal.aborted) {
                setEnriched(prev => ({ ...prev, [f.accessionNumber]: detail }));
              }
            } catch {
              if (!controller.signal.aborted) {
                setEnriched(prev => ({ ...prev, [f.accessionNumber]: null }));
              }
            }
          })
        );
      }
    })();

    return () => controller.abort();
  }, [data]);

  useEffect(() => {
    fetchData(query, days);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputChange = (val: string) => {
    setInputValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const upper = val.trim().toUpperCase();
      setQuery(upper);
      fetchData(upper, days);
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

  // Summary stats from enriched data
  const enrichedValues = Object.values(enriched).filter(Boolean) as FilingDetail[];
  const buyCount = enrichedValues.filter(d => d.dominantAction === 'BUY').length;
  const sellCount = enrichedValues.filter(d => d.dominantAction === 'SELL').length;
  const totalValue = enrichedValues.reduce((s, d) => s + d.totalBuyValue + d.totalSellValue, 0);

  return (
    <Layout title="Smart Money">
      <Head>
        <title>Smart Money | GR8BUX</title>
      </Head>

      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
              <span>💰</span> Smart Money
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
              SEC Form 4 insider trades via EDGAR — buy/sell signals parsed from filing XML
            </p>
          </div>

          {/* Stat pills */}
          {enrichedValues.length > 0 && (
            <div className="flex gap-3 text-center shrink-0">
              <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                <p className="font-bold text-emerald-700 dark:text-emerald-400 text-lg">{buyCount}</p>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-500">Buys</p>
              </div>
              <div className="px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                <p className="font-bold text-red-600 dark:text-red-400 text-lg">{sellCount}</p>
                <p className="text-[11px] text-red-500 dark:text-red-500">Sells</p>
              </div>
              {totalValue > 0 && (
                <div className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700">
                  <p className="font-bold text-gray-900 dark:text-zinc-100 text-lg">{fmtValue(totalValue)}</p>
                  <p className="text-[11px] text-gray-400 dark:text-zinc-500">Total</p>
                </div>
              )}
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
              <div className="relative flex-1 max-w-sm">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={inputValue}
                  onChange={e => handleInputChange(e.target.value)}
                  placeholder="Ticker or company (e.g. AAPL, Nvidia)…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

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

            {/* Context banner */}
            {query && data && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-sm">
                <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-blue-700 dark:text-blue-300">
                  Searching Form 4s mentioning <strong>{data.query}</strong> — reporter name is the insider, not the company.
                  Ticker + action columns fill in as XML is parsed.
                </span>
              </div>
            )}

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
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Insider</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Ticker</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Action</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide hidden md:table-cell">Shares</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide hidden md:table-cell">Value</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide hidden sm:table-cell">Filed</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
                      : filings.length === 0
                      ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-16 text-center text-sm text-gray-400 dark:text-zinc-500">
                            {error ? 'Error loading data' : 'No filings found for this period'}
                          </td>
                        </tr>
                      )
                      : filings.map((f, i) => (
                        <FilingRow
                          key={f.accessionNumber}
                          filing={f}
                          detail={enriched[f.accessionNumber]}
                          idx={i}
                        />
                      ))
                    }
                  </tbody>
                </table>
              </div>

              {!loading && filings.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-between text-xs text-gray-400 dark:text-zinc-500">
                  <span>
                    {filings.length.toLocaleString()} of {(data?.total ?? 0).toLocaleString()} filings
                    {query ? ` · "${data?.query}"` : ''} · last {days}d
                    {enrichedValues.length < filings.length && (
                      <span className="ml-2 text-blue-400 dark:text-blue-500">
                        · parsing {filings.length - enrichedValues.length} filing{filings.length - enrichedValues.length !== 1 ? 's' : ''}…
                      </span>
                    )}
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

            <p className="text-xs text-gray-400 dark:text-zinc-600 text-center">
              Data sourced from{' '}
              <a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 dark:hover:text-zinc-400">
                SEC EDGAR
              </a>
              {' '}· List cached 15 min · Filing XML cached 24h · Not financial advice
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
