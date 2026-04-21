import { Layout } from '@/components/Layout';
import { TradeForm } from '@/components/TradeForm';
import { TradeList } from '@/components/TradeList';
import { ImportTradesModal } from '@/components/ImportTradesModal';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';

export default function TradesPage() {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [listKey, setListKey] = useState(0);

  useEffect(() => {
    if (router.query.add === 'true') {
      setShowForm(true);
    }
  }, [router.query]);

  const handleImported = useCallback(() => {
    setShowImport(false);
    setListKey((k) => k + 1); // force TradeList to re-fetch
  }, []);

  return (
    <Layout title="Trades">
      {showImport && (
        <ImportTradesModal
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}

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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImport(true)}
                className="px-4 py-2 border border-border text-foreground rounded-lg hover:bg-muted font-medium text-sm flex items-center gap-1.5"
              >
                ⬆ Import CSV
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
              >
                + New Trade
              </button>
            </div>
          </div>
          <TradeList key={listKey} />
        </div>
      )}
    </Layout>
  );
}
