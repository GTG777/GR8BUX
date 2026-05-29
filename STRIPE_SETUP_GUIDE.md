# GR8BUX — Stripe Setup Guide

Pre-launch checklist before taking real payments. Complete all three steps in order.

---

## Step 1 — Create Stripe Products & Prices

**Time: ~15 minutes**

### 1.1 — Sign in to Stripe

1. Go to [https://dashboard.stripe.com](https://dashboard.stripe.com)
2. Make sure you are in **Live mode** (toggle in the top-left — flip from "Test" to "Live" when ready for real payments; use Test mode first to validate the flow end-to-end)

> **Recommendation:** Complete this entire guide in **Test mode** first, verify checkout works, then repeat in Live mode.

---

### 1.2 — Create the Starter Product

1. In the left sidebar, click **Product catalog**
2. Click **+ Add product** (top right)
3. Fill in:
   - **Name:** `GR8BUX Starter`
   - **Description:** `AI-powered trading journal with 30 Trade Coach messages/mo, Stock & Options coaching, and Stock Scanner`
   - **Image:** *(optional — upload your logo)*
4. Under **Pricing**, select **Recurring**
5. Set **Monthly price:**
   - Currency: `USD`
   - Amount: `12.00`
   - Billing period: `Monthly`
   - Click **Add another price** *(do NOT save yet)*
6. Set **Annual price:**
   - Currency: `USD`
   - Amount: `108.00`
   - Billing period: `Yearly`
7. Click **Save product**
8. You will be taken to the product detail page. Copy both price IDs (they look like `price_1ABC...`):
   - Monthly price ID → save as `STRIPE_PRICE_STARTER_MONTHLY`
   - Annual price ID → save as `STRIPE_PRICE_STARTER_ANNUAL`

---

### 1.3 — Create the Pro Product

1. Click **+ Add product**
2. Fill in:
   - **Name:** `GR8BUX Pro`
   - **Description:** `Full AI coaching suite — 200 Trade Coach, 100 Stock/Options Coach, 50 LEAPS queries/mo, Greeks calculator, CSV export`
3. Under **Pricing**, select **Recurring**
4. Set **Monthly price:**
   - Amount: `29.00`
   - Billing period: `Monthly`
   - Click **Add another price**
5. Set **Annual price:**
   - Amount: `276.00`
   - Billing period: `Yearly`
6. Click **Save product**
7. Copy both price IDs:
   - Monthly → `STRIPE_PRICE_PRO_MONTHLY`
   - Annual → `STRIPE_PRICE_PRO_ANNUAL`

---

### 1.4 — Create the Elite Product

1. Click **+ Add product**
2. Fill in:
   - **Name:** `GR8BUX Elite`
   - **Description:** `Unlimited AI coaching — unlimited Trade Coach, Stock Coach, Options Coach, LEAPS Advisor. Insider tracking, priority support`
3. Under **Pricing**, select **Recurring**
4. Set **Monthly price:**
   - Amount: `59.00`
   - Billing period: `Monthly`
   - Click **Add another price**
5. Set **Annual price:**
   - Amount: `564.00`
   - Billing period: `Yearly`
6. Click **Save product**
7. Copy both price IDs:
   - Monthly → `STRIPE_PRICE_ELITE_MONTHLY`
   - Annual → `STRIPE_PRICE_ELITE_ANNUAL`

---

### 1.5 — Copy Your API Keys

1. In the left sidebar, click **Developers** → **API keys**
2. Copy the two keys:
   - **Publishable key** (starts with `pk_live_` or `pk_test_`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - **Secret key** (starts with `sk_live_` or `sk_test_`) → click **Reveal live key** → `STRIPE_SECRET_KEY`

> Keep your secret key private. Never commit it to Git.

---

### Price ID Summary Sheet

Fill this in as you go:

```
STRIPE_PRICE_STARTER_MONTHLY  = price_...
STRIPE_PRICE_STARTER_ANNUAL   = price_...
STRIPE_PRICE_PRO_MONTHLY      = price_...
STRIPE_PRICE_PRO_ANNUAL       = price_...
STRIPE_PRICE_ELITE_MONTHLY    = price_...
STRIPE_PRICE_ELITE_ANNUAL     = price_...

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_...
STRIPE_SECRET_KEY                  = sk_live_...
```

---

## Step 2 — Add Netlify Environment Variables

**Time: ~10 minutes**

### 2.1 — Open Netlify Site Settings

1. Go to [https://app.netlify.com](https://app.netlify.com)
2. Select your site: **app.gr8bux.com** (or whatever your site is named)
3. In the left sidebar, click **Site configuration** → **Environment variables**

---

### 2.2 — Add Each Variable

For each variable below, click **Add a variable** → enter the key and value → click **Save**.

Add all 10 variables:

| Variable | Value | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` | From Step 1.5 — never share this |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | From Step 1.5 — safe to expose |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | From Step 3 — come back to add this |
| `STRIPE_PRICE_STARTER_MONTHLY` | `price_...` | From Step 1.2 |
| `STRIPE_PRICE_STARTER_ANNUAL` | `price_...` | From Step 1.2 |
| `STRIPE_PRICE_PRO_MONTHLY` | `price_...` | From Step 1.3 |
| `STRIPE_PRICE_PRO_ANNUAL` | `price_...` | From Step 1.3 |
| `STRIPE_PRICE_ELITE_MONTHLY` | `price_...` | From Step 1.4 |
| `STRIPE_PRICE_ELITE_ANNUAL` | `price_...` | From Step 1.4 |

> **`STRIPE_WEBHOOK_SECRET`** — skip this for now and come back after Step 3.

---

### 2.3 — Set Variable Scope

When adding each variable, Netlify will ask which **deploy contexts** it applies to:

- For `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and all `STRIPE_PRICE_*` variables:
  - Select **All scopes** (or at minimum: **Production** + **Deploy Previews**)
- For `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`:
  - Select **All scopes**

---

### 2.4 — Trigger a Redeploy

After adding all variables:

1. Go to **Deploys** in the left sidebar
2. Click **Trigger deploy** → **Deploy site**
3. Wait for the deploy to finish (usually 2–3 minutes)
4. Verify the site is live at `https://app.gr8bux.com`

> Variables are only picked up after a fresh deploy. Skipping this step means the app will still use old/missing values.

---

### 2.5 — Add the Same Variables Locally

Update your `.env.local` file in the project root with the same values:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # fill in after Step 3
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
STRIPE_PRICE_ELITE_MONTHLY=price_...
STRIPE_PRICE_ELITE_ANNUAL=price_...
```

> Use `sk_test_` and `pk_test_` keys locally so you can test without charging real cards.

---

## Step 3 — Register the Stripe Webhook

**Time: ~5 minutes**

### 3.1 — Open Webhook Settings in Stripe

1. In the Stripe dashboard left sidebar, click **Developers** → **Webhooks**
2. Click **+ Add endpoint** (top right)

---

### 3.2 — Configure the Endpoint

Fill in the form:

- **Endpoint URL:**
  ```
  https://app.gr8bux.com/api/billing/webhook
  ```
- **Description:** `GR8BUX subscription sync`
- **Listen to:** `Events on your account`
- **Version:** leave as default (your account's current API version)

---

### 3.3 — Select Events to Listen To

Click **Select events** and search for and check each of these **5 events**:

| Event | Purpose |
|---|---|
| `checkout.session.completed` | User completes Stripe Checkout → activate their subscription |
| `customer.subscription.updated` | Plan change, trial end, renewal → update local DB |
| `customer.subscription.deleted` | Cancellation confirmed → downgrade to free |
| `invoice.payment_failed` | Payment declined → set `past_due` status |
| `invoice.payment_succeeded` | Payment recovered after failure → restore `active` status |

After selecting all 5, click **Add endpoint**.

---

### 3.4 — Copy the Webhook Signing Secret

1. After the endpoint is created, you'll be on its detail page
2. Under **Signing secret**, click **Reveal** (or **Click to reveal**)
3. Copy the value — it starts with `whsec_`
4. This is your `STRIPE_WEBHOOK_SECRET`

---

### 3.5 — Add the Webhook Secret to Netlify

1. Go back to Netlify → **Site configuration** → **Environment variables**
2. Find `STRIPE_WEBHOOK_SECRET` (you added a placeholder in Step 2.2)
3. Click **Edit** and paste the `whsec_...` value
4. Save
5. Trigger another deploy: **Deploys** → **Trigger deploy** → **Deploy site**

Also update your `.env.local` with the same value.

---

### 3.6 — Test the Webhook Locally (Optional but Recommended)

Install the Stripe CLI if you haven't already:

```bash
# Mac
brew install stripe/stripe-cli/stripe

# Windows (run in PowerShell as admin)
scoop install stripe
# or download from: https://github.com/stripe/stripe-cli/releases
```

Then forward events to your local dev server:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/billing/webhook
```

In a separate terminal, trigger test events:

```bash
# Test a full checkout flow
stripe trigger checkout.session.completed

# Test subscription update
stripe trigger customer.subscription.updated

# Test payment failure
stripe trigger invoice.payment_failed
```

You should see `200 OK` responses in the `stripe listen` output. Check your Supabase `subscriptions` table to confirm the rows are being written.

---

## Step 4 — Verify End-to-End (Test Mode)

Run through this checklist before going live:

### Checkout flow
- [ ] Visit `/pricing` while signed in
- [ ] Click **Start 7-Day Free Trial** on the Pro card
- [ ] You are redirected to Stripe Checkout
- [ ] Use test card `4242 4242 4242 4242`, any future expiry, any CVC
- [ ] Complete checkout → you are redirected to `/billing?session_id=...`
- [ ] Your plan on `/billing` now shows **Pro** (may take a few seconds for webhook to fire)
- [ ] The usage meters show correct limits for Pro

### Stripe Portal
- [ ] On `/billing`, click **Manage billing →**
- [ ] You are redirected to Stripe Customer Portal
- [ ] You can see your subscription, invoice, and payment method
- [ ] Cancel from the portal → your plan reverts to Free within ~30 seconds

### API gate test
- [ ] Sign in with a Free account
- [ ] Try to send a message in Trade Coach
- [ ] You should receive a `403 upgrade_required` response (or see an upgrade prompt if you add it to the UI)

### Webhook delivery
- [ ] In Stripe dashboard → **Developers** → **Webhooks** → click your endpoint
- [ ] You should see recent events with green `200` status codes
- [ ] If you see failures, check Netlify function logs: **Netlify** → **Functions** → search for errors

---

## Step 5 — Switch to Live Mode

Once all tests pass in Test mode:

1. In Stripe dashboard, flip the toggle from **Test** to **Live** (top left)
2. Repeat Steps 1.2–1.5 in Live mode to get Live price IDs and API keys
3. Update all Netlify env vars with the Live values (replace `sk_test_` with `sk_live_`, etc.)
4. Create a new Live webhook endpoint (same URL, same 5 events) — new `whsec_` secret
5. Update `STRIPE_WEBHOOK_SECRET` in Netlify with the Live webhook secret
6. Trigger one final deploy
7. Test with a real card (use a $1 plan or a 100% off coupon to avoid actual charges)

---

## Troubleshooting

### Webhook returns 400 "Signature verification failed"
- The `STRIPE_WEBHOOK_SECRET` in Netlify doesn't match the endpoint's signing secret
- Double-check you copied the secret from the correct endpoint (Test vs Live)
- Re-reveal the secret in Stripe and copy it fresh

### Webhook returns 500
- Check Netlify function logs for the actual error
- Most common causes: Supabase `SUPABASE_SERVICE_ROLE_KEY` not set, or a DB column mismatch

### Plan not updating after checkout
- The webhook may not have fired or failed silently
- Check Stripe → Webhooks → your endpoint → **Recent deliveries** tab
- Click the failed event and use **Resend** to retry it

### "No billing account found" error on Manage billing
- The user never completed a checkout, so no Stripe customer exists yet
- This is expected for Free users — the portal button is hidden for them

### Price not configured error
- A `STRIPE_PRICE_*` env var is missing or set to an empty string
- Verify all 6 price vars are set in Netlify and a fresh deploy was triggered

---

## Environment Variable Reference

Complete list of all Stripe-related variables:

```env
# Stripe API keys (get from Stripe → Developers → API keys)
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Webhook signing secret (get from Stripe → Developers → Webhooks → your endpoint)
STRIPE_WEBHOOK_SECRET=whsec_...

# Price IDs for each plan × billing cycle (get from Stripe → Product catalog)
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_STARTER_ANNUAL=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
STRIPE_PRICE_ELITE_MONTHLY=price_...
STRIPE_PRICE_ELITE_ANNUAL=price_...
```
