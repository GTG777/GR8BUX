import { getSupabaseServiceRoleClient } from './supabase';
import { PLAN_LIMITS, type PlanId } from './planLimits';

export type UsageMetric =
  | 'trade_coach_messages'
  | 'stock_coach_messages'
  | 'options_coach_messages'
  | 'leaps_queries'
  | 'trades_logged';

// Maps DB column name → planLimits key
const METRIC_TO_LIMIT: Record<UsageMetric, keyof typeof PLAN_LIMITS['free']> = {
  trade_coach_messages:   'tradeCoach',
  stock_coach_messages:   'stockCoach',
  options_coach_messages: 'optionsCoach',
  leaps_queries:          'leaps',
  trades_logged:          'maxTrades',
};

function currentPeriodStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export async function incrementUsage(userId: string, metric: UsageMetric): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return;
  const period = currentPeriodStart();

  await supabase.rpc('increment_usage_metric', {
    p_user_id:    userId,
    p_period:     period,
    p_metric:     metric,
  });
}

export interface UsageLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
}

export async function checkUsageLimit(
  userId: string,
  metric: UsageMetric,
  planId: PlanId,
): Promise<UsageLimitResult> {
  const limitKey = METRIC_TO_LIMIT[metric];
  const limit = PLAN_LIMITS[planId][limitKey] as number;

  if (limit === Infinity) return { allowed: true, used: 0, limit: Infinity };
  if (limit === 0) return { allowed: false, used: 0, limit: 0 };

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return { allowed: true, used: 0, limit };

  const period = currentPeriodStart();
  const { data } = await supabase
    .from('usage_metrics')
    .select(metric)
    .eq('user_id', userId)
    .eq('period_start', period)
    .maybeSingle();

  const used = (data as any)?.[metric] ?? 0;
  return { allowed: used < limit, used, limit };
}

export interface MonthlyUsage {
  tradeCoachMessages: number;
  stockCoachMessages: number;
  optionsCoachMessages: number;
  leapsQueries: number;
  tradesLogged: number;
  periodStart: string;
}

export async function getMonthlyUsage(userId: string): Promise<MonthlyUsage> {
  const supabase = getSupabaseServiceRoleClient();
  const empty: MonthlyUsage = {
    tradeCoachMessages: 0, stockCoachMessages: 0, optionsCoachMessages: 0,
    leapsQueries: 0, tradesLogged: 0, periodStart: currentPeriodStart(),
  };
  if (!supabase) return empty;

  const period = currentPeriodStart();
  const { data } = await supabase
    .from('usage_metrics')
    .select('*')
    .eq('user_id', userId)
    .eq('period_start', period)
    .maybeSingle();

  if (!data) return empty;
  return {
    tradeCoachMessages:   data.trade_coach_messages   ?? 0,
    stockCoachMessages:   data.stock_coach_messages   ?? 0,
    optionsCoachMessages: data.options_coach_messages ?? 0,
    leapsQueries:         data.leaps_queries          ?? 0,
    tradesLogged:         data.trades_logged          ?? 0,
    periodStart:          data.period_start,
  };
}
