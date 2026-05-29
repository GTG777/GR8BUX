import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Layout } from '@/components/Layout';
import { useAuthStore } from '@/store/authStore';
import { usePlanStore } from '@/store/planStore';
import { getSupabaseClient } from '@/lib/supabase';
import { PLAN_DISPLAY, PLAN_LIMITS, type PlanId } from '@/lib/planLimits';
import type { InvoiceItem } from '@/pages/api/billing/invoices';

// ── Helpers ────────────────────────────────────────────────────────────────
async function getToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// ── Usage meter ────────────────────────────────────────────────────────────
function UsageMeter({ label, used, limit, unit }: { label: string; used: number; limit: number; unit: string }) {
  const isUnlimited = limit === Infinity;
  const pct = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
  const color = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-yellow-500' : 'bg-indigo-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-700 dark:text-zinc-300 font-medium">{label}</span>
        <span className="text-gray-500 dark:text-zinc-500">
          {used.toLocaleString()} / {isUnlimited ? '∞' : limit.toLocaleString()} {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 dark:bg-zinc-800">
        {isUnlimited
          ? <div className="h-full rounded-full bg-indigo-500/30" style={{ width: '100%' }} />
          : <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
        }
      </div>
    </div>
  );
}

// ── Plan card ──────────────────────────────────────────────────────────────
function PlanCard({ planKey, currentPlan, onSelect, loading }: {
  planKey: PlanId;
  currentPlan: PlanId;
  onSelect: (p: PlanId) => void;
  loading: PlanId | null;
}) {
  const plan = PLAN_DISPLAY[planKey];
  const isCurrent = planKey === currentPlan;
  const isDowngrade = (['free', 'starter', 'pro', 'elite'] as PlanId[]).indexOf(planKey) < (['free', 'starter', 'pro', 'elite'] as PlanId[]).indexOf(currentPlan);

  const colorMap: Record<string, { border: string; btn: string }> = {
    gray:   { border: 'border-gray-200 dark:border-zinc-700',         btn: 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700' },
    blue:   { border: 'border-blue-300 dark:border-blue-600/50',      btn: 'bg-blue-600 hover:bg-blue-500 text-white' },
    indigo: { border: 'border-indigo-300 dark:border-indigo-500/50',  btn: 'bg-indigo-600 hover:bg-indigo-500 text-white' },
    amber:  { border: 'border-amber-300 dark:border-amber-500/50',    btn: 'bg-amber-500 hover:bg-amber-400 text-white' },
  };
  const c = colorMap[plan.color] ?? colorMap.indigo;

  return (
    <div className={`rounded-xl border-2 p-5 flex flex-col gap-3 transition-all ${c.border} ${isCurrent ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : 'bg-white dark:bg-zinc-900'}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-800 dark:text-zinc-200">{plan.name}</span>
        {isCurrent && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">✓ Current</span>}
      </div>
      <div>
        <span className="text-2xl font-bold text-gray-900 dark:text-white">
          {plan.monthly === 0 ? 'Free' : `$${plan.monthly}`}
        </span>
        {plan.monthly > 0 && <span className="text-sm text-gray-500 dark:text-zinc-500">/mo</span>}
      </div>
      {!isCurrent && (
        <button
          onClick={() => onSelect(planKey)}
          disabled={loading === planKey}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
            isDowngrade
              ? 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
              : c.btn
          }`}
        >
          {loading === planKey ? 'Redirecting…' : isDowngrade ? 'Downgrade' : 'Upgrade →'}
        </button>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function BillingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { planId, status, billingCycle, currentPeriodEnd, cancelAtPeriodEnd, limits, usage, fetchPlan } = usePlanStore();

  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState<PlanId | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/auth/signin'); return; }
    // Refresh plan data in case it changed (e.g. after Stripe redirect)
    getToken().then((token) => { if (token) fetchPlan(token); });
    // Load invoices
    getToken().then(async (token) => {
      if (!token) return;
      setInvoicesLoading(true);
      try {
        const res = await fetch('/api/billing/invoices', { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        if (json.success) setInvoices(json.data ?? []);
      } finally {
        setInvoicesLoading(false);
      }
    });
  }, [isAuthenticated, router, fetchPlan]);

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const token = await getToken();
      if (!token) { router.push('/auth/signin'); return; }
      const res = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success && json.data?.url) {
        window.location.href = json.data.url;
      } else {
        // No Stripe customer yet — redirect to pricing
        router.push('/pricing');
      }
    } finally {
      setPortalLoading(false);
    }
  };

  const handlePlanSelect = async (targetPlan: PlanId) => {
    if (targetPlan === 'free') { handleManageBilling(); return; }
    setPlanLoading(targetPlan);
    try {
      const token = await getToken();
      if (!token) { router.push('/auth/signin'); return; }
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId: targetPlan, cycle: billingCycle ?? 'monthly' }),
      });
      const json = await res.json();
      if (json.success && json.data?.url) {
        window.location.href = json.data.url;
      }
    } finally {
      setPlanLoading(null);
    }
  };

  const planDisplay = PLAN_DISPLAY[planId];
  const nextBilling = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const statusBadge =
    status === 'active'    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30' :
    status === 'trialing'  ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30' :
    status === 'past_due'  ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30' :
    status === 'canceled'  ? 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 border-gray-200 dark:border-zinc-700' :
    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-700/40';

  const statusLabel =
    status === 'active'   ? 'Active' :
    status === 'trialing' ? 'Trial' :
    status === 'past_due' ? 'Past Due' :
    status === 'canceled' ? 'Canceled' : status;

  return (
    <Layout title="Billing">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Billing &amp; Subscription</h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">Manage your plan, usage, and payment details</p>
          </div>
          {planId !== 'free' && (
            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {portalLoading ? 'Opening…' : 'Manage billing →'}
            </button>
          )}
        </div>

        {/* Current plan summary */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700/60 shadow-sm p-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-zinc-500 font-medium uppercase tracking-wide mb-1">Current Plan</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-gray-900 dark:text-white">{planDisplay.name}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusBadge}`}>
                  {statusLabel}
                </span>
                {cancelAtPeriodEnd && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Cancels at period end</span>
                )}
              </div>
              {planId !== 'free' && (
                <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                  ${planDisplay.monthly}/mo ({billingCycle ?? 'monthly'})
                  {nextBilling && <> · Next billing: <strong className="text-gray-700 dark:text-zinc-200">{nextBilling}</strong></>}
                </p>
              )}
            </div>
            {planId === 'free' && (
              <Link href="/pricing" className="text-sm font-bold px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
                Upgrade Plan →
              </Link>
            )}
          </div>
        </div>

        {/* Usage meters */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-zinc-700/40">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-zinc-100">Usage This Month</h2>
          </div>
          <div className="p-5 space-y-4">
            <UsageMeter label="Trade Coach Messages"   used={usage.tradeCoachMessages}   limit={limits.tradeCoach}   unit="messages" />
            <UsageMeter label="Stock Coach Messages"   used={usage.stockCoachMessages}   limit={limits.stockCoach}   unit="messages" />
            <UsageMeter label="Options Coach Messages" used={usage.optionsCoachMessages} limit={limits.optionsCoach} unit="messages" />
            <UsageMeter label="LEAPS Advisor Queries"  used={usage.leapsQueries}         limit={limits.leaps}        unit="queries"  />
            <UsageMeter label="Trades Logged"          used={usage.tradesLogged}         limit={limits.maxTrades}    unit="trades"   />
          </div>
        </div>

        {/* Plan comparison */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700/60 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-zinc-700/40">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-zinc-100">Change Plan</h2>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(['free', 'starter', 'pro', 'elite'] as PlanId[]).map((p) => (
              <PlanCard key={p} planKey={p} currentPlan={planId} onSelect={handlePlanSelect} loading={planLoading} />
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
            <h2 className="text-sm font-semibold text-gray-800 dark:text-zinc-100">Invoice History</h2>
          </div>
          {invoicesLoading ? (
            <div className="p-8 text-center text-sm text-gray-400 dark:text-zinc-600">Loading invoices…</div>
          ) : invoices.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400 dark:text-zinc-600">No invoices yet.</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-zinc-700/30">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-gray-50 dark:hover:bg-zinc-800/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs text-gray-400 dark:text-zinc-600 w-32 truncate">{inv.id}</span>
                    <span className="text-gray-700 dark:text-zinc-300">{inv.date}</span>
                    <span className="text-xs text-gray-500 dark:text-zinc-500">{inv.planName}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {inv.amount > 0 ? `$${inv.amount.toFixed(2)}` : '—'}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      inv.status === 'paid'
                        ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-500'
                    }`}>
                      {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                    </span>
                    {inv.pdfUrl && (
                      <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-gray-400 dark:text-zinc-600 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger zone — cancel via Stripe portal */}
        {planId !== 'free' && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-red-200 dark:border-red-500/20 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-red-100 dark:border-red-500/20">
              <h2 className="text-sm font-semibold text-red-600 dark:text-red-400">Cancel Subscription</h2>
            </div>
            <div className="p-5 flex items-center justify-between flex-wrap gap-4">
              <p className="text-sm text-gray-600 dark:text-zinc-400">
                Your access continues until the end of your billing period. Manage cancellation through your billing portal.
              </p>
              <button
                onClick={handleManageBilling}
                disabled={portalLoading}
                className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium border border-red-200 dark:border-red-500/30 px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {portalLoading ? 'Opening…' : 'Manage / Cancel'}
              </button>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
