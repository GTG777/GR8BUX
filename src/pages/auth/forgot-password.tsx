'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { getSupabaseClient } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const enable = saved !== null ? saved === 'true' : prefersDark;
    setDarkMode(enable);
    document.documentElement.classList.toggle('dark', enable);
  }, []);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('darkMode', String(next));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    const client = getSupabaseClient();
    if (!client) {
      setError('Service unavailable. Please try again later.');
      setIsSubmitting(false);
      return;
    }
    const { error: resetError } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (resetError) {
      setError(resetError.message);
      setIsSubmitting(false);
    } else {
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="https://gr8bux.com" aria-label="GR8BUX home">
            <Logo size={36} />
          </a>
          <nav className="hidden md:flex items-center gap-1">
            <a href="https://gr8bux.com" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Home</a>
            <a href="https://gr8bux.com/features" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="https://gr8bux.com/pricing" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            <a href="https://gr8bux.com/about" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">About</a>
            <a href="https://gr8bux.com/contact" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-13H20m-16 0H2.34M17.66 17.66l-.71-.71M7.05 7.05l-.71-.71M17.66 7.05l-.71.71M7.05 17.66l.71-.71M12 5a7 7 0 100 14A7 7 0 0012 5z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
            <Link href="/auth/signin" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link href="/auth/signup" className="inline-flex items-center justify-center rounded-md bg-gradient-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="relative flex-1 flex items-center justify-center py-16 px-4">
        <div className="pointer-events-none absolute inset-0 bg-radial-fade" />

        <div className="relative w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card shadow-elevated p-8 space-y-6">

            {submitted ? (
              /* Success state */
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="w-14 h-14 rounded-full bg-gradient-brand flex items-center justify-center">
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <h1 className="font-display text-2xl font-semibold text-foreground">Check your email</h1>
                <p className="text-sm text-muted-foreground">
                  We sent a password reset link to <span className="font-medium text-foreground">{email}</span>. Check your inbox and follow the instructions.
                </p>
                <p className="text-xs text-muted-foreground">Didn&apos;t receive it? Check your spam folder or{' '}
                  <button onClick={() => setSubmitted(false)} className="text-primary hover:opacity-80 transition-opacity underline">
                    try again
                  </button>.
                </p>
                <Link href="/auth/signin" className="inline-flex items-center justify-center w-full rounded-lg bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90">
                  Back to Sign In
                </Link>
              </div>
            ) : (
              /* Form state */
              <>
                <div className="text-center space-y-3">
                  <div className="flex justify-center">
                    <Logo size={52} iconOnly />
                  </div>
                  <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                    Forgot password?
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Enter your email and we&apos;ll send you a reset link.
                  </p>
                </div>

                {error && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="block text-sm font-medium text-foreground">
                      Email Address
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(''); }}
                      disabled={isSubmitting}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="you@example.com"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full inline-flex items-center justify-center rounded-lg bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Sending…' : 'Send reset link'}
                  </button>
                </form>

                <p className="text-center text-sm text-muted-foreground">
                  Remember your password?{' '}
                  <Link href="/auth/signin" className="font-medium text-primary hover:opacity-80 transition-opacity">
                    Sign In
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-muted/40 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-10">
          <div className="space-y-4">
            <a href="https://gr8bux.com" aria-label="GR8BUX home">
              <Logo size={36} />
            </a>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The analysis platform built for serious traders and investors. Track, learn, and decide with clarity.
            </p>
            <p className="text-sm text-primary">Not financial advice. For educational and analytical purposes only.</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Product</h3>
            <ul className="space-y-2">
              <li><a href="https://gr8bux.com/features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
              <li><a href="https://gr8bux.com/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Company</h3>
            <ul className="space-y-2">
              <li><a href="https://gr8bux.com/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">About</a></li>
              <li><a href="https://gr8bux.com/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border">
          <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-2">
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} GR8BUX. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="https://gr8bux.com/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</a>
              <a href="https://gr8bux.com/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
              <a href="https://gr8bux.com/disclaimer" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Disclaimer</a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
