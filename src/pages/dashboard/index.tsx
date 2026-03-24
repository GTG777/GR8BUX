import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Dashboard } from '@/components/Dashboard';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function DashboardPage() {
  const router = useRouter();

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
              <h1 className="text-3xl font-bold text-gray-900">Trading Journal</h1>
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

        {/* Dashboard Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Dashboard />
        </div>
      </div>
    </ProtectedRoute>
  );
}
