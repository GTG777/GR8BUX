'use client';

import React, { useEffect, useRef } from 'react';
import { Layout } from '@/components/Layout';

/* ─────────────────────────────────────────────
   TradingView widget loader helper
   Injects the TV script once and runs init cb
───────────────────────────────────────────── */
function useTradingViewScript(onLoad: () => void) {
  useEffect(() => {
    const existing = document.getElementById('tv-script');
    if (existing) {
      // already loaded — run callback immediately
      onLoad();
      return;
    }
    const s = document.createElement('script');
    s.id = 'tv-script';
    s.src = 'https://s3.tradingview.com/tv.js';
    s.async = true;
    s.onload = onLoad;
    document.head.appendChild(s);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/* ─────────────────────────────────────────────
   Mini sparkline chart (DOW / NASDAQ / SP500 / R2000)
───────────────────────────────────────────── */
interface MiniChartProps {
  symbol: string;
  label: string;
}

function MiniChart({ symbol }: MiniChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useTradingViewScript(() => {
    if (initialized.current || !ref.current) return;
    initialized.current = true;
    // @ts-expect-error
    new window.TradingView.MiniWidget({
      container_id: ref.current.id,
      symbol,
      width: '100%',
      height: 160,
      locale: 'en',
      dateRange: '1D',
      colorTheme: 'light',
      trendLineColor: 'rgba(41, 98, 255, 1)',
      underLineColor: 'rgba(41, 98, 255, 0.3)',
      underLineBottomColor: 'rgba(41, 98, 255, 0)',
      isTransparent: false,
      autosize: true,
      largeChartUrl: '',
    });
  });

  const id = `tv-mini-${symbol.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div ref={ref} id={id} style={{ height: 160 }} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Sector Heatmap
───────────────────────────────────────────── */
function SectorHeatmap() {
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useTradingViewScript(() => {
    if (initialized.current || !ref.current) return;
    initialized.current = true;
    // @ts-expect-error
    new window.TradingView.widget({
      container_id: 'tv-heatmap',
      width: '100%',
      height: 400,
      locale: 'en',
      plotLineColorGrowing: 'rgba(41, 98, 255, 1)',
      plotLineColorFalling: 'rgba(255, 82, 82, 1)',
      gridLineColor: 'rgba(240, 243, 250, 0)',
      scaleFontColor: 'rgba(120, 123, 134, 1)',
      belowLineFillColorGrowing: 'rgba(41, 98, 255, 0.12)',
      belowLineFillColorFalling: 'rgba(255, 82, 82, 0.12)',
      symbolActiveColor: 'rgba(41, 98, 255, 0.12)',
      tabs: [
        {
          title: 'Sectors',
          symbols: [
            { s: 'AMEX:XLK', d: 'Technology' },
            { s: 'AMEX:XLF', d: 'Financials' },
            { s: 'AMEX:XLV', d: 'Health Care' },
            { s: 'AMEX:XLC', d: 'Communication' },
            { s: 'AMEX:XLY', d: 'Consumer Disc.' },
            { s: 'AMEX:XLP', d: 'Consumer Staples' },
            { s: 'AMEX:XLI', d: 'Industrials' },
            { s: 'AMEX:XLE', d: 'Energy' },
            { s: 'AMEX:XLB', d: 'Materials' },
            { s: 'AMEX:XLU', d: 'Utilities' },
            { s: 'AMEX:XLRE', d: 'Real Estate' },
          ],
          originalTitle: 'Sectors',
        },
      ],
    });
  });

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-3">🗺️ Sector Performance</h2>
      <div ref={ref} id="tv-heatmap" style={{ height: 400 }} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Hotlists widget (Gainers / Losers / Volume)
───────────────────────────────────────────── */
function HotlistsWidget() {
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useTradingViewScript(() => {
    if (initialized.current || !ref.current) return;
    initialized.current = true;
    // @ts-expect-error
    new window.TradingView.widget({
      container_id: 'tv-hotlists',
      width: '100%',
      height: 400,
      locale: 'en',
      colorTheme: 'light',
      exchange: 'US',
      showChart: true,
      locale2: 'en',
    });
  });

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-3">🔥 Market Movers</h2>
      <div ref={ref} id="tv-hotlists" style={{ height: 400 }} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Market Screener (Gainers / Losers / Volume tabs)
───────────────────────────────────────────── */
function MarketScreener() {
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useTradingViewScript(() => {
    if (initialized.current || !ref.current) return;
    initialized.current = true;
    const widgetScript = document.createElement('script');
    widgetScript.src = 'https://s3.tradingview.com/external-embedding/embed-widget-screener.js';
    widgetScript.async = true;
    widgetScript.innerHTML = JSON.stringify({
      width: '100%',
      height: 490,
      defaultColumn: 'overview',
      defaultScreen: 'most_capitalized',
      market: 'america',
      showToolbar: true,
      colorTheme: 'light',
      locale: 'en',
    });
    ref.current!.appendChild(widgetScript);
  });

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-3">📋 Stock Screener</h2>
      <div className="tradingview-widget-container" ref={ref} style={{ height: 490 }}>
        <div className="tradingview-widget-container__widget" style={{ height: '100%' }} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Forex / Crypto ticker tape (top of page)
───────────────────────────────────────────── */
function TickerTape() {
  const ref = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useTradingViewScript(() => {
    if (initialized.current || !ref.current) return;
    initialized.current = true;
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    s.async = true;
    s.innerHTML = JSON.stringify({
      symbols: [
        { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500 Index' },
        { proName: 'FOREXCOM:NSXUSD', title: 'US 100 Cash CFD' },
        { proName: 'FX_IDC:EURUSD', title: 'EUR to USD' },
        { description: 'Bitcoin', proName: 'BITSTAMP:BTCUSD' },
        { description: 'Ethereum', proName: 'BITSTAMP:ETHUSD' },
        { proName: 'NASDAQ:AAPL', title: 'Apple' },
        { proName: 'NASDAQ:NVDA', title: 'NVIDIA' },
        { proName: 'NASDAQ:MSFT', title: 'Microsoft' },
        { proName: 'NASDAQ:TSLA', title: 'Tesla' },
        { proName: 'NASDAQ:META', title: 'Meta' },
        { proName: 'NASDAQ:GOOGL', title: 'Alphabet' },
        { proName: 'NASDAQ:AMZN', title: 'Amazon' },
      ],
      showSymbolLogo: true,
      isTransparent: false,
      displayMode: 'adaptive',
      colorTheme: 'dark',
      locale: 'en',
    });
    ref.current!.appendChild(s);
  });

  return (
    <div ref={ref} className="tradingview-widget-container mb-6 rounded-lg overflow-hidden shadow">
      <div className="tradingview-widget-container__widget" />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */
const INDEX_CHARTS = [
  { symbol: 'FOREXCOM:SPXUSD', label: 'S&P 500' },
  { symbol: 'FOREXCOM:NSXUSD', label: 'NASDAQ 100' },
  { symbol: 'INDEX:DJI',        label: 'DOW JONES' },
  { symbol: 'TVC:RUT',          label: 'RUSSELL 2000' },
];

export default function MarketOverviewPage() {
  return (
    <Layout title="Market Overview">
      {/* Live Ticker Tape */}
      <TickerTape />

      {/* Index Mini Charts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {INDEX_CHARTS.map((c) => (
          <MiniChart key={c.symbol} symbol={c.symbol} label={c.label} />
        ))}
      </div>

      {/* Sector Heatmap */}
      <div className="mb-6">
        <SectorHeatmap />
      </div>

      {/* Screener + Movers side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <MarketScreener />
        <HotlistsWidget />
      </div>

      {/* Footer disclaimer */}
      <p className="text-xs text-gray-400 text-center mt-2">
        Market data provided by TradingView. For informational purposes only — not financial advice.
      </p>
    </Layout>
  );
}
