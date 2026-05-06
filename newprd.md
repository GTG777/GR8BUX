# gr8bux — Product Requirements Document
## Beginner Trader Workflow Platform

**Version:** 2.0  
**Date:** May 6, 2026  
**Status:** Draft  

---

## Vision

Transform gr8bux from a data + tools platform into a **daily trading workflow assistant** for beginner traders.

> *"gr8bux is a daily trading buffet — the AI cooks, you pick, and every meal teaches you something about your own appetite."*

---

## The Buffet Model — Core Product Philosophy

This is the foundational metaphor that drives every product decision.

```
The buffet is set every morning by the AI
     ↓
AI cooked everything overnight (algorithms ran, plans built)
     ↓
User walks in, sees what's available today
     ↓
Picks what appeals to them (clicks Trade This)
     ↓
Eats (confirms the trade)
     ↓
AI watches what they ate, how it went, notes it down
     ↓
Tomorrow's buffet is informed by yesterday's experience
     ↓
Over time — the buffet gets personalized to that user
```

**The user never goes to the kitchen. They never cook. They just decide and eat.**

The AI does the heavy lifting. The user makes the decision. Every decision teaches the system something. Over time the user develops a real trading style — without ever reading a book or taking a course. They learn on the run, through structured repetition, with the AI as their silent coach.

---

## Strategic Context

Beginner traders don't pay for more indicators or fancy dashboards. They pay for:
1. **Clarity** — What matters today?
2. **Confidence** — What should I do?
3. **Safety** — How do I not lose money?

This PRD defines five phases that address each in sequence, using assets already in the gr8bux codebase wherever possible.

---

## The Complete User Flow

```
Open gr8bux
     ↓
See: Market is Risk-On today ✅           (Question 1 — answered automatically)
     ↓
See: 6 setups ranked by AI score          (Question 2 — answered automatically)
     ↓
Click the one that looks interesting
     ↓
See: Full trade plan already built         (Question 3 — answered automatically)
     ↓
Check 4 boxes → Confirm
     ↓
Risk dashboard updates: 1 trade, $480 at risk (1.9%)
     ↓
Done. Go live your life.
```

Total time: under 5 minutes. Zero manual research. Zero ticker searching. Zero indicator reading.

---

## The Four Learning Loops

These run simultaneously and automatically. The user participates in all four without any extra effort.

### Loop 1 — Daily (The Buffet)
```
AI scans → table populated → user picks → trade confirmed
```
Cycle: every morning before market open

### Loop 2 — Intraday (The Kitchen Updates)
```
Market moves → algorithms re-score → table updates every 15min
Setup that was #4 at 9:30am might be #1 by 10:15am
```
Cycle: every 15 minutes during market hours, every 60 minutes outside market hours

### Loop 3 — Evening (The Debrief)
```
Market closes → AI reviews every trade the user confirmed today
Compares: planned entry vs actual, planned stop vs what happened
Generates 3-line debrief: "You followed your plan. NVDA hit target. AMD stopped out cleanly."
```
Cycle: every evening at 4:30pm ET

### Loop 4 — Weekly (The Retrospective)
```
Friday evening → AI generates weekly review
Win rate, R:R achieved vs planned, best setup type, one pattern to watch
"You do better on Tuesday–Wednesday. Your Thursday trades have lost 4 weeks in a row."
```
Cycle: every Friday at 5pm ET

---

## The Live Scanner Table — Core UI Component

This replaces the Morning Brief "Stocks In Play" card list. It is the central surface of the entire product. Every row is a complete, AI-built trade idea. The user's only job is to evaluate and select.

### What the Table Looks Like

| # | Symbol | Catalyst | Setup | Entry | Stop | Target | R:R | AI Score | Action |
|---|---|---|---|---|---|---|---|---|---|
| 1 | NVDA | Earnings AMC | Breakout | $878 | $861 | $912 | 1:2.1 | 87/100 | → Trade This |
| 2 | UBER | Analyst Upgrade | Pullback to support | $74.20 | $71.80 | $80.50 | 1:2.6 | 82/100 | → Trade This |
| 3 | AMD | Volume Spike 3.1x | Bull flag | $122 | $118 | $132 | 1:2.5 | 78/100 | → Trade This |
| 4 | AAPL | Strong Bull trend | VWAP reclaim | $190 | $187 | $196 | 1:2.0 | 71/100 | → Trade This |

Each row is a complete trade idea. The AI already ran TechnicalSetups + RiskManager on every one. The user reads across the row and decides.

### The AI Score Formula

The score is transparent — not a black box:

```
Catalyst weight        (earnings > upgrade > volume > trend)
Technical quality      (TechnicalSetups confidence score)
Risk/Reward ratio      (min 1:1.5 to appear in table at all)
Trend alignment        (trendScore from screener)
RSI position           (not overbought at entry)
Volume confirmation    (volumeRatio)
VIX environment        (suppress low-quality setups in extreme fear)
User history weight    (over time: user's personal win rate on this setup type)
```

Setups with R:R below 1:1.5 or no definable stop are excluded entirely. The user only sees setups worth considering.

### Algorithm Pipeline (Server-Side)

Multiple algorithms run in parallel. A stock can be nominated by more than one — that increases its score (confluence).

```
AlgorithmA: Breakout scanner     (volume + price above resistance)
AlgorithmB: Pullback scanner     (trend intact + RSI cooling)
AlgorithmC: Earnings play        (catalyst + expected move + IVR)
AlgorithmD: VWAP reclaim         (below VWAP → reclaims → momentum)
AlgorithmE: Gap + hold           (pre-market gap + holds first 15min)
```

New algorithms can be added at any time without changing the UI. The table always shows the same columns.

### Data Refresh Schedule

| Time Window | Refresh Rate | What Updates |
|---|---|---|
| 9:30am–4:00pm ET | Every 15 min | Full re-scan — prices, volume, setups, scores |
| 4:00pm–8:00pm ET | Every 60 min | Post-market moves, earnings results |
| 8:00pm–4:00am ET | Every 60 min | Overnight gaps forming, futures direction |
| 4:00am–9:30am ET | Every 15 min | Pre-market ramp-up — highest value window |

The browser polls Supabase every 60 seconds. If the screen stays on, the table stays live. Always current to within 15 minutes.

---

## Phase 1 — The Morning Brief + Live Scanner Table

### Epic Summary
A single unified page that answers the two most important pre-market questions — "What is the market doing?" and "What stocks have a reason to move today?" — in under 60 seconds, before market open. The centerpiece is the AI-built scanner table where every row is a complete, actionable trade idea.

### Problem Statement
Currently, a beginner visiting gr8bux must visit MacroBar, the Earnings page, TopMovers, TalkOfTown, and the Market Screener separately to assemble a picture of the day. Most won't. They leave confused or trade without context. Even if they do assemble the picture, they still have to figure out what to do with it. The scanner table solves both problems: the AI does the research and builds the plan, the user just decides.

---

### User Story 1.1 — Market Pulse Summary

**As a** beginner trader opening gr8bux before market hours,  
**I want to** see the overall market condition in a single glance,  
**So that** I can immediately decide whether today is a good day to trade or to sit out.

**Acceptance Criteria:**
- [ ] A "Market Pulse" section appears at the top of the Morning Brief page
- [ ] Shows S&P 500 pre-market change % with a color-coded status (green = up, red = down)
- [ ] Shows VIX current value with a plain-English regime label: "Low Volatility", "Elevated", "Extreme Fear"
- [ ] Shows 10-year Treasury yield with a directional indicator
- [ ] Shows a single top-level risk regime badge: "Risk-On ✅", "Risk-Off ⚠️", or "Neutral"
- [ ] Data refreshes automatically every 10 minutes
- [ ] If data is stale (>15 min), a warning indicator is shown
- [ ] The entire section renders in under 2 seconds on a standard connection
- [ ] All values are readable without hovering — no data hidden in tooltips for core metrics

**Technical Notes:**
- Reuse `MacroBar` data from `/api/market/macro` (already caches VIX, SPY, TNX)
- Risk regime logic already computed in `Dashboard/Dashboard.tsx` — extract as shared util
- Pre-market SPY change serves as futures proxy until a dedicated futures API is added

**Out of Scope (Phase 1):**
- Live ES/NQ futures (Phase 2 enhancement)
- Macro events calendar (Story 1.3)

---

### User Story 1.2 — AI Scanner Table (Stocks In Play)

**As a** beginner trader who doesn't know what to watch or trade,  
**I want to** see a ranked table of AI-built trade ideas with entry, stop, target, and score already calculated,  
**So that** I can simply evaluate and select rather than research from scratch.

**Acceptance Criteria:**
- [ ] The scanner table shows 4–10 rows, each representing a complete trade idea
- [ ] Each row shows: Rank, Symbol, Catalyst, Setup type, Entry price, Stop loss, Target price, R:R ratio, AI Score (0–100), "Trade This" button
- [ ] Rows are sorted by AI Score descending by default; user can re-sort by R:R or Catalyst
- [ ] Each row has an expandable detail panel showing: why the algorithm flagged it, key technical levels, RSI, volume ratio, and the plain-English reasoning
- [ ] Rows with R:R below 1:1.5 never appear in the table
- [ ] The table shows a "Last updated" timestamp and a live countdown to the next refresh
- [ ] A "Market Context" banner above the table shows the current regime: "Risk-On — Full table available" / "Risk-Off — Only 2 high-confidence setups shown" / "Extreme Volatility — Table suppressed. Consider sitting out today."
- [ ] If no setups meet quality threshold, the table shows: "AI found no high-quality setups today. Market conditions may not favor trading."
- [ ] Clicking "Trade This" on any row opens the TradeForm wizard with that row's data pre-filled
- [ ] Table updates automatically every 60 seconds by polling Supabase — no manual refresh needed
- [ ] On mobile, the table collapses to cards (one per setup) that are swipeable

**Technical Notes:**
- A new Netlify background function `intraday-scan-setups.ts` runs every 15min (market hours) / 60min (off-hours)
- Function fetches ~50 candidate symbols, runs all algorithms, calls TechnicalSetups agent on passing candidates, writes top results to `setup_scans` Supabase table
- Browser polls `/api/market/setups` every 60s — returns cached results from `setup_scans` table
- Algorithms run in parallel per symbol; confluence (multiple algorithms flagging same symbol) boosts score
- Earnings data, screener volume ratio, news service, and TechnicalSetups agent are all existing — this function orchestrates them
- Limit to 10 rows maximum in the UI; full results stored in DB for analytics

---

### User Story 1.3 — Today's Macro Events

**As a** beginner trader,  
**I want to** see scheduled economic events happening today,  
**So that** I know when volatility could spike unexpectedly and can avoid being in a trade at the wrong time.

**Acceptance Criteria:**
- [ ] A "Today's Events" section lists economic releases scheduled for the current trading day
- [ ] Each event shows: time (in user's local timezone), event name, and impact level (High / Medium / Low) color-coded
- [ ] High-impact events (Fed decisions, CPI, NFP, FOMC) are displayed with a red "⚠️ High Impact" badge
- [ ] Events that have already passed today are shown in a muted/strikethrough style
- [ ] If there are no events today, the section shows "No major macro events scheduled today"
- [ ] A plain-English tooltip on each event explains what it is (e.g., "FOMC Minutes — The Federal Reserve releases notes from its last interest rate meeting. Can cause sharp market moves.")

**Technical Notes:**
- Use a free economic calendar API (e.g., Tradier, or a static weekly data file refreshed via nightly Netlify function)
- Initial implementation can use a hardcoded weekly schedule refreshed by a nightly function — fully dynamic API can come in Phase 2
- Store in Supabase with a `macro_events` table: `(date, time_utc, event_name, impact, description)`

---

### User Story 1.4 — Morning Brief as Home Page

**As a** beginner trader who opens gr8bux each morning,  
**I want to** land directly on the Morning Brief,  
**So that** my workflow starts immediately without navigating through menus.

**Acceptance Criteria:**
- [ ] The Morning Brief is the default landing page at `/` (or `/morning`) for authenticated users
- [ ] The page shows a timestamp: "Last updated: 8:14am · Market opens in 1h 22m" (countdown to 9:30am ET)
- [ ] A "Refresh" button allows manual data reload
- [ ] The page is fully responsive and usable on mobile (beginners often trade from phones)
- [ ] Page title in browser tab reads: "gr8bux — Morning Brief · May 6"
- [ ] Navigation to other tools (Screener, Earnings, Watchlist) is available from the page but not dominant

---

## Phase 2 — Pre-Trade Checklist (TradeForm Wizard)

### Epic Summary
Replace the current placeholder TradeForm with a structured 4-step wizard that forces the beginner to define their complete trade plan — entry, stop, target, and risk — before logging a trade. The wizard is powered by existing gr8bux AI agents on the backend.

### Problem Statement
The current TradeForm is explicitly marked "under development" and is a placeholder with no stop loss, no profit target, and no risk fields. This is the most critical gap in the platform. Beginners who skip defining a stop loss and position size are the ones who blow up accounts. The backend agents (TechnicalSetups, RiskManager, TradeStrategist) already generate this data — they just have no front-end surface.

---

### User Story 2.1 — Step 1: Trade Setup Entry

**As a** beginner trader who has spotted a potential trade,  
**I want to** enter the basic details of what I'm thinking of trading,  
**So that** the platform can help me build a complete plan around it.

**Acceptance Criteria:**
- [ ] Step 1 of the wizard collects: Symbol (text input with autocomplete), Trade Direction (Long / Short), Trade Type (Stock / Call Option / Put Option / LEAPS)
- [ ] An optional "Why are you trading this?" dropdown with preset reasons: Earnings Catalyst, Technical Breakout, Analyst Upgrade, Sector Momentum, News Catalyst, Other
- [ ] On symbol entry, the current price is fetched and displayed in real-time
- [ ] If the symbol has a same-day earnings event, a yellow warning banner appears: "⚠️ NVDA reports earnings today after close. This increases risk significantly."
- [ ] User cannot proceed to Step 2 without entering Symbol, Direction, and Trade Type
- [ ] A "Cancel" button is available at all steps and returns to the previous screen without saving

---

### User Story 2.2 — Step 2: AI-Powered Trade Plan

**As a** beginner trader who knows what I want to trade but not exactly where to enter,  
**I want to** get a suggested entry price, stop loss, and profit target based on technical analysis,  
**So that** I have a structured plan instead of guessing.

**Acceptance Criteria:**
- [ ] Step 2 calls the TechnicalSetups API with the selected symbol and displays the suggested plan
- [ ] Displays: Entry Price, Stop Loss (with the reason, e.g., "below key support at $861"), Target Price, Risk/Reward ratio
- [ ] If R/R is below 1:1, a red warning reads: "⚠️ This setup has unfavorable risk/reward. Consider waiting for a better entry."
- [ ] User can **accept** the AI-suggested values or **manually override** each field
- [ ] Overriding a value shows a subtle "edited" tag on that field
- [ ] If the AI cannot generate a plan (insufficient data), fields default to empty with placeholder text and a note: "AI couldn't find a setup. Enter your levels manually."
- [ ] A loading skeleton is shown while the API call completes — Step 2 should not feel broken while loading
- [ ] The RSI and trend score for the symbol are shown as context beneath the plan

---

### User Story 2.3 — Step 3: Position Sizing Calculator

**As a** beginner trader who doesn't know how many shares or contracts to buy,  
**I want to** be shown exactly how many units to trade based on my account size and risk tolerance,  
**So that** I never accidentally risk more than I can afford to lose.

**Acceptance Criteria:**
- [ ] Step 3 shows a position sizing calculator powered by the RiskManager agent
- [ ] User inputs (persisted in user profile after first entry): Account Size ($), Max Risk Per Trade (% selector: 1% / 2% / 3% / Custom)
- [ ] Calculator displays: Max dollar risk for this trade, Recommended number of shares/contracts, Total estimated cost, Max loss if stop is hit
- [ ] If the calculated max loss exceeds the selected risk %, a red block reads: "⛔ This position risks $740 (2.96% of account). Reduce to 2 contracts to stay within your limit."
- [ ] A green confirmation block shows when sizing is within limit: "✅ 2 contracts risks $480 (1.92% of account)"
- [ ] If account size has not been set, a prompt appears to enter it — with a note explaining why it matters
- [ ] Account size and risk % preference are saved to user profile (not re-entered every time)
- [ ] The user can proceed with any sizing, but a warning persists if they are over the recommended limit

---

### User Story 2.4 — Step 4: Pre-Trade Confirmation Checklist

**As a** beginner trader about to enter a trade,  
**I want to** confirm I've thought through the key decision points,  
**So that** I don't enter a trade on impulse without a plan.

**Acceptance Criteria:**
- [ ] Step 4 displays a summary of the complete trade plan: Symbol, Direction, Type, Entry, Stop, Target, R/R, Contracts, Max Loss
- [ ] Below the summary, a checklist of 4 required checkboxes:
  - [ ] "I have a specific reason for entering this trade"
  - [ ] "My stop loss is defined and I will honor it"
  - [ ] "I know my maximum loss on this trade: $[amount]"
  - [ ] "I am not sizing up to 'make back' a previous loss"
- [ ] The "Log Trade" button is **disabled** until all 4 boxes are checked
- [ ] Checking all boxes and clicking "Log Trade" saves the trade to the database with all plan fields (entry, stop, target, risk %, contracts)
- [ ] After logging, the user sees a confirmation screen: "Trade logged. You're in control." with a link to view the trade in TradeList
- [ ] If the user abandons the wizard midway, no trade is saved (no partial records)

---

### User Story 2.5 — Access Pre-Trade Wizard from Morning Brief

**As a** beginner trader who sees a stock in the Morning Brief,  
**I want to** start a trade plan for it with one click,  
**So that** the workflow from "opportunity spotted" to "trade logged" is seamless.

**Acceptance Criteria:**
- [ ] Each stock card on the Morning Brief has a "Plan This Trade" button
- [ ] Clicking it opens the TradeForm wizard with the symbol pre-filled
- [ ] The trade type defaults to Stock but is editable
- [ ] The catalyst from the Morning Brief (e.g., "Earnings Today") is pre-selected in the "Why are you trading this?" field

---

## Phase 3 — Risk Dashboard

### Epic Summary
Surface a real-time risk snapshot that shows beginners their current daily exposure, keeps them from overtrading, and builds trust through transparency. Uses existing trade log data and RiskManager logic.

### Problem Statement
Beginners who lose money don't lose it on one bad trade — they lose it by making 5–6 trades in a panic, oversizing, and chasing losses. A risk dashboard that shows "you've already risked 3.7% today" stops the spiral. This data exists in the trade logs; it just isn't surfaced.

---

### User Story 3.1 — Daily Risk Snapshot Widget

**As a** beginner trader mid-session,  
**I want to** see how much of my account I've put at risk today,  
**So that** I know when to stop trading for the day.

**Acceptance Criteria:**
- [ ] A "Today's Risk" widget appears on the Morning Brief page and the main Dashboard
- [ ] Displays: Number of trades logged today, Total capital at risk across open trades (sum of max loss values), Realized P&L for the day, Risk used as % of account
- [ ] A color-coded risk bar: Green (0–2%), Amber (2–3%), Red (>3%)
- [ ] When risk exceeds 3%, a persistent banner reads: "⚠️ You've risked 3.2% of your account today. Consider sitting out the next setup."
- [ ] When risk exceeds 5%, the banner escalates: "🛑 Daily risk limit reached. Most professional traders stop here."
- [ ] The widget updates in real-time as trades are logged
- [ ] Clicking the widget navigates to the full Risk Dashboard page

---

### User Story 3.2 — Trade History with Plan vs. Reality

**As a** beginner trader reviewing my performance,  
**I want to** see whether I followed my own plan on each trade,  
**So that** I can identify patterns in where I'm going wrong.

**Acceptance Criteria:**
- [ ] The TradeList shows logged trades with the planned entry, stop, and target alongside the actual exit
- [ ] A "Plan Adherence" column shows: ✅ Honored stop / ⚠️ Moved stop / ❌ No plan set
- [ ] Trades with no stop loss set are flagged with a red "No Plan" badge
- [ ] Trades where the actual loss exceeded the planned max loss are highlighted in red
- [ ] A weekly summary card shows: "This week: 7 trades, 5 with plans, 2 stops honored out of 3 losers"
- [ ] Filter options: All Trades / Planned Only / No Plan / Winners / Losers

---

### User Story 3.3 — Risk Settings Page

**As a** beginner trader setting up gr8bux for the first time,  
**I want to** set my account size and daily risk limits,  
**So that** all risk calculations throughout the platform are accurate.

**Acceptance Criteria:**
- [ ] A "Risk Settings" page (accessible from Profile or Settings) allows entry of:
  - Account size ($)
  - Max risk per trade (% — default 2%)
  - Daily max risk (% — default 5%)
  - Max trades per day (integer — default 5)
- [ ] Settings are saved to the user's profile in Supabase
- [ ] A first-time setup prompt appears for new users who haven't set an account size before they can access the TradeForm wizard
- [ ] Settings can be updated at any time
- [ ] A brief explanation is shown next to each setting explaining why it matters (e.g., "2% per trade means a string of 10 consecutive losses only loses 20% of your account")

---

### User Story 3.4 — Weekly Performance Summary (Email or In-App)

**As a** beginner trader at the end of the week,  
**I want to** receive a summary of my trading activity and risk behavior,  
**So that** I can learn from patterns over time without manually analyzing my trade log.

**Acceptance Criteria:**
- [ ] A weekly summary is generated every Friday at 5pm ET
- [ ] Summary includes: Total trades, Win rate, Average R/R achieved vs. planned, Total P&L, Risk discipline score (% of trades with a defined stop)
- [ ] Delivered in-app as a notification/card on the Dashboard
- [ ] (Phase 3 stretch) Delivered via email to registered users who opt in
- [ ] A "Your best trade this week" and "Your worst mistake this week" are highlighted with a one-line AI-generated insight (e.g., "You exited NVDA at target — great discipline." / "AMD loss was 2x your planned max — stop was moved.")

---

## Phase 4 — Monetization Gate

### Epic Summary
Introduce a Free / Pro tier split that gates the highest-value workflow features behind a subscription. The free tier demonstrates value clearly; Pro removes the friction points that cost beginners money.

---

### User Story 4.1 — Free vs. Pro Feature Tier

**As a** potential paying customer,  
**I want to** use the core platform for free and clearly understand what I get with Pro,  
**So that** I can make an informed decision to upgrade when the value is clear.

**Acceptance Criteria:**
- [ ] Free tier includes:
  - Morning Brief — limited to 3 stocks in play per day
  - Pre-trade wizard — manual entry only (no AI auto-fill of entry/stop/target)
  - Risk dashboard — today's data only
  - AI coaching panels — 5 queries per day
  - Earnings calendar — view only (no strategy tags or expected move %)
- [ ] Pro tier ($29/month) includes:
  - Morning Brief — unlimited stocks in play + full catalyst details
  - Pre-trade wizard — AI auto-fill from TechnicalSetups + RiskManager agents
  - Risk dashboard — full 90-day history + weekly performance summaries
  - AI coaching panels — unlimited queries
  - Earnings calendar — full strategy tags, expected moves, IVR analysis
  - Real-time alerts (Phase 5)
- [ ] Free users see Pro features with a blurred/locked overlay and a "Upgrade to Pro" prompt
- [ ] The upgrade prompt includes a single clear value statement, not a feature list (e.g., "Pro builds your trade plan in seconds — so you stop guessing entries.")
- [ ] A 7-day free trial of Pro is available on signup — no credit card required

---

### User Story 4.2 — Upgrade Flow

**As a** free user who hit a paywall,  
**I want to** upgrade to Pro quickly and with confidence,  
**So that** I don't lose momentum when I'm in the middle of my morning workflow.

**Acceptance Criteria:**
- [ ] Clicking any locked Pro feature opens an upgrade modal (not a redirect to a separate page)
- [ ] Modal shows: price, 3 key benefits, free trial offer, and a single CTA button
- [ ] Payment handled via Stripe (or existing payment provider)
- [ ] After successful payment, Pro features unlock immediately without requiring a page reload
- [ ] A confirmation email is sent with a receipt and a "Getting Started with Pro" guide
- [ ] Cancellation is self-serve from the Settings page — no support ticket required

---

## Phase 6 — Trade Journal Intelligence (The Learning Engine)

### Epic Summary
The retrospective layer that turns every trade into a learning signal. The AI reads the trade log nightly, finds patterns in the user's behavior, and surfaces personalized insights — without the user having to do any journaling or self-analysis. This is the compounding engine: the more a user trades on gr8bux, the smarter the platform becomes about that specific user.

### Problem Statement
Most trading journals require users to manually write notes and self-diagnose. Most beginners don't do it. This system does it automatically by comparing the planned trade (logged at confirm) against the actual outcome (logged at exit), and running pattern analysis across all historical trades.

---

### User Story 6.1 — Evening Trade Debrief

**As a** beginner trader who confirmed trades today,  
**I want to** receive a short AI-generated debrief after market close,  
**So that** I understand how today's trades went against my plan without having to analyze it myself.

**Acceptance Criteria:**
- [ ] At 4:30pm ET each trading day, a nightly function generates a debrief for each user who confirmed at least one trade that day
- [ ] Debrief appears as an in-app notification and on the Dashboard
- [ ] Debrief is 3–5 lines maximum — short, specific, actionable
- [ ] Example content: "You confirmed 2 trades today. NVDA hit your target at $912 — plan followed perfectly. AMD stopped out at $118 — exactly where you planned. Win rate today: 1/2. R:R achieved: 1.8 average."
- [ ] If a trade has no exit logged yet (still open), debrief notes: "AMD is still open — remember your stop is at $118"
- [ ] If stop was moved or plan was deviated from, the debrief flags it: "⚠️ You moved your AMD stop from $118 to $114 after entry — this is worth reviewing"
- [ ] User can tap any trade in the debrief to open its full detail view

**Technical Notes:**
- Extend existing `nightly-refresh-ai-analyses.ts` pattern
- Compare `planned_stop`, `planned_entry`, `planned_target` fields (written at Confirm) against `actual_exit`, `actual_pnl` fields (written at trade close)
- Use Claude to generate the natural language debrief from structured trade data

---

### User Story 6.2 — Weekly Retrospective

**As a** beginner trader at the end of the week,  
**I want to** receive an AI-generated summary of my trading patterns this week,  
**So that** I can identify what I'm doing well and what to improve — without spending hours in a spreadsheet.

**Acceptance Criteria:**
- [ ] Every Friday at 5pm ET, a weekly retrospective is generated for each active user
- [ ] Retrospective includes: total trades, win rate, average R:R achieved vs planned, total P&L, plan adherence rate (% of trades with stop defined and honored)
- [ ] One "strength" insight highlighted in green: "You're executing breakout setups well — 4/5 winners this week"
- [ ] One "watch" insight highlighted in amber: "You held losers 2.3x longer than winners this week — consider honoring stops faster"
- [ ] A personal pattern note if detected: "Your Friday trades have underperformed 3 weeks in a row. Consider lighter sizing or no trading on Fridays."
- [ ] Displayed as a card on the Dashboard and optionally sent via email
- [ ] Retrospective is stored and viewable in a "My History" section (last 12 weeks)

---

### User Story 6.3 — Personalized Scanner Weighting

**As a** beginner trader who has been using gr8bux for 30+ days,  
**I want to** the scanner table to reflect my personal track record on different setup types,  
**So that** the AI surfaces more of what works for me and warns me about what doesn't.

**Acceptance Criteria:**
- [ ] After 10+ confirmed trades, the system begins calculating per-user win rates by setup type
- [ ] Setup types tracked: Breakout, Pullback, Earnings Play, VWAP Reclaim, Gap+Hold
- [ ] In the scanner table, a personal performance badge appears next to each row's setup type: "Your breakouts: 71% ✅" or "Your earnings plays: 28% ⚠️"
- [ ] The AI Score for each row is subtly adjusted for that user: setup types where the user has strong history get a small score boost; types where they have poor history get a small score reduction
- [ ] A user can view their full personal stats by setup type in the Risk/Analytics dashboard
- [ ] Before 10 trades, the personalization layer is inactive — generic scoring applies

**Technical Notes:**
- Add `user_setup_stats` table in Supabase: `(user_id, setup_type, trades, wins, avg_rr)`
- Nightly function updates this table from trade log
- Scanner API reads user stats at query time and applies personal weight multiplier (±10% max to avoid over-fitting on small samples)

---

### User Story 6.4 — Behavioral Pattern Alerts

**As a** beginner trader who is developing bad habits without realizing it,  
**I want to** be alerted when the AI detects a recurring destructive pattern in my trading,  
**So that** I can correct it before it costs me significant money.

**Acceptance Criteria:**
- [ ] System detects and flags the following behavioral patterns automatically:
  - Revenge trading: 3+ trades in 1 hour after a loss
  - Oversizing: position risk > 2x personal max risk setting, 3+ times in a week
  - Stop moving: planned stop adjusted after entry, detected 3+ times in a month
  - Overtrading: exceeds max daily trade count 3+ days in a week
  - Winner cutting: avg exit before 50% of target reached, detected over 5+ trades
- [ ] When a pattern is detected, a notification appears: "⚠️ Pattern Detected: You've moved your stop after entry 4 times this month. This turns planned losses into larger losses. Review your AMD, TSLA, and NVDA trades."
- [ ] Notification links to the specific trades where the pattern occurred
- [ ] User can dismiss the alert but it reappears if the pattern continues
- [ ] Available on Pro tier only

---

## Phase 5 — Alerts System (New Infrastructure)

### Epic Summary
The one fully missing piece in gr8bux. Real-time alerts that notify beginners when a stock on their watchlist hits a breakout, unusual volume, or a price they set. This is the feature that keeps users coming back daily.

---

### User Story 5.1 — Price Alerts

**As a** beginner trader watching a setup develop,  
**I want to** set a price alert on a stock,  
**So that** I don't have to stare at the screen all day waiting for my entry level.

**Acceptance Criteria:**
- [ ] From any stock detail page or watchlist, a user can set a price alert with: symbol, trigger price, condition (above / below), optional note
- [ ] Alert is delivered via: in-app notification (all users) + browser push notification (opt-in) + email (opt-in)
- [ ] Alert message includes: "NVDA crossed above $880.00 — your alert target. Current price: $882.50"
- [ ] Alerts are listed in a dedicated "Alerts" page with status: Active / Triggered / Expired
- [ ] An alert expires after 5 trading days if not triggered (user can extend)
- [ ] Maximum 5 active alerts on free tier; unlimited on Pro
- [ ] Once triggered, the alert card shows a "Plan This Trade" button linking to the TradeForm wizard

---

### User Story 5.2 — Unusual Volume Alerts

**As a** beginner trader who wants to catch stocks in play,  
**I want to** be notified when a stock on my watchlist has unusually high volume,  
**So that** I don't miss a potential opportunity forming in real-time.

**Acceptance Criteria:**
- [ ] System monitors volume ratio for all watchlist symbols every 5 minutes during market hours
- [ ] An alert fires when `volumeRatio >= 2.5x` average
- [ ] Notification reads: "AAPL — Volume Spike 🔥 Trading at 3.1x average volume. Price: $189.40 (+1.2%)"
- [ ] Available on Pro tier only
- [ ] Maximum 3 watchlist symbols monitored on free tier; full watchlist on Pro

---

### User Story 5.3 — Earnings Reminder Alerts

**As a** beginner trader who has a position or watchlist stock reporting earnings,  
**I want to** be reminded the day before and 30 minutes before market close on earnings day,  
**So that** I can decide whether to hold through earnings or exit beforehand.

**Acceptance Criteria:**
- [ ] System automatically detects earnings events for all watchlist and open-position symbols
- [ ] Day-before reminder: "NVDA reports earnings tomorrow after close. Expected move: ±7.2%. Review your position."
- [ ] Same-day reminder (30 min before market close if AMC, or pre-market if BMO): "NVDA reports earnings in 30 minutes. Make sure your position matches your plan."
- [ ] Each reminder links to the Earnings page detail for that symbol
- [ ] Reminders are on by default and can be disabled per-symbol in alert settings
- [ ] Available on both Free and Pro tiers

---

## Non-Functional Requirements

### Performance
- Morning Brief page: First Contentful Paint < 1.5s; full data load < 3s
- TradeForm wizard steps: Each step transition < 300ms; AI agent calls show loading state within 200ms
- Risk dashboard widget: Data refresh < 500ms (reads from trade log, no external API)

### Mobile
- All Phase 1–3 features must be fully functional on mobile (375px min width)
- TradeForm wizard must be usable on a phone with one hand
- Morning Brief is the primary mobile view — it should feel like a native app card layout

### Security
- All trade data is scoped to authenticated user — no cross-user data leakage
- Account size and risk settings stored encrypted at rest in Supabase
- AI agent calls are server-side only — API keys never exposed to client
- Stripe payment flow follows PCI compliance — no card data touches gr8bux servers

### Accessibility
- All interactive elements have ARIA labels
- Color-coded risk indicators have text equivalents (not color-only)
- Keyboard navigation supported throughout TradeForm wizard

---

## Success Metrics

| Phase | Key Metric | Target |
|---|---|---|
| Phase 1 — Morning Brief + Scanner | Daily Active Users returning before 9:30am ET | 40% of registered users |
| Phase 1 — Scanner Table | Avg time from login to "Trade This" click | <3 minutes |
| Phase 2 — Trade Wizard | % of trades logged with all 4 plan fields filled | >70% |
| Phase 3 — Risk Dashboard | Avg daily risk % per user | <3% (down from baseline) |
| Phase 4 — Monetization | Free → Pro conversion rate | >8% within 30 days of free trial |
| Phase 5 — Alerts | Alert-to-trade-plan conversion rate | >25% |
| Phase 6 — Journal Intelligence | Weekly retrospective open rate | >60% of active users |
| Phase 6 — Personalization | Retention at 90 days (personalization cohort vs. baseline) | +25% retention lift |

---

## The Compounding Effect (Why This Wins Long-Term)

```
Week 1:   User is just tasting everything at the buffet
Week 2:   User notices they liked breakouts, didn't like earnings plays
Week 4:   AI confirms it: "Your breakout win rate is 71%"
Month 2:  User starts consciously choosing breakouts
Month 3:  AI surfaces more breakout setups higher in the table for this user
Month 6:  User has accidentally developed a trading style
           — without ever reading a book or taking a course
```

This is genuine skill development through structured repetition. The more the user trades, the smarter the platform gets about that user. The more personalized the platform gets, the harder it is to leave. This is the retention engine.

---

## Execution Timeline

```
Weeks 1–2    Phase 1: Morning Brief + Scanner Table (assembly + new intraday function)
Weeks 3–5    Phase 2: TradeForm Wizard (agent integration + 4-step UI)
Week 6       Phase 3: Risk Dashboard (trade log aggregation + widget)
Weeks 7–8    Phase 4: Auth gating + Free/Pro tier split + Stripe
Weeks 9–12   Phase 5: Alerts infrastructure (polling + notifications)
Weeks 13–16  Phase 6: Journal Intelligence (nightly debrief + weekly retro + personalization)
```

---

## Open Questions

1. **Futures data source** — SPY pre-market is used as a proxy in Phase 1. Should we integrate a dedicated futures feed (e.g., Tradier or Polygon) for ES/NQ in Phase 2?
2. **Brokerage integration** — gr8bux is currently a planning/journaling layer (Option A). Phase 7 could add live order execution via Alpaca or IBKR API. Is this in scope?
3. **AI query costs** — The intraday scanner runs TechnicalSetups on 8–15 symbols every 15 minutes. At scale this has cost implications. Should a lighter cached model be used for scanner scoring with full agent only on "Trade This" click?
4. **Macro events data** — Phase 1 Story 1.3 requires an economic calendar. Is there a preferred free/paid source, or should this be a manually curated weekly data file refreshed by a nightly function?
5. **Mobile app vs. PWA** — The mobile requirement can be met by a PWA (already possible with Next.js). Is a native app a later consideration?
6. **Scanner universe** — The intraday scanner needs a candidate universe (~50 symbols). Should this be: (a) a fixed list of liquid large-caps, (b) user's watchlist, (c) dynamic from screener, or (d) all three merged?
7. **Algorithm authorship** — Who writes and maintains the scanning algorithms? Should there be an internal algorithm registry so new ones can be added/disabled without a full deploy?
