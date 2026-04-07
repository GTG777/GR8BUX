import React, { useEffect, useRef } from 'react';
import { Layout } from '@/components/Layout';
import MacroBar from '@/components/MacroBar';

const TV_EMBED = 'https://s3.tradingview.com/external-embedding';

/* ─────────────────────────────────────────────
   Generic TradingView embed widget helper
   Each widget type has its own embed script URL.
   Config is passed as JSON text inside the script.
───────────────────────────────────────────── */
function TVWidget({
  src,
  config,
  height,
}: {
  src: string;
  config: Record<string, unknown>;
  height: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !containerRef.current) return;
    initialized.current = true;

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = src;
    script.async = true;
    // TradingView reads the JSON config from the script's text content
    script.innerHTML = JSON.stringify(config);
    containerRef.current.appendChild(script);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      style={{ minHeight: height }}
    >
      <div className="tradingview-widget-container__widget" />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Ticker Tape
───────────────────────────────────────────── */
function TickerTape() {
  return (
    <TVWidget
      src={`${TV_EMBED}/embed-widget-ticker-tape.js`}
      height={52}
      config={{
        symbols: [
          { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500' },
          { proName: 'FOREXCOM:NSXUSD', title: 'NASDAQ 100' },
          { proName: 'FOREXCOM:DJI',    title: 'Dow Jones' },
          { proName: 'TVC:RUT',         title: 'Russell 2000' },
          { proName: 'TVC:VIX',         title: 'VIX' },
          { proName: 'BITSTAMP:BTCUSD', title: 'Bitcoin' },
          { proName: 'BITSTAMP:ETHUSD', title: 'Ethereum' },
          { proName: 'NASDAQ:NVDA',     title: 'NVDA' },
          { proName: 'NASDAQ:AAPL',     title: 'AAPL' },
          { proName: 'NASDAQ:MSFT',     title: 'MSFT' },
          { proName: 'NASDAQ:TSLA',     title: 'TSLA' },
          { proName: 'NASDAQ:META',     title: 'META' },
          { proName: 'NASDAQ:GOOGL',    title: 'GOOGL' },
          { proName: 'NASDAQ:AMZN',     title: 'AMZN' },
        ],
        showSymbolLogo: true,
        isTransparent: false,
        displayMode: 'adaptive',
        colorTheme: 'dark',
        locale: 'en',
      }}
    />
  );
}

/* ─────────────────────────────────────────────
   Mini sparkline chart per index
───────────────────────────────────────────── */
function MiniChart({ symbol, title }: { symbol: string; title: string }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-3 pt-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {title}
      </div>
      <TVWidget
        src={`${TV_EMBED}/embed-widget-mini-symbol-overview.js`}
        height={160}
        config={{
          symbol,
          width: '100%',
          height: 160,
          locale: 'en',
          dateRange: '1D',
          colorTheme: 'light',
          trendLineColor: 'rgba(41, 98, 255, 1)',
          underLineColor: 'rgba(41, 98, 255, 0.3)',
          underLineBottomColor: 'rgba(41, 98, 255, 0)',
          isTransparent: true,
          autosize: true,
          largeChartUrl: '',
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   ETF Sector Heatmap
───────────────────────────────────────────── */
function SectorHeatmap() {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-3">🗺️ Sector Performance</h2>
      <TVWidget
        src={`${TV_EMBED}/embed-widget-etf-heatmap.js`}
        height={420}
        config={{
          dataSource: 'AllUSEtf',
          blockSize: 'aum',
          blockColor: 'change',
          grouping: 'asset_class',
          locale: 'en',
          symbolUrl: '',
          colorTheme: 'light',
          hasTopBar: false,
          isDataSetEnabled: false,
          isZoomEnabled: true,
          hasSymbolTooltip: true,
          isMonoSize: false,
          width: '100%',
          height: 420,
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Market Overview (Indices / Sectors / Futures tabs)
───────────────────────────────────────────── */
function MarketOverviewWidget() {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-3">📊 Market Overview</h2>
      <TVWidget
        src={`${TV_EMBED}/embed-widget-market-overview.js`}
        height={500}
        config={{
          colorTheme: 'light',
          dateRange: '12M',
          showChart: true,
          locale: 'en',
          width: '100%',
          height: 500,
          largeChartUrl: '',
          isTransparent: false,
          showSymbolLogo: true,
          showFloatingTooltip: false,
          plotLineColorGrowing: 'rgba(41, 98, 255, 1)',
          plotLineColorFalling: 'rgba(255, 82, 82, 1)',
          gridLineColor: 'rgba(240, 243, 250, 0)',
          scaleFontColor: 'rgba(120, 123, 134, 1)',
          belowLineFillColorGrowing: 'rgba(41, 98, 255, 0.12)',
          belowLineFillColorFalling: 'rgba(255, 82, 82, 0.12)',
          symbolActiveColor: 'rgba(41, 98, 255, 0.12)',
          tabs: [
            {
              title: 'Indices',
              symbols: [
                { s: 'FOREXCOM:SPXUSD', d: 'S&P 500' },
                { s: 'FOREXCOM:NSXUSD', d: 'NASDAQ 100' },
                { s: 'FOREXCOM:DJI',    d: 'Dow Jones' },
                { s: 'TVC:RUT',         d: 'Russell 2000' },
                { s: 'TVC:VIX',         d: 'Volatility VIX' },
              ],
              originalTitle: 'Indices',
            },
            {
              title: 'Sectors',
              symbols: [
                { s: 'AMEX:XLK',  d: 'Technology' },
                { s: 'AMEX:XLF',  d: 'Financials' },
                { s: 'AMEX:XLV',  d: 'Health Care' },
                { s: 'AMEX:XLC',  d: 'Communication' },
                { s: 'AMEX:XLY',  d: 'Consumer Disc.' },
                { s: 'AMEX:XLP',  d: 'Consumer Staples' },
                { s: 'AMEX:XLI',  d: 'Industrials' },
                { s: 'AMEX:XLE',  d: 'Energy' },
                { s: 'AMEX:XLB',  d: 'Materials' },
                { s: 'AMEX:XLU',  d: 'Utilities' },
                { s: 'AMEX:XLRE', d: 'Real Estate' },
              ],
              originalTitle: 'Sectors',
            },
            {
              title: 'Futures',
              symbols: [
                { s: 'CME_MINI:ES1!', d: 'S&P 500' },
                { s: 'CME:NQ1!',      d: 'NASDAQ 100' },
                { s: 'CME:YM1!',      d: 'Dow Jones' },
                { s: 'NYMEX:CL1!',    d: 'Crude Oil' },
                { s: 'COMEX:GC1!',    d: 'Gold' },
              ],
              originalTitle: 'Futures',
            },
          ],
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Stock Screener
───────────────────────────────────────────── */
function MarketScreener() {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-3">🔍 Stock Screener</h2>
      <TVWidget
        src={`${TV_EMBED}/embed-widget-screener.js`}
        height={490}
        config={{
          width: '100%',
          height: 490,
          defaultColumn: 'overview',
          defaultScreen: 'general',
          market: 'us',
          showToolbar: true,
          colorTheme: 'light',
          locale: 'en',
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Top Movers / Hotlists
───────────────────────────────────────────── */
function HotlistsWidget() {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-3">🔥 Top Movers</h2>
      <TVWidget
        src={`${TV_EMBED}/embed-widget-hotlists.js`}
        height={490}
        config={{
          colorTheme: 'light',
          dateRange: '1D',
          exchange: 'US',
          showChart: true,
          locale: 'en',
          width: '100%',
          height: 490,
          largeChartUrl: '',
          isTransparent: false,
          showSymbolLogo: false,
          showFloatingTooltip: false,
          plotLineColorGrowing: 'rgba(41, 98, 255, 1)',
          plotLineColorFalling: 'rgba(255, 82, 82, 1)',
          gridLineColor: 'rgba(240, 243, 250, 0)',
          scaleFontColor: 'rgba(120, 123, 134, 1)',
          belowLineFillColorGrowing: 'rgba(41, 98, 255, 0.12)',
          belowLineFillColorFalling: 'rgba(255, 82, 82, 0.12)',
          symbolActiveColor: 'rgba(41, 98, 255, 0.12)',
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */
const INDEX_CHARTS = [
  { symbol: 'FOREXCOM:SPXUSD', title: 'S&P 500' },
  { symbol: 'FOREXCOM:NSXUSD', title: 'NASDAQ 100' },
  { symbol: 'FOREXCOM:DJI',    title: 'Dow Jones' },
  { symbol: 'TVC:RUT',         title: 'Russell 2000' },
];

export default function MarketOverviewPage() {
  return (
    <Layout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Market Overview</h1>

        {/* Macro Dashboard */}
        <MacroBar />

        {/* Ticker Tape */}
        <div className="rounded-lg overflow-hidden shadow">
          <TickerTape />
        </div>

        {/* Index Mini Charts */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {INDEX_CHARTS.map((c) => (
            <MiniChart key={c.symbol} symbol={c.symbol} title={c.title} />
          ))}
        </div>

        {/* Market Overview + ETF Heatmap */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MarketOverviewWidget />
          <SectorHeatmap />
        </div>

        {/* Screener + Movers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MarketScreener />
          <HotlistsWidget />
        </div>

        <p className="text-xs text-gray-400 text-center">
          Market data provided by TradingView — for informational purposes only, not financial advice.
        </p>
      </div>
    </Layout>
  );
}
