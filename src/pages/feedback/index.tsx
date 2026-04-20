'use client';

import React, { useState } from 'react';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { getSupabaseClient } from '@/lib/supabase';

const CATEGORIES = [
  { value: 'general', label: 'General Feedback', emoji: '💬' },
  { value: 'bug',     label: 'Bug Report',        emoji: '🐛' },
  { value: 'feature', label: 'Feature Request',   emoji: '✨' },
  { value: 'other',   label: 'Other',             emoji: '📝' },
];

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="text-3xl transition-transform hover:scale-110 focus:outline-none"
          aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}
        >
          <span className={(hovered || value) >= star ? 'text-amber-400 dark:text-amber-400' : 'text-gray-300 dark:text-gray-600'}>
            ★
          </span>
        </button>
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const [category, setCategory] = useState('general');
  const [rating, setRating]     = useState(0);
  const [message, setMessage]   = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (rating === 0) {
      setError('Please select a star rating.');
      return;
    }
    if (message.trim().length < 10) {
      setError('Message must be at least 10 characters.');
      return;
    }

    try {
      setIsLoading(true);
      const supabase = getSupabaseClient();
      if (!supabase) { setError('Database not configured.'); return; }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { setError('Not authenticated.'); return; }

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ category, rating, message: message.trim() }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to submit feedback.');
        return;
      }

      setSuccess(true);
      setCategory('general');
      setRating(0);
      setMessage('');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout title="Feedback">
        <div className="max-w-2xl mx-auto px-4 py-10">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">Share Your Feedback</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Help us improve GR8BUX — your input shapes what we build next.
            </p>
          </div>

          {success ? (
            <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-8 text-center">
              <div className="text-4xl mb-3">🎉</div>
              <h2 className="text-lg font-semibold text-green-800 dark:text-green-300 mb-1">
                Thank you for your feedback!
              </h2>
              <p className="text-sm text-green-700 dark:text-green-400 mb-6">
                We appreciate you taking the time to share your thoughts.
              </p>
              <button
                onClick={() => setSuccess(false)}
                className="px-5 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
              >
                Submit Another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      className={`flex flex-col items-center gap-1 py-3 px-2 rounded-lg border text-sm font-medium transition-colors ${
                        category === cat.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-600'
                          : 'border-border text-muted-foreground hover:border-blue-300 hover:bg-accent'
                      }`}
                    >
                      <span className="text-xl">{cat.emoji}</span>
                      <span className="leading-tight text-center">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Rating */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Overall Rating
                </label>
                <StarRating value={rating} onChange={setRating} />
                {rating > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating]}
                  </p>
                )}
              </div>

              {/* Message */}
              <div>
                <label htmlFor="fb-message" className="block text-sm font-medium text-foreground mb-2">
                  Your Message
                </label>
                <textarea
                  id="fb-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="Tell us what you think, what's broken, or what you'd love to see..."
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <p className="mt-1 text-xs text-muted-foreground text-right">
                  {message.length}/2000
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-6 rounded-lg bg-gradient-brand text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {isLoading ? 'Submitting…' : 'Submit Feedback'}
              </button>
            </form>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
