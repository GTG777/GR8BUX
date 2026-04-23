import React from 'react';
import Link from 'next/link';
import { Layout } from '@/components/Layout';

export default function StockScreenerPage() {
  return (
    <Layout title="Stock Screener">
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="text-5xl">🔍</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Full Screener Coming Soon
        </h1>
        <p className="text-gray-500 dark:text-zinc-400 text-base leading-relaxed">
          We are building a custom stock screener powered by your own data — no third-party
          embeds, full SaaS licensing compliance.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            ← Market Overview
          </Link>
          <Link
            href="/stocks"
            className="inline-flex items-center justify-center gap-2 border border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Stock Analysis →
          </Link>
        </div>

        <p className="text-xs text-gray-400 dark:text-zinc-600 pt-6">
          In the meantime, use Top Movers on the dashboard to find active names.
        </p>
      </div>
    </Layout>
  );
}

