import React, { useEffect, useRef } from 'react';
import { Layout } from '@/components/Layout';
import MacroBar from '@/components/MacroBar';
import SectorRotationPanel from '@/components/SectorRotationPanel';

const TV_EMBED = 'https://s3.tradingview.com/external-embedding';

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
    script.innerHTML = JSON.stringify(config);
    containerRef.current.appendChild(script);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="tradingview-widget-container" ref={containerRef} style={{ minHeight: height, borderRadius: 'inherit', overflow: 'hidden' }}>
      <div className="tradingview-widget-container__widget" style={{ borderRadius: 'inherit' }} />
    </div>
  );
}

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
        isTransparent: true,
        displayMode: 'adaptive',
        colorTheme: 'dark',
        locale: 'en',
      }}
    />
  );
}

function MiniChart({ symbol, title }: { symbol: string; title: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg shadow overflow-hidden">
      <div className="px-3 pt-2 text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
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
          colorTheme: 'dark',
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

function SectorHeatmap() {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg shadow overflow-hidden p-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">🗺️ Sector Performance</h2>
      <TVWidget
        src={`${TV_EMBED}/embed-widget-etf-heatmap.js`}
        height={560}
        config={{
          dataSource: 'AllUSEtf',
          blockSize: 'aum',
          blockColor: 'change',
          grouping: 'asset_class',
          locale: 'en',
          symbolUrl: '',
          colorTheme: 'dark',
          hasTopBar: true,
          isDataSetEnabled: true,
          isZoomEnabled: true,
          hasSymbolTooltip: true,
          isMonoSize: false,
          width: '100%',
          height: 560,
        }}
      />
    </div>
  );
}

function MarketScreener() {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg shadow overflow-hidden p-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">🔍 Stock Screener</h2>
      <TVWidget
        src={`${TV_EMBED}/embed-widget-screener.js`}
        height={600}
        config={{
          width: '100%',
          height: 600,
          defaultColumn: 'overview',
          defaultScreen: 'general',
          market: 'us',
          showToolbar: true,
          colorTheme: 'dark',
          locale: 'en',
        }}
      />
    </div>
  );
}

function HotlistsWidget() {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg shadow overflow-hidden p-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">🔥 Top Movers</h2>
      <TVWidget
        src={`${TV_EMBED}/embed-widget-hotlists.js`}
        height={600}
        config={{
          colorTheme: 'dark',
          dateRange: '1D',
          exchange: 'US',
          showChart: true,
          locale: 'en',
          width: '100%',
          height: 600,
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

const INDEX_CHARTS = [
  { symbol: 'FOREXCOM:SPXUSD', title: 'S&P 500' },
  { symbol: 'FOREXCOM:NSXUSD', title: 'NASDAQ 100' },
  { symbol: 'FOREXCOM:DJI',    title: 'Dow Jones' },
  { symbol: 'TVC:RUT',         title: 'Russell 2000' },
];

export default function DashboardPage() {
  const [today, setToday] = React.useState('');
  React.useEffect(() => {
    setToday(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
  }, []);

  return (
    <Layout title="Dashboard">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Market Overview</h1>
          {today && <p className="text-sm text-gray-400 dark:text-zinc-500 mt-0.5">{today}</p>}
        </div>

        <MacroBar />
        <SectorRotationPanel />

        <div className="rounded-xl overflow-hidden shadow border border-zinc-700/60 bg-zinc-900">
          <TickerTape />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {INDEX_CHARTS.map((c) => (
            <MiniChart key={c.symbol} symbol={c.symbol} title={c.title} />
          ))}
        </div>

        <SectorHeatmap />

        <div className="space-y-4">
          <MarketScreener />
          <HotlistsWidget />
        </div>
      </div>
    </Layout>
  );
}
