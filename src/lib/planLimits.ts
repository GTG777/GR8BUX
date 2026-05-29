export const PLAN_IDS = ['free', 'starter', 'pro', 'elite'] as const;
export type PlanId = typeof PLAN_IDS[number];

export interface PlanFeatures {
  scanner: boolean;
  optionsBuilder: boolean;
  aiCoaches: boolean;
  leapsAdvisor: boolean;
  greeks: boolean;
  insider: boolean;
  csvExport: boolean;
  aiAnalyses: boolean;
}

export interface PlanLimits {
  maxTrades: number;
  watchlistSymbols: number;
  tradeCoach: number;
  stockCoach: number;
  optionsCoach: number;
  leaps: number;
  features: PlanFeatures;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    maxTrades: 50,
    watchlistSymbols: 10,
    tradeCoach: 0,
    stockCoach: 0,
    optionsCoach: 0,
    leaps: 0,
    features: {
      scanner: false,
      optionsBuilder: false,
      aiCoaches: false,
      leapsAdvisor: false,
      greeks: false,
      insider: false,
      csvExport: false,
      aiAnalyses: false,
    },
  },
  starter: {
    maxTrades: Infinity,
    watchlistSymbols: 25,
    tradeCoach: 30,
    stockCoach: 20,
    optionsCoach: 20,
    leaps: 0,
    features: {
      scanner: true,
      optionsBuilder: false,
      aiCoaches: true,
      leapsAdvisor: false,
      greeks: false,
      insider: false,
      csvExport: false,
      aiAnalyses: true,
    },
  },
  pro: {
    maxTrades: Infinity,
    watchlistSymbols: Infinity,
    tradeCoach: 200,
    stockCoach: 100,
    optionsCoach: 100,
    leaps: 50,
    features: {
      scanner: true,
      optionsBuilder: true,
      aiCoaches: true,
      leapsAdvisor: true,
      greeks: true,
      insider: false,
      csvExport: true,
      aiAnalyses: true,
    },
  },
  elite: {
    maxTrades: Infinity,
    watchlistSymbols: Infinity,
    tradeCoach: Infinity,
    stockCoach: Infinity,
    optionsCoach: Infinity,
    leaps: Infinity,
    features: {
      scanner: true,
      optionsBuilder: true,
      aiCoaches: true,
      leapsAdvisor: true,
      greeks: true,
      insider: true,
      csvExport: true,
      aiAnalyses: true,
    },
  },
};

export const PLAN_DISPLAY: Record<PlanId, { name: string; monthly: number; annual: number; color: string }> = {
  free:    { name: 'Free',    monthly: 0,  annual: 0,   color: 'gray' },
  starter: { name: 'Starter', monthly: 12, annual: 9,   color: 'blue' },
  pro:     { name: 'Pro',     monthly: 29, annual: 23,  color: 'indigo' },
  elite:   { name: 'Elite',   monthly: 59, annual: 47,  color: 'amber' },
};

export function getMinPlanForFeature(feature: keyof PlanFeatures): PlanId {
  for (const planId of PLAN_IDS) {
    if (PLAN_LIMITS[planId].features[feature]) return planId;
  }
  return 'elite';
}
