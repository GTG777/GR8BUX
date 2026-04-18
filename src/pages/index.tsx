import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/router';
import Link from 'next/link';

const NAV_LINKS = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
];

const FEATURE_SECTIONS = [
  {
    tag: 'Trade Journal',
    headline: 'Log every trade. Know every edge.',
    body: 'Track stocks and multi-leg options with automatic Greeks calculation (Delta, Gamma, Theta, Vega, IV). Review your closed P&L, win rate, equity curve, and performance broken down by strategy — all in one place.',
    icon: '📒',
    bullets: ['Multi-leg options support', 'Auto-calculated Greeks', 'P&L equity curve', 'Strategy-level performance', 'Cloud sync across devices'],
    cta: { label: 'Start journaling free', href: '/auth/signup' },
    reverse: false,
  },
  {
    tag: 'Options Toolset',
    headline: 'A full options lab at your fingertips.',
    body: 'Run Black-Scholes pricing on 12 strategy types, screen for bull-put spreads, bear-calls, and iron condors with live PoP/EV/IVR data, or build LEAPS positions with a visual P&L curve builder and income projector.',
    icon: '🎯',
    bullets: ['Black-Scholes calculator', 'Options screener (PoP, EV, IVR, Max Pain)', 'LEAPS screener + PMCC projector', '30+ strategy reference library', 'GEX & Put/Call ratio'],
    cta: { label: 'Explore options tools', href: '/features' },
    reverse: true,
  },
  {
    tag: 'Market Research',
    headline: 'Stay ahead of the market, every day.',
    body: 'Scan stocks using EMA, RSI, TSI, MACD, Bollinger Bands and more. Track earnings with IV strategy badges. Monitor sector news, community sentiment from Reddit & StockTwits, and crypto all in one dashboard.',
    icon: '🔬',
    bullets: ['Stock scanner (10+ indicators)', 'Earnings calendar with IV strategies', 'Sector & symbol news feed', 'Reddit + StockTwits sentiment', 'Crypto overview'],
    cta: { label: 'See all features', href: '/features' },
    reverse: false,
  },
  {
    tag: 'AI Assistant',
    headline: 'Smarter research, not financial advice.',
    body: 'The AI Assistant helps you explore LEAPS candidates and market signals by surfacing data-driven setups. It presents scores, rationale, and risk context — so you stay in control of every decision. For informational use only.',
    icon: '🤖',
    bullets: ['LEAPS candidate scoring & rationale', 'Market setup summaries', 'DTE / delta / IV context', 'Verdict badges (Strong Setup → Avoid)', 'Elite plan feature'],
    cta: { label: 'See Elite plan', href: '/pricing' },
    reverse: true,
  },
];

const FAQS = [
  { q: 'Is GR8BUX a financial advisor?', a: 'No. GR8BUX is a trading tools and journal platform. All data, analytics, and AI Assistant outputs are for informational purposes only. Always do your own research and consult a licensed financial advisor before trading.' },
  { q: 'What does the Free plan include?', a: 'The Free plan includes up to 50 trade journal entries, basic P&L tracking, a 10-symbol watchlist, news feed, and options chain viewer — no credit card required.' },
  { q: 'Can I track multi-leg options strategies?', a: 'Yes. The trade journal supports multi-leg options entries (spreads, condors, straddles, etc.) with automatic Greeks calculation per leg.' },
  { q: 'What is the LEAPS AI Assistant?', a: 'The LEAPS AI Assistant is an Elite-tier feature that scores LEAPS candidates based on delta, DTE, IV, and fundamental filters. It provides a rationale and verdict for each setup — for research purposes only.' },
  { q: 'Is there a free trial on paid plans?', a: 'Yes. Pro and Elite plans include a 7-day free trial. No charge until the trial ends.' },
  { q: 'Can I export my trade data?', a: 'CSV export is available on the Elite plan.' },
];

export default function Home() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !isLoading && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [mounted, isLoading, isAuthenticated, router]);

  if (!mounted || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 bg-gray-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center">
          <img src="/logo-full.png" alt="GR8BUX" className="h-12 w-auto" />
          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(l => (
              <Link key={l.href} href={l.href} className="text-sm text-zinc-400 hover:text-white transition">{l.label}</Link>
            ))}
          </nav>
          <div className="flex gap-3">
            <Link href="/auth/signin" className="px-4 py-2 text-sm text-zinc-300 hover:text-white font-medium transition">Sign In</Link>
            <Link href="/auth/signup" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition">Get Started Free</Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-24 pb-32 px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 via-indigo-900/20 to-gray-950 pointer-events-none" />
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/40 border border-blue-700/50 text-blue-400 text-xs font-medium mb-6">
            ✦ Free plan available — no credit card required
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            The trading platform<br />
            <span className="bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">built for serious traders</span>
          </h1>
          <p className="text-xl text-zinc-400 mb-10 max-w-2xl mx-auto">
            Trade journal, options toolset, stock scanner, earnings calendar, market research, and AI-powered setup summaries — all in one place.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/signup" className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-lg transition shadow-lg shadow-blue-900/40">
              Create Free Account
            </Link>
            <Link href="/features" className="px-8 py-4 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-lg transition border border-white/10">
              Explore Features →
            </Link>
          </div>
          <p className="mt-6 text-xs text-zinc-600">For informational purposes only. Not financial advice.</p>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section className="border-y border-white/10 bg-white/5">
        <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: '30+', label: 'Options Strategies' },
            { value: '10+', label: 'Technical Indicators' },
            { value: '3', label: 'Plan Tiers' },
            { value: '100%', label: 'Cloud Synced' },
          ].map(s => (
            <div key={s.label}>
              <div className="text-3xl font-extrabold text-white">{s.value}</div>
              <div className="text-sm text-zinc-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature Sections ── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto space-y-32">
          {FEATURE_SECTIONS.map((f, i) => (
            <div key={i} className={`flex flex-col ${f.reverse ? 'md:flex-row-reverse' : 'md:flex-row'} gap-12 items-center`}>
              {/* Visual card */}
              <div className="flex-1 bg-gradient-to-br from-zinc-900 to-zinc-800 border border-white/10 rounded-2xl p-10 flex flex-col items-center justify-center min-h-[260px] shadow-xl">
                <div className="text-7xl mb-4">{f.icon}</div>
                <div className="text-lg font-bold text-white">{f.tag}</div>
              </div>
              {/* Text */}
              <div className="flex-1 space-y-5">
                <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-blue-900/40 text-blue-400 border border-blue-700/40 uppercase tracking-widest">{f.tag}</span>
                <h2 className="text-3xl font-extrabold text-white leading-snug">{f.headline}</h2>
                <p className="text-zinc-400 leading-relaxed">{f.body}</p>
                <ul className="space-y-2">
                  {f.bullets.map((b, j) => (
                    <li key={j} className="flex items-center gap-3 text-zinc-300 text-sm">
                      <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold shrink-0">✓</span>
                      {b}
                    </li>
                  ))}
                </ul>
                <Link href={f.cta.href} className="inline-flex items-center gap-2 mt-2 text-sm text-blue-400 hover:text-blue-300 font-semibold transition">
                  {f.cta.label} →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing teaser ── */}
      <section className="py-24 px-6 bg-white/5 border-y border-white/10">
        <div className="max-w-6xl mx-auto text-center mb-12">
          <h2 className="text-4xl font-extrabold text-white mb-3">Simple, transparent pricing</h2>
          <p className="text-zinc-400">Start free. Upgrade when you&apos;re ready.</p>
        </div>
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              name: 'Free', price: '$0', period: 'forever', color: 'border-zinc-700',
              features: ['50 trade journal entries', 'Basic P&L tracking', '10-symbol watchlist', 'News feed', 'Options chain viewer'],
              cta: 'Get Started Free', href: '/auth/signup', highlight: false,
            },
            {
              name: 'Pro', price: '$29', period: '/mo', badge: 'Most Popular', color: 'border-indigo-500',
              features: ['Unlimited trades', 'Full analytics + equity curve', 'Stock Scanner', 'LEAPS Screener', 'Earnings Calendar', 'Community access'],
              cta: '7-Day Free Trial', href: '/auth/signup?plan=pro', highlight: true,
            },
            {
              name: 'Elite', price: '$79', period: '/mo', color: 'border-zinc-600',
              features: ['Everything in Pro', 'AI Assistant (LEAPS + Market)', 'Options flow & insider activity', 'VWAP & sector rotation', 'CSV export', 'Priority support'],
              cta: '7-Day Free Trial', href: '/auth/signup?plan=elite', highlight: false,
            },
          ].map((plan, i) => (
            <div key={i} className={`relative rounded-2xl border-2 ${plan.color} bg-zinc-900 p-7 flex flex-col ${plan.highlight ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-gray-950' : ''}`}>
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full">{plan.badge}</span>
              )}
              <div className="mb-4">
                <div className="text-lg font-bold text-white">{plan.name}</div>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                  <span className="text-zinc-500 text-sm">{plan.period}</span>
                </div>
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm text-zinc-300">
                    <span className="text-green-400 shrink-0">✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link href={plan.href} className={`block text-center py-2.5 rounded-xl text-sm font-bold transition ${plan.highlight ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-white/10 hover:bg-white/15 text-white'}`}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-zinc-600 mt-6">All prices in USD. Annual billing saves up to 20%. See <Link href="/pricing" className="text-blue-500 hover:underline">full pricing details</Link>.</p>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-extrabold text-white text-center mb-12">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="border border-white/10 rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex justify-between items-center px-6 py-4 text-left text-white font-medium hover:bg-white/5 transition"
                >
                  <span>{faq.q}</span>
                  <span className="text-zinc-500 text-xl ml-4">{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-zinc-400 text-sm leading-relaxed border-t border-white/10 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 px-6 bg-gradient-to-br from-blue-900/30 to-indigo-900/20 border-t border-white/10">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-extrabold text-white mb-4">Ready to trade smarter?</h2>
          <p className="text-zinc-400 mb-8">Join GR8BUX free. Upgrade only when you need more.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/signup" className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-lg transition shadow-lg shadow-blue-900/40">
              Create Free Account
            </Link>
            <Link href="/pricing" className="px-8 py-4 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-lg transition border border-white/10">
              View Pricing
            </Link>
          </div>
          <p className="mt-6 text-xs text-zinc-600">GR8BUX is for informational purposes only and does not constitute financial advice.</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <img src="/logo-full.png" alt="GR8BUX" className="h-10 w-auto opacity-80" />
          <div className="flex gap-6 text-sm text-zinc-500">
            <Link href="/features" className="hover:text-zinc-300 transition">Features</Link>
            <Link href="/pricing" className="hover:text-zinc-300 transition">Pricing</Link>
            <Link href="/auth/signin" className="hover:text-zinc-300 transition">Sign In</Link>
            <Link href="/auth/signup" className="hover:text-zinc-300 transition">Sign Up</Link>
          </div>
          <p className="text-xs text-zinc-700 text-center md:text-right max-w-xs">
            © {new Date().getFullYear()} GR8BUX. For informational use only. Not financial advice.
          </p>
        </div>
      </footer>

    </div>
  );
}
