import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TradeForm } from '@/components/TradeForm';
import { TradeList } from '@/components/TradeList';
import Link from 'next/link';
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

  const navLinks = [
    { href: '/dashboard', label: '📊 Dashboard', icon: '📊' },
    { href: '/trades', label: '📈 Trades', icon: '📈' },
    { href: '/news', label: '📰 News', icon: '📰' },
    { href: '/community', label: '💬 Community', icon: '💬' },
    { href: '/technical', label: '⚙️ Technical', icon: '⚙️' },
  ];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4 mb-4">
              <h1 className="text-3xl font-bold text-gray-900">My Trades</h1>
              <Link
                href="/auth/signin?logout=true"
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Sign Out
              </Link>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 overflow-x-auto border-b border-gray-200">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`whitespace-nowrap px-4 py-2 font-medium transition-colors ${
                    router.pathname === link.href
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {showForm ? (
            <div>
              <TradeForm />
            </div>
          ) : (
            <div>
              <div className="mb-6 flex justify-between items-center">
                <h2 className="text-2xl font-semibold text-gray-900">Trade History</h2>
                <button
                  onClick={() => setShowForm(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  + New Trade
                </button>
              </div>
              <TradeList />
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
