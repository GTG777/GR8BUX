import React from 'react';
import Link from 'next/link';

export default function Navigation() {
  return (
    <nav className="bg-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link href="/" className="text-2xl font-bold text-blue-600">
            📊 Trading Journal
          </Link>

          {/* Nav Links */}
          <div className="flex gap-6">
            <Link href="/dashboard" className="text-gray-700 hover:text-blue-600 transition">
              Dashboard
            </Link>
            <Link href="/trades" className="text-gray-700 hover:text-blue-600 transition">
              Trades
            </Link>
            <Link href="/analytics" className="text-gray-700 hover:text-blue-600 transition">
              Analytics
            </Link>
            <Link href="/news" className="text-gray-700 hover:text-blue-600 transition">
              News
            </Link>
            <Link href="/community" className="text-gray-700 hover:text-blue-600 transition">
              Community
            </Link>
          </div>

          {/* User Menu */}
          <div className="flex gap-4">
            <button className="btn-primary text-sm py-2 px-4">
              Login
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
