import { create } from 'zustand';
import { PLAN_LIMITS, type PlanId, type PlanLimits, type PlanFeatures } from '@/lib/planLimits';
import type { MonthlyUsage } from '@/lib/usageTracking';
import type { SubscriptionResponse } from '@/pages/api/billing/subscription';

interface PlanState {
  planId: PlanId;
  status: string;
  billingCycle: 'monthly' | 'annual' | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  limits: PlanLimits;
  usage: MonthlyUsage;
  isLoading: boolean;
  error: string | null;

  fetchPlan: (token: string) => Promise<void>;
  reset: () => void;

  canUse: (feature: keyof PlanFeatures) => boolean;
  withinLimit: (metric: 'tradeCoach' | 'stockCoach' | 'optionsCoach' | 'leaps') => boolean;
  usagePct: (metric: 'tradeCoach' | 'stockCoach' | 'optionsCoach' | 'leaps') => number;
}

const EMPTY_USAGE: MonthlyUsage = {
  tradeCoachMessages: 0, stockCoachMessages: 0, optionsCoachMessages: 0,
  leapsQueries: 0, tradesLogged: 0, periodStart: '',
};

const METRIC_TO_USAGE: Record<string, keyof MonthlyUsage> = {
  tradeCoach:   'tradeCoachMessages',
  stockCoach:   'stockCoachMessages',
  optionsCoach: 'optionsCoachMessages',
  leaps:        'leapsQueries',
};
const METRIC_TO_LIMIT: Record<string, keyof PlanLimits> = {
  tradeCoach:   'tradeCoach',
  stockCoach:   'stockCoach',
  optionsCoach: 'optionsCoach',
  leaps:        'leaps',
};

export const usePlanStore = create<PlanState>((set, get) => ({
  planId:            'free',
  status:            'active',
  billingCycle:      null,
  currentPeriodEnd:  null,
  cancelAtPeriodEnd: false,
  trialEnd:          null,
  limits:            PLAN_LIMITS['free'],
  usage:             EMPTY_USAGE,
  isLoading:         false,
  error:             null,

  fetchPlan: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/billing/subscription', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch subscription');
      const json = await res.json() as { success: boolean; data: SubscriptionResponse };
      if (json.success && json.data) {
        const d = json.data;
        set({
          planId:            d.planId,
          status:            d.status,
          billingCycle:      d.billingCycle,
          currentPeriodEnd:  d.currentPeriodEnd,
          cancelAtPeriodEnd: d.cancelAtPeriodEnd,
          trialEnd:          d.trialEnd,
          limits:            d.limits,
          usage:             d.usage,
          isLoading:         false,
        });
      }
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message });
    }
  },

  reset: () => set({
    planId: 'free', status: 'active', billingCycle: null,
    currentPeriodEnd: null, cancelAtPeriodEnd: false, trialEnd: null,
    limits: PLAN_LIMITS['free'], usage: EMPTY_USAGE,
    isLoading: false, error: null,
  }),

  canUse: (feature: keyof PlanFeatures) => {
    const { limits, status } = get();
    const active = status === 'active' || status === 'trialing';
    return active && limits.features[feature];
  },

  withinLimit: (metric) => {
    const { limits, usage } = get();
    const limit  = limits[METRIC_TO_LIMIT[metric]] as number;
    const used   = usage[METRIC_TO_USAGE[metric]] as number;
    if (limit === Infinity) return true;
    return used < limit;
  },

  usagePct: (metric) => {
    const { limits, usage } = get();
    const limit = limits[METRIC_TO_LIMIT[metric]] as number;
    if (limit === Infinity || limit === 0) return 0;
    const used = usage[METRIC_TO_USAGE[metric]] as number;
    return Math.min((used / limit) * 100, 100);
  },
}));
