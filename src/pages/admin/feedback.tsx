'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { Layout } from '@/components/Layout';
import { getSupabaseClient } from '@/lib/supabase';

interface FeedbackRow {
  id: string;
  user_id: string | null;
  email: string;
  display_name: string | null;
  category: string;
  rating: number;
  message: string;
  status: string;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  bug:     'Bug',
  feature: 'Feature',
  other:   'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  general: 'bg-blue-100 text-blue-700',
  bug:     'bg-red-100 text-red-700',
  feature: 'bg-purple-100 text-purple-700',
  other:   'bg-gray-100 text-gray-600',
};

const STATUS_COLORS: Record<string, string> = {
  new:      'bg-amber-100 text-amber-700',
  reviewed: 'bg-blue-100 text-blue-700',
  resolved: 'bg-green-100 text-green-700',
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-400 text-sm tracking-tight">
      {'★'.repeat(rating)}
      <span className="text-gray-300">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

export default function AdminFeedbackPage() {
  const router = useRouter();
  const { isLoading: authLoading, isAdmin } = useAuthStore();

  const [rows, setRows]           = useState<FeedbackRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter]     = useState('all');
  const [page, setPage]           = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Admin guard
  useEffect(() => {
    if (!authLoading && !isAdmin()) {
      router.push('/dashboard');
    }
  }, [authLoading, isAdmin, router]);

  const loadFeedback = useCallback(async () => {
    if (!isAdmin()) return;
    try {
      setIsLoading(true);
      setError('');
      const supabase = getSupabaseClient();
      if (!supabase) { setError('Database not configured'); return; }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { setError('Not authenticated'); return; }

      const params = new URLSearchParams({
        page: String(page),
        category: categoryFilter,
        status: statusFilter,
      });

      const res = await fetch(`/api/feedback?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();

      if (!res.ok) { setError(json.error || 'Failed to load feedback'); return; }
      setRows(json.data ?? []);
    } catch {
      setError('Unexpected error loading feedback');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, page, categoryFilter, statusFilter]);

  useEffect(() => { loadFeedback(); }, [loadFeedback]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      setUpdatingId(id);
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) return;

      const res = await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setRows((prev) => prev.map((r) => r.id === id ? { ...r, status: newStatus } : r));
      }
    } finally {
      setUpdatingId(null);
    }
  };

  // Summary stats
  const stats = {
    total:    rows.length,
    new:      rows.filter((r) => r.status === 'new').length,
    avgRating: rows.length
      ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1)
      : '—',
    bugs:     rows.filter((r) => r.category === 'bug').length,
    features: rows.filter((r) => r.category === 'feature').length,
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <Layout title="Feedback — Admin">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">User Feedback</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Review and manage submitted feedback</p>
          </div>
          <button
            onClick={loadFeedback}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total',      value: stats.total    },
            { label: 'New',        value: stats.new      },
            { label: 'Avg Rating', value: `${stats.avgRating} ★` },
            { label: 'Bugs',       value: stats.bugs     },
            { label: 'Features',   value: stats.features },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3 text-center">
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">Category:</label>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="general">General</option>
              <option value="bug">Bug</option>
              <option value="feature">Feature</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm">No feedback found for the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">User</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Rating</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Message</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="bg-card hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground truncate max-w-[140px]">
                        {row.display_name || '—'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate max-w-[140px]">{row.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${CATEGORY_COLORS[row.category] ?? 'bg-gray-100 text-gray-600'}`}>
                        {CATEGORY_LABELS[row.category] ?? row.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Stars rating={row.rating} />
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-foreground line-clamp-2">{row.message}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {new Date(row.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={row.status}
                        disabled={updatingId === row.id}
                        onChange={(e) => handleStatusChange(row.id, e.target.value)}
                        className={`rounded px-2 py-1 text-xs font-semibold border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${STATUS_COLORS[row.status] ?? ''}`}
                      >
                        <option value="new">New</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && rows.length > 0 && (
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>Page {page}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded border border-border hover:bg-accent transition-colors disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={rows.length < 25}
                className="px-3 py-1.5 rounded border border-border hover:bg-accent transition-colors disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
