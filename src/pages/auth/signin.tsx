'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { Logo } from '@/components/Logo';

export default function SignInPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, handleSignIn, error, clearError } = useAuthStore();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Sync dark mode from localStorage / system preference
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

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  const validateForm = (): boolean => {
    if (!formData.email || !formData.password) {
      setFormError('Email and password are required');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setFormError('Invalid email address');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    clearError();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    const success = await handleSignIn({
      email: formData.email,
      password: formData.password,
    });

    if (success) {
      router.push('/dashboard');
    } else {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setFormError('');
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 w-full border-b border-border/60 glass">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="https://gr8bux.com" aria-label="GR8BUX home">
            <Logo size={32} />
          </a>
          <nav className="hidden md:flex items-center gap-1">
            <a href="https://gr8bux.com" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">Home</a>
            <a href="https://gr8bux.com/features" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">Features</a>
            <a href="https://gr8bux.com/pricing" className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-13H20m-16 0H2.34M17.66 17.66l-.71-.71M7.05 7.05l-.71-.71M17.66 7.05l-.71.71M7.05 17.66l.71-.71M12 5a7 7 0 100 14A7 7 0 0012 5z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
            <Link href="/auth/signup" className="inline-flex items-center justify-center rounded-md bg-gradient-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="relative flex-1 flex items-center justify-center py-16 px-4">
        {/* Radial glow behind the card */}
        <div className="pointer-events-none absolute inset-0 bg-radial-fade" />

        <div className="relative w-full max-w-md">
          {/* Card */}
          <div className="rounded-2xl border border-border bg-card shadow-elevated p-8 space-y-6">

            {/* Logo + heading */}
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <Logo size={52} iconOnly />
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                Welcome Back
              </h1>
              <p className="text-sm text-muted-foreground">Sign in to your GR8BUX account</p>
            </div>

            {/* Error */}
            {(formError || error) && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                <p className="text-sm text-destructive">{formError || error}</p>
              </div>
            )}

            {/* Form */}
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
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled={isSubmitting}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium text-foreground">
                    Password
                  </label>
                  <Link href="/auth/forgot-password" className="text-xs text-primary hover:opacity-80 transition-opacity">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={formData.password}
                    onChange={handleInputChange}
                    disabled={isSubmitting}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center rounded-lg bg-gradient-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Signing In…' : 'Sign In'}
              </button>
            </form>

            {/* Switch link */}
            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link href="/auth/signup" className="font-medium text-primary hover:opacity-80 transition-opacity">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-brand-navy text-white/70 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <Logo size={28} className="text-white" />
          <div className="flex flex-wrap justify-center gap-6 text-sm">
            <a href="https://gr8bux.com" className="hover:text-white transition-colors">Home</a>
            <a href="https://gr8bux.com/features" className="hover:text-white transition-colors">Features</a>
            <a href="https://gr8bux.com/pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="https://gr8bux.com/about" className="hover:text-white transition-colors">About</a>
            <a href="https://gr8bux.com/contact" className="hover:text-white transition-colors">Contact</a>
          </div>
          <p className="text-xs text-white/40">© {new Date().getFullYear()} GR8BUX. Not financial advice.</p>
        </div>
      </footer>

    </div>
  );
}
