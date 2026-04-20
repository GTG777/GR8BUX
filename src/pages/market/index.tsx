import React, { useEffect, useRef, useState } from 'react';
import { Layout } from '@/components/Layout';

function StockScreenerWidget({ colorTheme }: { colorTheme: 'dark' | 'light' }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any previous widget on theme change
    containerRef.current.innerHTML = '<div class="tradingview-widget-container__widget h-full" />';

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
      colorTheme,
      locale: 'en',
    });
    containerRef.current.appendChild(script);
  // Re-run when theme changes to re-initialize the widget with correct colors
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorTheme]);

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
  const [colorTheme, setColorTheme] = useState<'dark' | 'light'>('light');

  useEffect(() => {
    // Read initial state from localStorage (set by Layout's dark mode toggle)
    const saved = localStorage.getItem('darkMode');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved !== null ? saved === 'true' : prefersDark;
    setColorTheme(isDark ? 'dark' : 'light');

    // Watch for class changes on <html> so widget re-syncs when user toggles
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      setColorTheme(dark ? 'dark' : 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

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

        {/* Full-height screener — re-keyed on theme so widget fully re-mounts */}
        <div className="flex-1 px-0">
          <StockScreenerWidget key={colorTheme} colorTheme={colorTheme} />
        </div>
      </div>
    </Layout>
  );
}
