import React from 'react';
import Link from 'next/link';
import { PLAN_DISPLAY, type PlanId } from '@/lib/planLimits';

interface Props {
  feature: string;
  requiredPlan: PlanId;
  description?: string;
  compact?: boolean;
}

export function UpgradePrompt({ feature, requiredPlan, description, compact = false }: Props) {
  const plan = PLAN_DISPLAY[requiredPlan];
  const colorMap: Record<string, { bg: string; border: string; badge: string; btn: string }> = {
    indigo: {
      bg:     'bg-indigo-50 dark:bg-indigo-950/30',
      border: 'border-indigo-200 dark:border-indigo-800/50',
      badge:  'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300',
      btn:    'bg-indigo-600 hover:bg-indigo-700 text-white',
    },
    amber: {
      bg:     'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-800/50',
      badge:  'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
      btn:    'bg-amber-500 hover:bg-amber-600 text-white',
    },
    blue: {
      bg:     'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-200 dark:border-blue-800/50',
      badge:  'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
      btn:    'bg-blue-600 hover:bg-blue-700 text-white',
    },
  };
  const c = colorMap[plan.color] ?? colorMap.indigo;

  if (compact) {
    return (
      <div className={`rounded-lg border ${c.border} ${c.bg} px-3 py-2 flex items-center gap-3`}>
        <span className="text-lg">🔒</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-700 dark:text-zinc-200 truncate">{feature}</p>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400">Requires {plan.name}</p>
        </div>
        <Link
          href={`/pricing`}
          className={`shrink-0 text-xs font-bold px-3 py-1 rounded-lg transition-colors ${c.btn}`}
        >
          Upgrade
        </Link>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-6 text-center space-y-3`}>
      <div className="text-3xl">🔒</div>
      <div>
        <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full mb-2 ${c.badge}`}>
          {plan.name} Feature
        </span>
        <h3 className="text-base font-bold text-gray-900 dark:text-white">{feature}</h3>
        {description && (
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">{description}</p>
        )}
      </div>
      <Link
        href="/pricing"
        className={`inline-block text-sm font-bold px-6 py-2.5 rounded-xl transition-colors ${c.btn} shadow-sm`}
      >
        Upgrade to {plan.name} →
      </Link>
      <p className="text-xs text-gray-400 dark:text-zinc-600">7-day free trial · Cancel anytime</p>
    </div>
  );
}
