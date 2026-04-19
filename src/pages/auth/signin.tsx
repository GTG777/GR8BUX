'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';

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
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* ── Navbar ── */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center">
          <Link href="/"><img src="/logo-full.png" alt="GR8BUX" className="h-[94px] w-auto" /></Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/features" className="text-sm text-gray-600 hover:text-gray-900 font-medium transition">Features</Link>
            <Link href="/pricing" className="text-sm text-gray-600 hover:text-gray-900 font-medium transition">Pricing</Link>
          </nav>
          <Link href="/auth/signup" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition">Create Account</Link>
        </div>
      </header>

      {/* ── Form ── */}
      <div className="flex-1 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full space-y-8 bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo-full.png" alt="GR8BUX" className="h-[189px] w-auto" />
          </div>
          <h2 className="text-3xl font-extrabold text-white">Welcome Back</h2>
          <p className="mt-2 text-sm text-zinc-400">Sign in to your GR8BUX account</p>
        </div>

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {/* Error Message */}
          {(formError || error) && (
            <div className="rounded-lg bg-red-900/30 border border-red-700 p-4">
              <p className="text-sm text-red-400">{formError || error}</p>
            </div>
          )}

          {/* Email Input */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
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
              className="mt-1 block w-full px-3 py-2 bg-zinc-800 border border-zinc-700 text-white rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="you@example.com"
            />
          </div>

          {/* Password Input */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
                Password
              </label>
              <Link href="/auth/forgot-password" className="text-xs text-blue-400 hover:text-blue-300">
                Forgot password?
              </Link>
            </div>
            <div className="mt-1 relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={formData.password}
                onChange={handleInputChange}
                disabled={isSubmitting}
                className="block w-full px-3 py-2 bg-zinc-800 border border-zinc-700 text-white rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2 text-zinc-400 hover:text-zinc-200"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex justify-center py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        {/* Sign Up Link */}
        <div className="text-center">
          <p className="text-sm text-zinc-400">
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="font-medium text-blue-400 hover:text-blue-300">
              Create one
            </Link>
          </p>
        </div>
      </div>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 py-6 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex gap-6 text-sm text-zinc-500">
            <Link href="/" className="hover:text-zinc-300 transition">Home</Link>
            <Link href="/features" className="hover:text-zinc-300 transition">Features</Link>
            <Link href="/pricing" className="hover:text-zinc-300 transition">Pricing</Link>
            <Link href="/auth/signup" className="hover:text-zinc-300 transition">Sign Up</Link>
          </div>
          <p className="text-xs text-zinc-700">© {new Date().getFullYear()} GR8BUX. For informational use only. Not financial advice.</p>
        </div>
      </footer>

    </div>
  );
}
