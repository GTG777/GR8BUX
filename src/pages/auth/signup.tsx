'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';

export default function SignUpPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, handleSignUp, error, clearError } = useAuthStore();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
  });

  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  const validateForm = (): boolean => {
    if (!formData.email || !formData.password || !formData.displayName) {
      setFormError('All fields are required');
      return false;
    }

    if (formData.password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return false;
    }

    const hasLetter = /[a-zA-Z]/.test(formData.password);
    const hasNumber = /[0-9]/.test(formData.password);
    if (!hasLetter || !hasNumber) {
      setFormError('Password must contain at least one letter and one number');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match');
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
    const success = await handleSignUp({
      email: formData.email,
      password: formData.password,
      displayName: formData.displayName,
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
          <Link href="/"><img src="/logo-full.png" alt="GR8BUX" className="h-12 w-auto" /></Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/features" className="text-sm text-gray-600 hover:text-gray-900 font-medium transition">Features</Link>
            <Link href="/pricing" className="text-sm text-gray-600 hover:text-gray-900 font-medium transition">Pricing</Link>
          </nav>
          <Link href="/auth/signin" className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 font-medium border border-gray-300 rounded-lg transition">Sign In</Link>
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
          <h2 className="text-3xl font-extrabold text-white">Create Account</h2>
          <p className="mt-2 text-sm text-zinc-400">Join GR8BUX and start tracking your trades</p>
        </div>

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {/* Error Message */}
          {(formError || error) && (
            <div className="rounded-lg bg-red-900/30 border border-red-700 p-4">
              <p className="text-sm text-red-400">{formError || error}</p>
            </div>
          )}

          {/* Display Name Input */}
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-zinc-300">
              Display Name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="name"
              required
              value={formData.displayName}
              onChange={handleInputChange}
              disabled={isSubmitting}
              className="mt-1 block w-full px-3 py-2 bg-zinc-800 border border-zinc-700 text-white rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="John Trader"
            />
          </div>

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
            <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={formData.password}
              onChange={handleInputChange}
              disabled={isSubmitting}
              className="mt-1 block w-full px-3 py-2 bg-zinc-800 border border-zinc-700 text-white rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="••••••••"
            />
            <p className="mt-1 text-xs text-zinc-500">At least 8 characters with a letter and number</p>
          </div>

          {/* Confirm Password Input */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-300">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={formData.confirmPassword}
              onChange={handleInputChange}
              disabled={isSubmitting}
              className="mt-1 block w-full px-3 py-2 bg-zinc-800 border border-zinc-700 text-white rounded-lg placeholder-zinc-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="••••••••"
            />
          </div>

          {/* Note about role */}
          <div className="rounded-lg bg-blue-900/30 border border-blue-700/50 p-3">
            <p className="text-xs text-blue-400">
              You&apos;ll be assigned a User role by default. Managers and Admins are assigned separately.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex justify-center py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isSubmitting ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>

        {/* Sign In Link */}
        <div className="text-center">
          <p className="text-sm text-zinc-400">
            Already have an account?{' '}
            <Link href="/auth/signin" className="font-medium text-blue-400 hover:text-blue-300">
              Sign In
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
            <Link href="/auth/signin" className="hover:text-zinc-300 transition">Sign In</Link>
          </div>
          <p className="text-xs text-zinc-700">© {new Date().getFullYear()} GR8BUX. For informational use only. Not financial advice.</p>
        </div>
      </footer>

    </div>
  );
}
