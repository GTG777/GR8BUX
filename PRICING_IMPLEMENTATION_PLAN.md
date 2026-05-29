# GR8BUX — Pricing & Subscription Implementation Plan

## Current State

| Layer | Status |
|---|---|
| Pricing page (`/pricing`) | Exists — 3 plans (Free / Pro $29 / Elite $79), static UI only |
| Billing page (`/billing`) | Exists — full UI (usage meters, invoices, cancel flow) — all mock data |
| Subscriptions DB table | **Does not exist** |
| Usage tracking DB table | **Does not exist** |
| Stripe integration | **None** — no package, no env vars, no endpoints |
| Feature gating in API | **None** — all authenticated users get all features |
| Plan context in frontend | **None** — no shared plan/usage state |

---

## Plan Structure Decision

### Recommended: Add Starter tier, reprice Elite

The existing pricing page has 3 tiers. The PM analysis identified 4 tiers with better conversion funneling. Reconciled plan:

| Plan | Monthly | Annual (billed/yr) | Savings |
|---|---|---|---|
| Free | $0 | $0 | — |
| Starter | $12 | $9/mo ($108/yr) | save $36/yr |
| Pro | $29 | $23/mo ($276/yr) | save $72/yr |
| Elite | $59 | $47/mo ($564/yr) | save $144/yr |

> Elite repriced from $79 → $59: AI costs are ~$1.14/user/mo at full throttle. $59 gives 98%+ margin while being more competitive.

### Feature Matrix

| Feature | Free | Starter | Pro | Elite |
|---|---|---|---|---|
| Trade Journal | 50 trades | Unlimited | Unlimited | Unlimited |
| Watchlist | 10 symbols | 25 symbols | Unlimited | Unlimited |
| P&L Analytics | Basic | Full | Full | Full |
| Stock Scanner | — | All signals | All signals | All signals |
| Options Chain | View only | View only | Full + builder | Full + builder |
| Earnings Calendar | — | ✓ | ✓ | ✓ |
| AI Analyses (market reports) | — | Read-only | Full | Full |
| Trade Coach | — | 30 msg/mo | 200 msg/mo | Unlimited |
| Stock Coach | — | 20 msg/mo | 100 msg/mo | Unlimited |
| Options Coach | — | 20 msg/mo | 100 msg/mo | Unlimited |
| LEAPS Advisor | — | — | 50 queries/mo | Unlimited |
| Greeks & Risk Manager | — | — | ✓ | ✓ |
| Insider Activity | — | — | — | ✓ |
| CSV Export | — | — | ✓ | ✓ |
| Priority Support | — | — | — | ✓ |

### Limit Constants File

All limits live in one place: `src/lib/planLimits.ts` — single source of truth for both frontend and backend.

```typescript
export const PLAN_IDS = ['free', 'starter', 'pro', 'elite'] as const;
export type PlanId = typeof PLAN_IDS[number];

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free:    { maxTrades: 50,       watchlistSymbols: 10,  tradeCoach: 0,   stockCoach: 0,   optionsCoach: 0,   leaps: 0,  features: { scanner: false, optionsBuilder: false, aiCoaches: false, leapsAdvisor: false, greeks: false, insider: false, csvExport: false } },
  starter: { maxTrades: Infinity, watchlistSymbols: 25,  tradeCoach: 30,  stockCoach: 20,  optionsCoach: 20,  leaps: 0,  features: { scanner: true,  optionsBuilder: false, aiCoaches: true,  leapsAdvisor: false, greeks: false, insider: false, csvExport: false } },
  pro:     { maxTrades: Infinity, watchlistSymbols: Infinity, tradeCoach: 200, stockCoach: 100, optionsCoach: 100, leaps: 50, features: { scanner: true, optionsBuilder: true, aiCoaches: true, leapsAdvisor: true, greeks: true, insider: false, csvExport: true } },
  elite:   { maxTrades: Infinity, watchlistSymbols: Infinity, tradeCoach: Infinity, stockCoach: Infinity, optionsCoach: Infinity, leaps: Infinity, features: { scanner: true, optionsBuilder: true, aiCoaches: true, leapsAdvisor: true, greeks: true, insider: true, csvExport: true } },
};
```

---

## Implementation Phases

### Phase 1 — Database Schema
**Effort: 1–2 hours | Risk: Low | No user impact**

#### Migration 019: `subscriptions` table

```sql
CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id               TEXT NOT NULL DEFAULT 'free'
                        CHECK (plan_id IN ('free', 'starter', 'pro', 'elite')),
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  billing_cycle         TEXT CHECK (billing_cycle IN ('monthly', 'annual')),
  stripe_customer_id    TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id       TEXT,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
  trial_end             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- RLS: users can read their own row; only service role can write
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Auto-create free subscription on user signup
CREATE OR REPLACE FUNCTION create_free_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO subscriptions (user_id, plan_id, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_user_created
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION create_free_subscription();
```

#### Migration 019 (continued): `usage_metrics` table

```sql
CREATE TABLE usage_metrics (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start          DATE NOT NULL,          -- first day of billing month
  trade_coach_messages  INT NOT NULL DEFAULT 0,
  stock_coach_messages  INT NOT NULL DEFAULT 0,
  options_coach_messages INT NOT NULL DEFAULT 0,
  leaps_queries         INT NOT NULL DEFAULT 0,
  trades_logged         INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_start)
);

ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own usage"
  ON usage_metrics FOR SELECT USING (auth.uid() = user_id);

-- Backfill existing users with free subscriptions
INSERT INTO subscriptions (user_id, plan_id, status)
SELECT id, 'free', 'active' FROM users
ON CONFLICT (user_id) DO NOTHING;
```

**Files to create:**
- `supabase/migrations/019_subscriptions.sql`

---

### Phase 2 — Stripe Setup
**Effort: 2–3 hours | Risk: Low | Admin-only task**

#### 2.1 — Install Stripe SDK

```bash
npm install stripe @stripe/stripe-js
```

#### 2.2 — Create Stripe Products & Prices

In the Stripe dashboard (or via Stripe CLI), create:

| Product | Monthly Price ID | Annual Price ID |
|---|---|---|
| GR8BUX Starter | `price_starter_monthly` ($12/mo) | `price_starter_annual` ($108/yr) |
| GR8BUX Pro | `price_pro_monthly` ($29/mo) | `price_pro_annual` ($276/yr) |
| GR8BUX Elite | `price_elite_monthly` ($59/mo) | `price_elite_annual` ($564/yr) |

Save the actual price IDs into a constants file:

**`src/lib/stripePrices.ts`**
```typescript
export const STRIPE_PRICES: Record<string, { monthly: string; annual: string }> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
    annual:  process.env.STRIPE_PRICE_STARTER_ANNUAL!,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
    annual:  process.env.STRIPE_PRICE_PRO_ANNUAL!,
  },
  elite: {
    monthly: process.env.STRIPE_PRICE_ELITE_MONTHLY!,
    annual:  process.env.STRIPE_PRICE_ELITE_ANNUAL!,
  },
};

// Reverse map: Stripe price ID → internal plan ID
export const PRICE_TO_PLAN: Record<string, string> = {};
for (const [plan, prices] of Object.entries(STRIPE_PRICES)) {
  PRICE_TO_PLAN[prices.monthly] = plan;
  PRICE_TO_PLAN[prices.annual]  = plan;
}
```

#### 2.3 — Environment Variables

Add to Netlify dashboard and `.env.local`:

```
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
STRIPE_PRICE_ELITE_MONTHLY=price_...
STRIPE_PRICE_ELITE_ANNUAL=price_...
```

#### 2.4 — Stripe Client Singleton

**`src/lib/stripe.ts`**
```typescript
import Stripe from 'stripe';

let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-11-20.acacia',
    });
  }
  return _stripe;
}
```

---

### Phase 3 — Backend API Endpoints
**Effort: 4–6 hours | Risk: Medium | Core integration layer**

#### 3.1 — `GET /api/billing/subscription`

Returns the current user's plan, status, usage, and billing dates.

**`src/pages/api/billing/subscription.ts`**

```typescript
// Returns: { plan, status, billingCycle, currentPeriodEnd, cancelAtPeriodEnd, usage, limits }
// Reads from subscriptions + usage_metrics tables
// Used by PlanContext (loaded once per session)
```

Key logic:
- Join `subscriptions` + `usage_metrics` for current month
- If no subscription row: treat as free (should not happen after trigger is live)
- Cache-control: `max-age=60` (1 minute client cache is fine)

#### 3.2 — `POST /api/billing/create-checkout-session`

Creates a Stripe Checkout session and returns the URL.

**`src/pages/api/billing/create-checkout-session.ts`**

```typescript
// Body: { planId: 'starter'|'pro'|'elite', cycle: 'monthly'|'annual' }
// 1. requireAuth
// 2. Look up or create Stripe customer for this user (store stripe_customer_id)
// 3. getStripe().checkout.sessions.create({
//      customer: stripeCustomerId,
//      mode: 'subscription',
//      line_items: [{ price: STRIPE_PRICES[planId][cycle], quantity: 1 }],
//      success_url: `${origin}/billing?session_id={CHECKOUT_SESSION_ID}`,
//      cancel_url:  `${origin}/pricing`,
//      subscription_data: { trial_period_days: 7 },  // for paid plans
//      metadata: { userId: user.id, planId },
//    })
// 4. Return { url: session.url }
```

#### 3.3 — `POST /api/billing/create-portal-session`

Opens Stripe Customer Portal for self-service (update card, cancel, invoice history).

**`src/pages/api/billing/create-portal-session.ts`**

```typescript
// 1. requireAuth
// 2. Fetch stripe_customer_id from subscriptions table
// 3. getStripe().billingPortal.sessions.create({
//      customer: stripeCustomerId,
//      return_url: `${origin}/billing`,
//    })
// 4. Return { url: session.url }
```

> **Why Customer Portal?** Stripe handles card updates, cancellation, and invoice PDFs out of the box. No need to build these flows from scratch. The `/billing` page "Manage billing" button just opens this portal.

#### 3.4 — `POST /api/billing/webhook`

Receives all Stripe events and keeps the local `subscriptions` table in sync.

**`src/pages/api/billing/webhook.ts`**

```typescript
// CRITICAL: must export config { api: { bodyParser: false } }
// Verify signature with STRIPE_WEBHOOK_SECRET

// Handle these events:
// checkout.session.completed       → upsert subscription row (plan, status, period dates)
// customer.subscription.updated    → update plan_id, status, period dates, cancel_at_period_end
// customer.subscription.deleted    → set status='canceled', plan_id='free'
// invoice.payment_failed           → set status='past_due'
// invoice.payment_succeeded        → set status='active' (recover from past_due)
// customer.subscription.trial_will_end → (optional) send email notification
```

Upsert logic for `customer.subscription.updated`:

```typescript
const priceId = subscription.items.data[0].price.id;
const planId  = PRICE_TO_PLAN[priceId] ?? 'free';

await supabase.from('subscriptions').upsert({
  user_id:                 metadata.userId,        // from subscription.metadata
  plan_id:                 planId,
  status:                  subscription.status,
  billing_cycle:           subscription.items.data[0].price.recurring?.interval === 'year' ? 'annual' : 'monthly',
  stripe_customer_id:      subscription.customer as string,
  stripe_subscription_id:  subscription.id,
  stripe_price_id:         priceId,
  current_period_start:    new Date(subscription.current_period_start * 1000).toISOString(),
  current_period_end:      new Date(subscription.current_period_end   * 1000).toISOString(),
  cancel_at_period_end:    subscription.cancel_at_period_end,
  trial_end:               subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
  updated_at:              new Date().toISOString(),
}, { onConflict: 'user_id' });
```

**Register webhook in Netlify `netlify.toml`:** Not needed — this is a regular API route, not a scheduled function.

**Register webhook in Stripe dashboard:** Point to `https://app.gr8bux.com/api/billing/webhook`.

#### 3.5 — Usage Increment Helpers

**`src/lib/usageTracking.ts`**

```typescript
// incrementUsage(userId, metric: 'trade_coach_messages' | 'stock_coach_messages' | ...)
// Atomically upserts the current month's usage_metrics row:
//   INSERT INTO usage_metrics (user_id, period_start, {metric})
//   VALUES (userId, date_trunc('month', now())::date, 1)
//   ON CONFLICT (user_id, period_start)
//   DO UPDATE SET {metric} = usage_metrics.{metric} + 1, updated_at = now()

// checkUsageLimit(userId, metric) → { allowed: boolean, used: number, limit: number }
// Reads subscription plan → gets limit → reads current month usage → compares
```

---

### Phase 4 — Plan Context (Frontend)
**Effort: 2–3 hours | Risk: Low | Shared state layer**

#### 4.1 — `usePlan` Hook / Plan Context

**`src/hooks/usePlan.ts`**

```typescript
interface PlanState {
  planId: PlanId;
  status: string;
  limits: PlanLimits;
  usage: MonthlyUsage;
  isLoading: boolean;
  canUse: (feature: keyof PlanFeatures) => boolean;
  withinLimit: (metric: 'tradeCoach' | 'stockCoach' | 'optionsCoach' | 'leaps') => boolean;
  usagePct: (metric: string) => number;
}

// Fetches /api/billing/subscription once on mount (after auth)
// Caches in Zustand store alongside authStore
// Provides helper methods: canUse(), withinLimit(), usagePct()
```

Add `PlanContext.Provider` wrapping in `src/pages/_app.tsx` (or `src/components/Layout/index.tsx`) so all pages have access.

#### 4.2 — `planStore.ts` (Zustand)

**`src/store/planStore.ts`**

```typescript
interface PlanStore {
  planId: PlanId | null;
  status: string | null;
  usage: MonthlyUsage | null;
  isLoading: boolean;
  fetchPlan: () => Promise<void>;
  reset: () => void;
}
```

Called after `authStore` confirms user is signed in. Reset on sign-out.

---

### Phase 5 — API Feature Gates
**Effort: 3–4 hours | Risk: Medium | Protects revenue**

#### 5.1 — `requirePlanFeature` Middleware

**`src/lib/planGate.ts`**

```typescript
// Feature gate — blocks access if plan doesn't include the feature
export async function requirePlanFeature(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  feature: keyof PlanFeatures,
): Promise<boolean> {
  const sub = await getSubscription(userId);   // cached read from subscriptions table
  const plan = sub?.plan_id ?? 'free';
  if (!PLAN_LIMITS[plan].features[feature]) {
    res.status(403).json({
      success: false,
      error: 'upgrade_required',
      requiredPlan: getMinPlanForFeature(feature),
    });
    return false;
  }
  return true;
}

// Usage limit gate — blocks with 429 if monthly quota exceeded
export async function requireUsageQuota(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  metric: UsageMetric,
): Promise<boolean> {
  const { allowed, used, limit } = await checkUsageLimit(userId, metric);
  if (!allowed) {
    res.status(429).json({
      success: false,
      error: 'usage_limit_reached',
      used,
      limit,
    });
    return false;
  }
  return true;
}
```

#### 5.2 — Apply Gates to API Routes

| API Route | Gate Type | Check |
|---|---|---|
| `POST /api/chat/coach` | Usage quota | `tradeCoachMessages` |
| `POST /api/chat/stock-coach` | Usage quota | `stockCoachMessages` |
| `POST /api/chat/options-coach` | Usage quota | `optionsCoachMessages` |
| `POST /api/chat/leaps-advisor` | Feature + quota | `leapsAdvisor` feature, `leapsQueries` count |
| `POST /api/trades` | Trade count | If Free: check `trades_logged ≤ 50` |
| `GET /api/market/analyses` | Feature flag | `aiCoaches` (Starter+) |
| `POST /api/market/scanner` | Feature flag | `scanner` (Starter+) |
| `GET /api/market/options-chain` (write/build routes) | Feature flag | `optionsBuilder` (Pro+) |
| `GET /api/market/insider` | Feature flag | `insider` (Elite only) |

**Implementation pattern** (example for coach):

```typescript
// src/pages/api/chat/coach.ts — add at top of handler, after requireAuth:
const allowed = await requireUsageQuota(req, res, user.id, 'trade_coach_messages');
if (!allowed) return;

// After successful LLM call — increment usage (non-blocking):
incrementUsage(user.id, 'trade_coach_messages').catch(() => {});
```

> **Admin override:** Skip plan gates when `user.role === 'admin'`. Add this check inside `requirePlanFeature` and `requireUsageQuota`.

---

### Phase 6 — Frontend Updates
**Effort: 4–5 hours | Risk: Low | UI-only changes**

#### 6.1 — Pricing Page (`/pricing`)

Changes:
1. Add **Starter** plan between Free and Pro (4-column grid on desktop, stacked on mobile)
2. Reprice Elite: $79 → $59/mo, $63 → $47/mo annual
3. Wire CTA buttons:
   - Free: stays as `/auth/signup`
   - Starter/Pro/Elite (not signed in): `/auth/signup?plan={id}`
   - Starter/Pro/Elite (signed in): calls `POST /api/billing/create-checkout-session` → redirect to Stripe Checkout URL
4. If user is already on this plan: show "Current Plan" badge, no button

```typescript
// In PricingPage component:
const { planId } = usePlan();
const { user } = useAuthStore();

const handleCTA = async (plan: Plan, cycle: BillingCycle) => {
  if (!user) { router.push(`/auth/signup?plan=${plan.id}`); return; }
  if (plan.id === 'free') { router.push('/dashboard'); return; }
  const res = await fetch('/api/billing/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ planId: plan.id, cycle }),
  });
  const { url } = await res.json();
  window.location.href = url;
};
```

#### 6.2 — Billing Page (`/billing`)

Wire up all mock data to real API:

| Section | From | To |
|---|---|---|
| Current plan summary | Hardcoded 'Pro' | `usePlan().planId` + `status` + `current_period_end` |
| Payment method | Mock `•••• 4242` | "Manage billing" button → Stripe Customer Portal |
| Plan cards | Mock upgrade handler | `create-checkout-session` (upgrade) or `create-portal-session` (manage) |
| Usage meters | Hardcoded numbers | `usePlan().usage` object |
| Invoice history | Mock `MOCK_INVOICES` | Fetched from `/api/billing/invoices` (proxies Stripe invoice list) |
| Cancel button | No-op | Opens Stripe Customer Portal (handles cancellation UX) |

**`GET /api/billing/invoices`** — new endpoint:
```typescript
// Lists last 12 Stripe invoices for the user's customer ID
// Returns: [{ id, date, amount, status, planName, pdfUrl }]
```

#### 6.3 — In-App Upgrade Prompts (Soft Gates)

When a user tries to access a gated feature from the UI:

**`src/components/UpgradePrompt.tsx`**

```tsx
// Shown as a modal or inline card when user hits a plan limit
// Props: feature name, required plan, current plan
// CTA: "Upgrade to Pro →" → navigates to /pricing#pro

<UpgradePrompt
  feature="LEAPS AI Advisor"
  requiredPlan="pro"
  description="Get AI-powered LEAPS screening with 50 queries per month."
/>
```

Usage: wrap gated UI sections instead of hiding them:
```tsx
{canUse('leapsAdvisor') ? (
  <LeapsChat />
) : (
  <UpgradePrompt feature="LEAPS AI Advisor" requiredPlan="pro" />
)}
```

#### 6.4 — Usage Progress Bars on Coach Pages

Each AI coach page shows a usage meter at the top when the user's plan has a limit:

```tsx
// Only show for Starter/Pro plans (Elite is unlimited)
{limits.tradeCoach !== Infinity && (
  <UsageBar
    label="Trade Coach"
    used={usage.tradeCoachMessages}
    limit={limits.tradeCoach}
    resetDate={nextBillingDate}
  />
)}
```

Color thresholds: green (< 70%) → yellow (70–90%) → red (> 90%).

---

### Phase 7 — Auth Flow Integration
**Effort: 1–2 hours | Risk: Low**

#### 7.1 — Signup with Plan Intent

When users land on `/auth/signup?plan=pro`:
1. Complete normal signup flow
2. After account creation, redirect to Stripe Checkout for the intended plan (via `create-checkout-session`)
3. On Stripe success: redirect to `/dashboard` with welcome modal

```typescript
// src/pages/auth/signup.tsx — after successful signup:
const intendedPlan = router.query.plan as string;
if (intendedPlan && intendedPlan !== 'free') {
  const res = await fetch('/api/billing/create-checkout-session', { ... });
  const { url } = await res.json();
  window.location.href = url;
} else {
  router.push('/dashboard');
}
```

#### 7.2 — `planStore` Loaded After Auth

In `src/pages/_app.tsx` or `authStore`, after `user` becomes available:
```typescript
useEffect(() => {
  if (user) planStore.fetchPlan();
  else planStore.reset();
}, [user]);
```

---

### Phase 8 — Admin Subscription Management
**Effort: 1–2 hours | Risk: Low**

**`GET /api/admin/subscriptions`** — list all subscribers with plan + status  
**`POST /api/admin/subscriptions/override`** — manually set a user's plan (for comps, support overrides, testing)

Add a "Subscriptions" tab to the existing admin panel at `/admin` (or wherever your admin UI lives) showing:
- Total active subscribers by plan
- Monthly recurring revenue estimate
- List of users with plan, status, next billing date
- "Override plan" action for support use

---

## Stripe Webhook Local Testing

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
```

---

## File Manifest

### New files to create

| File | Purpose |
|---|---|
| `supabase/migrations/019_subscriptions.sql` | subscriptions + usage_metrics tables |
| `src/lib/planLimits.ts` | PLAN_LIMITS constants, PlanId type |
| `src/lib/stripe.ts` | Stripe singleton |
| `src/lib/stripePrices.ts` | Price ID map + PRICE_TO_PLAN reverse map |
| `src/lib/planGate.ts` | `requirePlanFeature`, `requireUsageQuota` |
| `src/lib/usageTracking.ts` | `incrementUsage`, `checkUsageLimit` |
| `src/store/planStore.ts` | Zustand plan store |
| `src/hooks/usePlan.ts` | `usePlan()` hook |
| `src/components/UpgradePrompt.tsx` | In-app upgrade gate component |
| `src/pages/api/billing/subscription.ts` | GET current plan + usage |
| `src/pages/api/billing/create-checkout-session.ts` | POST → Stripe Checkout URL |
| `src/pages/api/billing/create-portal-session.ts` | POST → Stripe Portal URL |
| `src/pages/api/billing/webhook.ts` | POST Stripe webhook receiver |
| `src/pages/api/billing/invoices.ts` | GET invoice history from Stripe |
| `src/pages/api/admin/subscriptions.ts` | Admin: list all + override |

### Files to modify

| File | Change |
|---|---|
| `supabase/migrations/019_subscriptions.sql` | Backfill trigger for existing users |
| `src/pages/pricing/index.tsx` | Add Starter tier, reprice Elite, wire CTAs |
| `src/pages/billing/index.tsx` | Wire all mock data to real API |
| `src/pages/_app.tsx` | Load planStore after auth |
| `src/pages/api/chat/coach.ts` | Add usage gate + increment |
| `src/pages/api/chat/stock-coach.ts` | Add usage gate + increment |
| `src/pages/api/chat/options-coach.ts` | Add usage gate + increment |
| `src/pages/api/chat/leaps-advisor.ts` | Add feature gate + usage gate + increment |
| `src/pages/api/trades/index.ts` | Add trade count gate for Free tier |
| `netlify.toml` | No change needed (webhook is a regular API route) |

---

## Implementation Order

```
Phase 1: DB migration (019)            ← no user impact, do first
Phase 2: Stripe setup + env vars       ← admin task, parallel with Phase 1
Phase 3: Backend API endpoints         ← depends on Phase 1 + 2
Phase 4: Plan context / Zustand store  ← depends on Phase 3
Phase 5: API feature gates             ← depends on Phase 4, deploy carefully
Phase 6: Frontend updates              ← depends on Phase 4, can be partial
Phase 7: Auth flow                     ← depends on Phase 3
Phase 8: Admin panel                   ← last, low urgency
```

**Do NOT deploy Phase 5 (hard gates) until Phase 3 + 4 are verified in production.** Soft gates (frontend-only prompts) can go live earlier without risk.

---

## Rollout Strategy

### Step 1 — Shadow mode (week 1)
Deploy Phases 1–4. Track usage without blocking anything. Verify the DB is correctly recording subscriptions and usage for all users. All existing users auto-assigned `free` plan.

### Step 2 — Grandfather existing users (week 1)
Manually upgrade any existing active users to Pro for free for 30 days. Run:
```sql
UPDATE subscriptions SET plan_id = 'pro', current_period_end = now() + interval '30 days'
WHERE user_id IN (SELECT id FROM users WHERE created_at < '2026-05-28');
```

### Step 3 — Soft gates live (week 2)
Deploy Phase 6 (frontend-only upgrade prompts). Features still work for everyone. Users see prompts, can explore pricing, sign up for Stripe.

### Step 4 — Hard gates live (week 3)
Deploy Phase 5 (API enforcement). At this point, Free users get 429s/403s on restricted features. Grandfathered Pro users are unaffected. Monitor error logs.

### Step 5 — Full rollout
Enable Stripe production mode. Remove test keys. Open pricing page for real signups.

---

## Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Webhook delivery failure (subscription not synced) | Medium | Add retry logic + Supabase realtime fallback; Stripe retries for 3 days |
| Usage counter race condition (concurrent requests) | Low | SQL `ON CONFLICT DO UPDATE SET metric = metric + 1` is atomic |
| Existing users locked out unexpectedly | Medium | Grandfather all pre-launch users; shadow mode first |
| Stripe Checkout redirect fails | Low | Always show `/pricing` as fallback URL |
| `subscriptions` row missing for new user (trigger failure) | Low | `/api/billing/subscription` defaults to `free` when row is absent |
| Admin user gets gated | Low | `requirePlanFeature` skips check when `user.role === 'admin'` |

---

## Token Cost Reminder (from prior analysis)

At full throttle, per-user AI costs:
- **Starter**: ~$0.037/mo → 99.7% margin on $12
- **Pro**: ~$0.23/mo → 99.2% margin on $29  
- **Elite**: ~$1.14/mo → 98.1% margin on $59
- **Shared AI Analyses cron**: ~$32/mo flat (all users, amortized)

AI costs are not a constraint at any realistic scale. Netlify function compute and Supabase egress are the more likely cost pressure points to watch.

---

## Execution Log

| Date | Phase | Item | Status |
|---|---|---|---|
| 2026-05-28 | 1 | `supabase/migrations/019_subscriptions.sql` — `subscriptions` + `usage_metrics` tables + `increment_usage_metric` RPC + backfill trigger | ✅ DONE |
| 2026-05-28 | 2 | `npm install stripe @stripe/stripe-js` | ✅ DONE |
| 2026-05-28 | 2 | `src/lib/planLimits.ts` — PLAN_LIMITS constants, PlanId type, PLAN_DISPLAY, getMinPlanForFeature | ✅ DONE |
| 2026-05-28 | 2 | `src/lib/stripe.ts` — Stripe singleton (dahlia API) | ✅ DONE |
| 2026-05-28 | 2 | `src/lib/stripePrices.ts` — price ID helpers + reverse map | ✅ DONE |
| 2026-05-28 | 3 | `src/lib/usageTracking.ts` — incrementUsage, checkUsageLimit, getMonthlyUsage | ✅ DONE |
| 2026-05-28 | 3 | `src/lib/planGate.ts` — requirePlanFeature, requireUsageQuota, getSubscription | ✅ DONE |
| 2026-05-28 | 3 | `src/pages/api/billing/subscription.ts` — GET plan + usage | ✅ DONE |
| 2026-05-28 | 3 | `src/pages/api/billing/create-checkout-session.ts` — POST → Stripe Checkout | ✅ DONE |
| 2026-05-28 | 3 | `src/pages/api/billing/create-portal-session.ts` — POST → Stripe Portal | ✅ DONE |
| 2026-05-28 | 3 | `src/pages/api/billing/webhook.ts` — Stripe event handler (rawBody, dahlia item-level periods) | ✅ DONE |
| 2026-05-28 | 3 | `src/pages/api/billing/invoices.ts` — GET invoice list from Stripe | ✅ DONE |
| 2026-05-28 | 4 | `src/store/planStore.ts` — Zustand store: fetchPlan, canUse, withinLimit, usagePct | ✅ DONE |
| 2026-05-28 | 4 | `src/hooks/usePlan.ts` — re-export hook | ✅ DONE |
| 2026-05-28 | 4 | `src/components/AuthProvider.tsx` — fetchPlan after auth, reset on sign-out | ✅ DONE |
| 2026-05-28 | 5 | `src/pages/api/chat/coach.ts` — aiCoaches feature gate + tradeCoach usage gate + increment | ✅ DONE |
| 2026-05-28 | 5 | `src/pages/api/chat/stock-coach.ts` — aiCoaches gate + stockCoach usage gate + increment | ✅ DONE |
| 2026-05-28 | 5 | `src/pages/api/chat/options-coach.ts` — aiCoaches gate + optionsCoach usage gate + increment | ✅ DONE |
| 2026-05-28 | 5 | `src/pages/api/chat/leaps-advisor.ts` — leapsAdvisor feature gate + leaps usage gate + increment | ✅ DONE |
| 2026-05-28 | 6 | `src/components/UpgradePrompt.tsx` — reusable upgrade gate component (compact + full variants) | ✅ DONE |
| 2026-05-28 | 6 | `src/pages/pricing/index.tsx` — 4-tier pricing (added Starter $12, repriced Elite $59), wired CTAs | ✅ DONE |
| 2026-05-28 | 6 | `src/pages/billing/index.tsx` — billing page wired to real data: plan store, real invoices, Stripe portal | ✅ DONE |
| 2026-05-28 | 7 | `src/pages/auth/signup.tsx` — post-signup Stripe redirect when ?plan= param set; plan intent banner | ✅ DONE |
| 2026-05-28 | 8 | `src/pages/api/admin/subscriptions.ts` — GET subscriber list + stats + MRR; POST plan override | ✅ DONE |
