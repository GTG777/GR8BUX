import React, { useEffect, useRef } from 'react';
import { Layout } from '@/components/Layout';

function StockScreenerWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !containerRef.current) return;
    initialized.current = true;

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-screener.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      width: '100%',
      height: '100%',
      defaultColumn: 'overview',
      defaultScreen: 'general',
      market: 'us',
      showToolbar: true,
      colorTheme: 'dark',
      locale: 'en',
    });
    containerRef.current.appendChild(script);
  }, []);

  return (
    <div
      className="tradingview-widget-container w-full h-full"
      ref={containerRef}
      style={{ minHeight: 'calc(100vh - 120px)' }}
    >
      <div className="tradingview-widget-container__widget h-full" />
    </div>
  );
}

export default function StockScreenerPage() {
  return (
    <Layout title="Stock Screener">
      <div className="flex flex-col h-full -mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
        {/* Page header */}
        <div className="px-6 pt-5 pb-3 flex items-center gap-3 border-b border-gray-200 dark:border-zinc-800">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">🔍 Stock Screener</h1>
          <span className="text-xs text-gray-400 dark:text-zinc-500">
            Filter by fundamentals, technicals, sector, market cap, and more
          </span>
        </div>

        {/* Full-height screener */}
        <div className="flex-1 px-0">
          <StockScreenerWidget />
        </div>
      </div>
    </Layout>
  );
}
