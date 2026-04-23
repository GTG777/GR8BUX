import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Layout } from '@/components/Layout';

/* ── Types ───────────────────────────────────────────────────────── */
type BillingCycle = 'monthly' | 'annual';

interface PlanFeature { text: string; included: boolean; highlight?: boolean }
interface Plan {
  id: string;
  name: string;
  badge?: string;
  monthly: number;
  annual: number;
  description: string;
  cta: string;
  ctaHref: string;
  color: string;
  features: PlanFeature[];
}

/* ── Plan definitions ────────────────────────────────────────────── */
const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    annual: 0,
    description: 'For casual traders getting started',
    cta: 'Get Started Free',
    ctaHref: '/auth/signup',
    color: 'border-gray-200 dark:border-zinc-700',
    features: [
      { text: 'Trade Journal (up to 50 trades)', included: true },
      { text: 'Basic P&L tracking', included: true },
      { text: 'Watchlist (up to 10 symbols)', included: true },
      { text: 'News feed', included: true },
      { text: 'Options Chain viewer', included: true },
      { text: 'Performance Analytics', included: false },
      { text: 'Stock Scanner', included: false },
      { text: 'AI Market Assistant', included: false },
      { text: 'LEAPS Coach', included: false },
      { text: 'Earnings Calendar', included: false },
      { text: 'Community Access', included: false },
      { text: 'Priority support', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    badge: 'Most Popular',
    monthly: 29,
    annual: 23,
    description: 'For active traders who want an edge',
    cta: 'Start 7-Day Free Trial',
    ctaHref: '/auth/signup?plan=pro',
    color: 'border-indigo-500',
    features: [
      { text: 'Unlimited trades', included: true, highlight: true },
      { text: 'Full P&L Analytics + Equity Curve', included: true, highlight: true },
      { text: 'Unlimited Watchlist', included: true },
      { text: 'Stock Scanner (all signals)', included: true, highlight: true },
      { text: 'Options Chain + Strategy Builder', included: true },
      { text: 'LEAPS Screener', included: true },
      { text: 'Earnings Calendar', included: true },
      { text: 'News feed (real-time)', included: true },
      { text: 'Community Access', included: true },
      { text: 'AI Market Assistant', included: false },
      { text: 'LEAPS AI Assistant', included: false },
      { text: 'Priority support', included: false },
    ],
  },
  {
    id: 'elite',
    name: 'Elite',
    monthly: 79,
    annual: 63,
    description: 'Full suite with AI-assisted insights',
    cta: 'Start 7-Day Free Trial',
    ctaHref: '/auth/signup?plan=elite',
    color: 'border-amber-500',
    features: [
      { text: 'Everything in Pro', included: true, highlight: true },
      { text: 'AI Market Assistant (daily reports)', included: true, highlight: true },
      { text: 'LEAPS AI Assistant', included: true, highlight: true },
      { text: 'Greeks & Risk Manager', included: true, highlight: true },
      { text: 'Custom alerts & notifications', included: true },
      { text: 'Multi-account portfolio view', included: true },
      { text: 'Options flow data', included: true },
      { text: 'Insider activity tracking', included: true },
      { text: 'Sector rotation signals', included: true },
      { text: 'Advanced VWAP / Technical', included: true },
      { text: 'CSV export', included: true },
      { text: 'Priority support', included: true, highlight: true },
    ],
  },
];

/* ── FAQ data ────────────────────────────────────────────────────── */
const FAQ = [
  {
    q: 'Can I cancel at any time?',
    a: 'Yes — cancel any time from your billing settings. You keep access through the end of your billing period.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Pro and Elite plans both include a 7-day free trial. No credit card required to sign up.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'All major credit/debit cards (Visa, Mastercard, Amex, Discover) via Stripe. No crypto or PayPal at this time.',
  },
  {
    q: 'Can I switch plans?',
    a: 'Yes — upgrade or downgrade at any time. Upgrades are prorated immediately; downgrades take effect at your next billing date.',
  },
  {
    q: 'Is my trade data safe?',
    a: 'Your data is encrypted at rest and in transit. We never sell or share your trading data. You can export or delete it at any time.',
  },
];

/* ── Check icon ─────────────────────────────────────────────────── */
function CheckIcon({ on, highlight }: { on: boolean; highlight?: boolean }) {
  if (!on) return <span className="w-5 h-5 flex items-center justify-center text-gray-300 dark:text-zinc-700 text-lg shrink-0">–</span>;
  return (
    <svg className={`w-5 h-5 shrink-0 ${highlight ? 'text-indigo-500 dark:text-indigo-400' : 'text-emerald-500'}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

/* ── FAQItem ─────────────────────────────────────────────────────── */
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 dark:border-zinc-800">
      <button onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center py-4 text-left gap-4">
        <span className="font-semibold text-gray-800 dark:text-zinc-200 text-sm">{q}</span>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {open && <p className="pb-4 text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">{a}</p>}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */
export default function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>('annual');

  return (
    <Layout title="Pricing">
      <div className="max-w-7xl mx-auto pb-16 space-y-16">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <div className="text-center pt-4">
          <span className="inline-block px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-bold rounded-full uppercase tracking-widest mb-4">
            Simple Pricing
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
            Trade smarter. Not harder.
          </h1>
          <p className="mt-3 text-base text-gray-500 dark:text-zinc-400 max-w-xl mx-auto">
            Everything you need to journal, analyze, and improve your trading — in one platform.
          </p>

          {/* Billing toggle */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <span className={`text-sm font-semibold ${cycle === 'monthly' ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-zinc-500'}`}>Monthly</span>
            <button
              onClick={() => setCycle(cycle === 'monthly' ? 'annual' : 'monthly')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${cycle === 'annual' ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-zinc-600'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${cycle === 'annual' ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className={`text-sm font-semibold ${cycle === 'annual' ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-zinc-500'}`}>
              Annual
              <span className="ml-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">Save 20%</span>
            </span>
          </div>
        </div>

        {/* ── Plan cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const price = cycle === 'annual' ? plan.annual : plan.monthly;
            const isPopular = plan.badge === 'Most Popular';
            const isElite = plan.id === 'elite';

            return (
              <div key={plan.id}
                className={`relative rounded-2xl border-2 ${plan.color} bg-white dark:bg-zinc-900 p-6 flex flex-col shadow-sm ${isPopular ? 'shadow-indigo-100 dark:shadow-indigo-900/20 shadow-lg' : ''}`}>

                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest whitespace-nowrap shadow">
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Plan header */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className={`text-xl font-extrabold ${isElite ? 'text-amber-600 dark:text-amber-400' : isPopular ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>
                      {plan.name}
                    </h2>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">{plan.description}</p>
                </div>

                {/* Price */}
                <div className="mb-5">
                  {price === 0 ? (
                    <p className="text-4xl font-extrabold text-gray-900 dark:text-white">Free</p>
                  ) : (
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-extrabold text-gray-900 dark:text-white">${price}</span>
                      <span className="text-gray-400 dark:text-zinc-500 text-sm mb-1.5">/ mo</span>
                    </div>
                  )}
                  {cycle === 'annual' && price > 0 && (
                    <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
                      Billed ${plan.annual * 12}/year · saves ${(plan.monthly - plan.annual) * 12}/yr
                    </p>
                  )}
                </div>

                {/* CTA */}
                <Link href={plan.ctaHref}
                  className={`block text-center text-sm font-bold py-2.5 rounded-xl transition-colors mb-6 ${
                    isPopular
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                      : isElite
                      ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-zinc-300'
                  }`}>
                  {plan.cta}
                </Link>

                {/* Features */}
                <ul className="space-y-2.5 flex-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckIcon on={f.included} highlight={f.highlight} />
                      <span className={`text-sm ${f.included ? f.highlight ? 'text-gray-800 dark:text-zinc-200 font-medium' : 'text-gray-600 dark:text-zinc-400' : 'text-gray-300 dark:text-zinc-600 line-through'}`}>
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* ── Trust strip ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          {[
            { icon: '🔒', label: 'Bank-grade security', sub: '256-bit encryption' },
            { icon: '💳', label: 'Cancel anytime', sub: 'No lock-in contracts' },
            { icon: '🌐', label: 'Access anywhere', sub: 'Web & mobile browser' },
            { icon: '🤝', label: 'Your data, your rules', sub: 'Export or delete anytime' },
          ].map((t) => (
            <div key={t.label} className="rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 p-4">
              <div className="text-2xl mb-1">{t.icon}</div>
              <p className="text-xs font-bold text-gray-700 dark:text-zinc-300">{t.label}</p>
              <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-0.5">{t.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Feature comparison table ──────────────────────────── */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Full Feature Comparison</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-100 dark:border-zinc-800">
                  <th className="text-left py-3 px-4 font-semibold text-gray-500 dark:text-zinc-400">Feature</th>
                  {PLANS.map((p) => (
                    <th key={p.id} className="text-center py-3 px-4 font-bold text-gray-700 dark:text-zinc-300">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Trade Journal', free: 'Up to 50', pro: 'Unlimited', elite: 'Unlimited' },
                  { feature: 'Watchlist', free: '10 symbols', pro: 'Unlimited', elite: 'Unlimited' },
                  { feature: 'Performance Analytics', free: false, pro: true, elite: true },
                  { feature: 'Stock Scanner', free: false, pro: 'All signals', elite: 'All signals' },
                  { feature: 'Options Chain', free: 'View only', pro: 'Full + builder', elite: 'Full + builder' },
                  { feature: 'LEAPS Screener', free: false, pro: true, elite: true },
                  { feature: 'Earnings Calendar', free: false, pro: true, elite: true },
                  { feature: 'AI Market Assistant', free: false, pro: false, elite: true },
                  { feature: 'LEAPS AI Assistant', free: false, pro: false, elite: true },
                  { feature: 'Greeks & Risk Manager', free: false, pro: false, elite: true },
                  { feature: 'Sector Rotation', free: false, pro: false, elite: true },
                  { feature: 'Insider Activity', free: false, pro: false, elite: true },
                  { feature: 'CSV Export', free: false, pro: false, elite: true },
                  { feature: 'Priority Support', free: false, pro: false, elite: true },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-zinc-800/50 hover:bg-gray-50/50 dark:hover:bg-zinc-800/20">
                    <td className="py-3 px-4 font-medium text-gray-700 dark:text-zinc-300">{row.feature}</td>
                    {(['free', 'pro', 'elite'] as const).map((plan) => {
                      const val = row[plan];
                      return (
                        <td key={plan} className="py-3 px-4 text-center">
                          {val === true ? (
                            <CheckIcon on={true} />
                          ) : val === false ? (
                            <span className="text-gray-300 dark:text-zinc-700">–</span>
                          ) : (
                            <span className="text-xs text-gray-600 dark:text-zinc-400 font-medium">{val}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── FAQ ──────────────────────────────────────────────── */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Frequently Asked Questions</h2>
          {FAQ.map((item) => <FAQItem key={item.q} q={item.q} a={item.a} />)}
        </div>

        {/* ── Bottom CTA ───────────────────────────────────────── */}
        <div className="text-center rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 p-10">
          <h2 className="text-2xl font-extrabold text-white mb-2">Start your free trial today</h2>
          <p className="text-indigo-200 text-sm mb-6">No credit card required. Cancel anytime.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/auth/signup?plan=pro"
              className="px-8 py-3 bg-white text-indigo-700 font-bold rounded-xl hover:bg-indigo-50 transition-colors shadow text-sm">
              Try Pro Free →
            </Link>
            <Link href="/auth/signup"
              className="px-8 py-3 bg-indigo-500/40 hover:bg-indigo-500/60 text-white font-semibold rounded-xl transition-colors text-sm border border-indigo-400/40">
              Start with Free
            </Link>
          </div>
        </div>

      </div>
    </Layout>
  );
}
