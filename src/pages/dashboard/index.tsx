import React from 'react';
import { Layout } from '@/components/Layout';
import MacroBar from '@/components/MacroBar';
import SectorRotationPanel from '@/components/SectorRotationPanel';
import TopMovers from '@/components/TopMovers';
import IndexTape from '@/components/IndexTape';
import SparklineCard from '@/components/SparklineCard';
import SectorGrid from '@/components/SectorGrid';

/* TV widgets removed — replaced by commercial-safe components */

const INDEX_CHARTS = [
  { symbol: 'SPY',  title: 'S&P 500'     },
  { symbol: 'QQQ',  title: 'NASDAQ 100'  },
  { symbol: 'DIA',  title: 'Dow Jones'   },
  { symbol: 'IWM',  title: 'Russell 2000'},
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

        <div className="rounded-xl overflow-hidden shadow border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-900">
          <IndexTape />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {INDEX_CHARTS.map((c) => (
            <SparklineCard key={c.symbol} symbol={c.symbol} title={c.title} />
          ))}
        </div>

        <SectorGrid />

        <TopMovers />
      </div>
    </Layout>
  );
}
