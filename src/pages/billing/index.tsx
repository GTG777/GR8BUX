import React, { useState } from 'react';
import Link from 'next/link';
import { Layout } from '@/components/Layout';
import { useAuthStore } from '@/store/authStore';

// ── Mock plan data ────────────────────────────────────────────────────────
const PLANS = {
  free:  { name: 'Free',  price: 0,   color: 'gray'   },
  pro:   { name: 'Pro',   price: 29,  color: 'indigo' },
  elite: { name: 'Elite', price: 79,  color: 'violet' },
} as const;
type PlanKey = keyof typeof PLANS;

// ── Mock invoice data ─────────────────────────────────────────────────────
const MOCK_INVOICES = [
  { id: 'INV-2025-006', date: 'Jun 1, 2025',  amount: 29, status: 'Paid',  plan: 'Pro' },
  { id: 'INV-2025-005', date: 'May 1, 2025',  amount: 29, status: 'Paid',  plan: 'Pro' },
  { id: 'INV-2025-004', date: 'Apr 1, 2025',  amount: 29, status: 'Paid',  plan: 'Pro' },
  { id: 'INV-2025-003', date: 'Mar 1, 2025',  amount: 29, status: 'Paid',  plan: 'Pro' },
  { id: 'INV-2025-002', date: 'Feb 1, 2025',  amount: 29, status: 'Paid',  plan: 'Pro' },
  { id: 'INV-2025-001', date: 'Jan 1, 2025',  amount: 0,  status: 'Free',  plan: 'Free' },
];

// ── Usage meter ───────────────────────────────────────────────────────────
function UsageMeter({ label, used, limit, unit }: { label: string; used: number; limit: number | null; unit: string }) {
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : 'bg-indigo-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-700 dark:text-zinc-300 font-medium">{label}</span>
        <span className="text-gray-500 dark:text-zinc-500">
          {used.toLocaleString()} / {limit ? limit.toLocaleString() : '∞'} {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 dark:bg-zinc-800">
        {limit ? (
          <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
        ) : (
          <div className="h-full rounded-full bg-indigo-500/30" style={{ width: '100%' }} />
        )}
      </div>
    </div>
  );
}

// ── Plan card ─────────────────────────────────────────────────────────────
function PlanCard({ planKey, currentPlan, onUpgrade }: { planKey: PlanKey; currentPlan: PlanKey; onUpgrade: (p: PlanKey) => void }) {
  const plan = PLANS[planKey];
  const isCurrent = planKey === currentPlan;
  const isDowngrade = ['free', 'pro', 'elite'].indexOf(planKey) < ['free', 'pro', 'elite'].indexOf(currentPlan);
  const colorMap: Record<string, string> = {
    gray:   'border-gray-200 dark:border-zinc-700',
    indigo: 'border-indigo-300 dark:border-indigo-500/50',
    violet: 'border-violet-300 dark:border-violet-500/50',
  };
  const badgeMap: Record<string, string> = {
    gray:   'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400',
    indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  };

  return (
    <div className={`rounded-xl border-2 p-5 flex flex-col gap-3 transition-all ${colorMap[plan.color]} ${isCurrent ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : 'bg-white dark:bg-zinc-900'}`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeMap[plan.color]}`}>{plan.name}</span>
        {isCurrent && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">✓ Current plan</span>}
      </div>
      <div>
        <span className="text-2xl font-bold text-gray-900 dark:text-white">${plan.price}</span>
        {plan.price > 0 && <span className="text-sm text-gray-500 dark:text-zinc-500">/mo</span>}
      </div>
      {!isCurrent && (
        <button
          onClick={() => onUpgrade(planKey)}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
            isDowngrade
              ? 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          {isDowngrade ? 'Downgrade' : 'Upgrade →'}
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function BillingPage() {
  const { user } = useAuthStore();
  const [currentPlan] = useState<PlanKey>('pro');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const handleUpgrade = (planKey: PlanKey) => {
    // In production this would redirect to Stripe Checkout
    window.location.href = `/pricing`;
  };

  const nextBillingDate = 'July 1, 2025';
  const cardLast4 = '4242';

  return (
    <Layout title="Billing">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Billing &amp; Subscription</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">Manage your plan, usage, and payment details</p>
        </div>

        {/* Current plan summary */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700/60 shadow-sm p-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-zinc-500 font-medium uppercase tracking-wide mb-1">Current Plan</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-gray-900 dark:text-white">{PLANS[currentPlan].name}</span>
                <span className="text-xs bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/30">
                  Active
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                ${PLANS[currentPlan].price}/month · Next billing: <strong className="text-gray-700 dark:text-zinc-200">{nextBillingDate}</strong>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-zinc-500 mb-1">Payment method</p>
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-zinc-300">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                •••• {cardLast4}
              </div>
              <button className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1">Update card</button>
            </div>
          </div>
        </div>

        {/* Usage meters */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-zinc-700/40">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-zinc-100">📈 Usage This Month</h2>
          </div>
          <div className="p-5 space-y-4">
            <UsageMeter label="Trades Logged"     used={47}   limit={null} unit="trades" />
            <UsageMeter label="AI Coach Queries" used={23}   limit={50}   unit="queries" />
            <UsageMeter label="Watchlist Symbols"  used={18}   limit={50}   unit="symbols" />
            <UsageMeter label="Options Scans"      used={312}  limit={null} unit="scans" />
          </div>
        </div>

        {/* Plan comparison */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-zinc-700/40">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-zinc-100">💳 Change Plan</h2>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(['free', 'pro', 'elite'] as PlanKey[]).map((p) => (
              <PlanCard key={p} planKey={p} currentPlan={currentPlan} onUpgrade={handleUpgrade} />
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-zinc-600 px-5 pb-4 text-center">
            Upgrades take effect immediately. Downgrades apply at next billing cycle. See full feature comparison on the{' '}
            <Link href="/pricing" className="text-indigo-500 hover:underline">Pricing page</Link>.
          </p>
        </div>

        {/* Invoice history */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-zinc-700/40">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-zinc-100">🧾 Invoice History</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-zinc-700/30">
            {MOCK_INVOICES.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-gray-50 dark:hover:bg-zinc-800/30 transition-colors">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs text-gray-400 dark:text-zinc-600 w-28">{inv.id}</span>
                  <span className="text-gray-700 dark:text-zinc-300">{inv.date}</span>
                  <span className="text-xs text-gray-500 dark:text-zinc-500">{inv.plan}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {inv.amount > 0 ? `$${inv.amount}.00` : '—'}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    inv.status === 'Paid'
                      ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                      : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-500'
                  }`}>
                    {inv.status}
                  </span>
                  <button className="text-xs text-gray-400 dark:text-zinc-600 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                    PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-red-200 dark:border-red-500/20 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-red-100 dark:border-red-500/20">
            <h2 className="text-sm font-semibold text-red-600 dark:text-red-400">⚠️ Cancel Subscription</h2>
          </div>
          <div className="p-5">
            {!showCancelConfirm ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-zinc-400">
                  Your access continues until the end of your billing period.
                </p>
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium border border-red-200 dark:border-red-500/30 px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  Cancel plan
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-700 dark:text-zinc-300 font-medium">
                  Are you sure? You will lose access to Pro features on {nextBillingDate}.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Keep my plan
                  </button>
                  <button
                    onClick={() => { setShowCancelConfirm(false); }}
                    className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
                  >
                    Yes, cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </Layout>
  );
}
