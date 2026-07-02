# GR8BUX Pricing Page — Update Spec

This document defines the correct pricing tiers for **gr8bux.com/pricing** to match the live app at **app.gr8bux.com**.

> **What changed vs. the current gr8bux.com pricing page:**
> - 4 tiers now (Free, Starter, Pro, Elite) — Starter is new
> - Elite price is **$59/mo** (currently shown as $79 on the site — fix this)
> - Annual billing option with ~20% savings
> - Feature details updated throughout

---

## Billing Toggle

The pricing page should have a **Monthly / Annual** toggle (default: Monthly).
When Annual is selected, show the per-month equivalent price with the total billed annually shown below.
Show a **"-20%"** or **"Save 20%"** badge next to the Annual option.

---

## Tiers

### 1. Free — $0 / month

**Tagline:** Try the platform with no commitment.

**Price display:** $0 / month (no toggle needed — always free)

**Features:**
- Basic trade journal
- Up to 50 trades
- 10 watchlist symbols
- Community scanners (view only)
- Web access

**Not included (locked):**
- AI coaches
- Stock Scanner (full)
- Options Builder
- LEAPS Advisor
- Greeks Calculator
- CSV export
- Insider tracking
- AI trade analyses

**CTA button:** "Get started free" → https://app.gr8bux.com/auth/signup

---

### 2. Starter — $12 / month · $9 / month billed annually ($108/yr)

**Tagline:** AI coaching for traders getting serious.

**Price display:**
- Monthly: **$12** / month
- Annual: **$9** / month (billed $108/year)

**Features:**
- Everything in Free
- Unlimited trades
- 25 watchlist symbols
- **Trade Coach** — 30 messages / month
- **Stock Coach** — 20 messages / month
- **Options Coach** — 20 messages / month
- Stock Scanner
- AI trade analyses

**Not included (locked):**
- LEAPS Advisor
- Greeks Calculator
- Options Builder
- CSV export
- Insider tracking

**CTA button:** "Start 7-day free trial" → https://app.gr8bux.com/auth/signup?plan=starter

---

### 3. Pro — $29 / month · $23 / month billed annually ($276/yr)

**Tagline:** For active stock & options traders.

**Badge:** "Most popular"

**Price display:**
- Monthly: **$29** / month
- Annual: **$23** / month (billed $276/year)

**Features:**
- Everything in Starter
- Unlimited watchlist symbols
- **Trade Coach** — 200 messages / month
- **Stock Coach** — 100 messages / month
- **Options Coach** — 100 messages / month
- **LEAPS Advisor** — 50 queries / month
- Greeks Calculator
- Options Builder
- CSV export
- AI trade analyses

**Not included (locked):**
- Insider tracking

**CTA button:** "Start 7-day free trial" → https://app.gr8bux.com/auth/signup?plan=pro

---

### 4. Elite — $59 / month · $47 / month billed annually ($564/yr)

**Tagline:** Unlimited firepower.

**Price display:**
- Monthly: **$59** / month
- Annual: **$47** / month (billed $564/year)

**Features:**
- Everything in Pro
- **Unlimited** Trade Coach messages
- **Unlimited** Stock Coach messages
- **Unlimited** Options Coach messages
- **Unlimited** LEAPS Advisor queries
- Insider tracking
- Priority support

**CTA button:** "Start 7-day free trial" → https://app.gr8bux.com/auth/signup?plan=elite

---

## Feature Comparison Table

| Feature | Free | Starter | Pro | Elite |
|---|:---:|:---:|:---:|:---:|
| Trade journal | ✓ | ✓ | ✓ | ✓ |
| Trades logged | 50 | Unlimited | Unlimited | Unlimited |
| Watchlist symbols | 10 | 25 | Unlimited | Unlimited |
| AI trade analyses | — | ✓ | ✓ | ✓ |
| Stock Scanner | — | ✓ | ✓ | ✓ |
| Trade Coach (msgs/mo) | — | 30 | 200 | Unlimited |
| Stock Coach (msgs/mo) | — | 20 | 100 | Unlimited |
| Options Coach (msgs/mo) | — | 20 | 100 | Unlimited |
| LEAPS Advisor (queries/mo) | — | — | 50 | Unlimited |
| Greeks Calculator | — | — | ✓ | ✓ |
| Options Builder | — | — | ✓ | ✓ |
| CSV export | — | — | ✓ | ✓ |
| Insider tracking | — | — | — | ✓ |
| Priority support | — | — | — | ✓ |

---

## Annual Pricing Summary

| Plan | Monthly price | Annual price | Annual total | Savings |
|---|---|---|---|---|
| Free | $0 | $0 | $0 | — |
| Starter | $12/mo | $9/mo | $108/yr | $36/yr |
| Pro | $29/mo | $23/mo | $276/yr | $72/yr |
| Elite | $59/mo | $47/mo | $564/yr | $144/yr |

---

## Notes for the Developer

- All paid plan CTAs link to `https://app.gr8bux.com/auth/signup?plan=<planId>` where planId is `starter`, `pro`, or `elite`
- Free CTA links to `https://app.gr8bux.com/auth/signup` (no plan param)
- The `?plan=` param triggers Stripe Checkout automatically after signup
- The 7-day free trial is applied via Stripe — no credit card shown upfront in Checkout
- "Most popular" badge goes on **Pro** only
