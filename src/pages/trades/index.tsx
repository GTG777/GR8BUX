import { Layout } from '@/components/Layout';
import { TradeForm } from '@/components/TradeForm';
import { TradeList } from '@/components/TradeList';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';

export default function TradesPage() {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (router.query.add === 'true') {
      setShowForm(true);
    }
  }, [router.query]);

  return (
    <Layout title="Trades">
      {showForm ? (
        <div>
          <div className="mb-4">
            <button
              onClick={() => setShowForm(false)}
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              ← Back to trade list
            </button>
          </div>
          <TradeForm />
        </div>
      ) : (
        <div>
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Trade History</h2>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
            >
              + New Trade
            </button>
          </div>
          <TradeList />
        </div>
      )}
    </Layout>
  );
}
