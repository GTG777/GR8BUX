import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function Home() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isLoading && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [mounted, isLoading, isAuthenticated, router]);

  if (!mounted || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (isAuthenticated) {
    return null; // redirecting via useEffect above
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Navigation */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Trading Journal</h1>
          <div className="flex gap-4">
            <Link
              href="/auth/signin"
              className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
            >
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-5xl font-bold text-gray-900 mb-4">Trading Journal</h2>
          <p className="text-xl text-gray-600 mb-8">
            Track your stock and options trades with professional analytics and market insights
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/auth/signup"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition inline-block"
            >
              Get Started
            </Link>
            <Link
              href="/auth/signin"
              className="bg-white hover:bg-gray-100 text-gray-900 font-bold py-3 px-8 rounded-lg border border-gray-300 transition inline-block"
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-16">
          {[
            {
              title: 'Trade Logging',
              description: 'Log stocks and options trades with automatic Greeks calculation',
              icon: '📊',
            },
            {
              title: 'Analytics',
              description: 'Track P&L, win rate, and performance metrics by strategy',
              icon: '📈',
            },
            {
              title: 'Market News',
              description: 'Monitor headlines and community sentiment for your watchlist',
              icon: '📰',
            },
            {
              title: 'Technical Setups',
              description: 'Detect coiling stocks and consolidation patterns automatically',
              icon: '🎯',
            },
            {
              title: 'Community',
              description: 'Track what the community is talking about on Reddit and StockTwits',
              icon: '💬',
            },
            {
              title: 'Cloud Sync',
              description: 'Your trades synced across devices with Supabase',
              icon: '☁️',
            },
          ].map((feature, idx) => (
            <div
              key={idx}
              className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Status */}
        <div className="mt-16 p-8 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">✅ Now Live</h3>
          <p className="text-gray-700 mb-4">
            The Trading Journal app is now live with core features implemented:
          </p>
          <ul className="text-gray-700 space-y-2 ml-4">
            <li>✓ User authentication with role-based access (Admin, Manager, User)</li>
            <li>✓ Stock and options trade logging with automatic Greeks calculation</li>
            <li>✓ Trade analytics with P&L tracking and performance metrics</li>
            <li>✓ Professional dashboard with charts and statistics</li>
            <li>✓ Cloud-based storage with Supabase</li>
          </ul>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">Ready to start tracking your trades?</p>
          <Link
            href="/auth/signup"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-12 rounded-lg transition inline-block text-lg"
          >
            Create Free Account
          </Link>
        </div>
      </div>
    </div>
  );
}
