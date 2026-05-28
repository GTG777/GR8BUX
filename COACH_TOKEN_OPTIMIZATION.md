# Trade Coach — Token Optimization Plan

## Problem

Every message sent to the Trade Coach triggers:
1. A live Supabase query to aggregate the user's full trade portfolio
2. A RAG search returning 6 similar trades with journal text
3. A full prompt rebuild including portfolio summary, trade history, and conversation history
4. An LLM call with 1,500–2,200 input tokens per message

The user's question itself is ~20–50 tokens. The surrounding context is 1,500+.
Portfolio data does not change between messages in a session, yet it is recomputed and re-sent every single call.

---

## Current Token Breakdown (per call)

| Block | Tokens | File |
|---|---|---|
| System prompt | ~250 | `src/lib/agents/coachAgent.ts:198` |
| Portfolio summary (DB query + format) | ~400–600 | `src/lib/agents/coachAgent.ts:271` |
| Open positions block | ~100–200 | `src/lib/agents/coachAgent.ts:291` |
| Recent 15 trades with full leg detail | ~400–600 | `src/lib/agents/coachAgent.ts:238` |
| RAG: 6 similar trades × 300 chars | ~600–800 | `src/lib/agents/coachAgent.ts:319` |
| Conversation history (last 10 messages) | ~200–500 | `src/lib/agents/coachAgent.ts:138` |
| User question | ~20–50 | — |
| **Total input per call** | **~1,500–2,200** | |
| Max output | 2,000 | |

---

## Optimization Strategies

### Phase 1 — Cron Jobs (No tokens spent per call)

These replace real-time DB computation with pre-built cached data, eliminating the most expensive prompt blocks entirely.

---

#### 1.1 — Portfolio Context Cache (Netlify Scheduled Function)
**Status: `PENDING`**

**What:** A scheduled Netlify function runs every 30 minutes and pre-computes each active user's portfolio summary. The result is stored as a pre-formatted compact string in a new `coach_context_cache` table in Supabase.

**Impact:** Eliminates the live DB aggregation + verbose text formatting on every coach call. The coach API replaces ~500 tokens of dynamically built text with a single `SELECT` of a pre-built compact string.

**Files to create/modify:**
- `netlify/functions/refresh-coach-context.ts` — new scheduled function
- `src/pages/api/chat/coach.ts` — read from cache instead of building live
- Supabase: new `coach_context_cache` table (`user_id`, `summary_text`, `updated_at`)

**Estimated savings:** ~400–500 tokens per call

**Cron schedule:** `*/30 * * * *` (every 30 min)

---

#### 1.2 — Nightly Behavioral Brief (Netlify Scheduled Function)
**Status: `PENDING`**

**What:** A nightly scheduled function runs a single LLM call (Haiku/nano) per active user after market close. It analyzes the user's full trade history and produces a ~150-token behavioral summary stored in Supabase:

> *"Trader shows 68% win rate on momentum breakouts, consistent losses on earnings plays, holds losing NVDA calls too long. Risk/reward improving over last 30 days."*

This pre-generated brief replaces the raw `analyzePatterns()` output and chunks of the portfolio block injected into every conversation.

**Impact:** One cheap nightly LLM call replaces ~300 tokens of raw pattern data injected into every conversation during the day.

**Files to create/modify:**
- `netlify/functions/nightly-coach-brief.ts` — new scheduled function
- `src/lib/agents/coachAgent.ts` — inject `behavioralBrief` field from cache instead of computing patterns inline
- Supabase: `behavioral_brief` column on `coach_context_cache` table

**Estimated savings:** ~250–350 tokens per call

**Cron schedule:** `0 5 * * *` (midnight CT, after market close)

---

### Phase 2 — Code Changes (Zero new infrastructure)

These are simple code changes with no new services or tables required.

---

#### 2.1 — Shrink Recent Trades: 15 → 5
**Status: `PENDING`**

**What:** Change `.slice(0, 15)` to `.slice(0, 5)` at `coachAgent.ts:238`. For questions that explicitly reference recent history ("what have I traded this week"), dynamically expand to 10.

**Files:** `src/lib/agents/coachAgent.ts`

**Estimated savings:** ~200–350 tokens per call

---

#### 2.2 — Shrink RAG Results: 6 trades × 300 chars → 4 trades × 150 chars
**Status: `PENDING`**

**What:** Change RAG retrieval limit from 6 to 4 and journal text slice from 300 to 150 chars at `coachAgent.ts:332`.

**Files:** `src/lib/agents/coachAgent.ts`

**Estimated savings:** ~400–600 tokens per call

---

#### 2.3 — Compact Portfolio Text Format
**Status: `PENDING`**

**What:** Rewrite the portfolio summary block to use a compact key:value format instead of verbose prose. Example:

```
# Current (verbose):
"Total Trades: 45 (32 closed, 13 open)
Overall Win Rate: 68% (22 wins / 10 losses on closed trades)
Total Realized P&L: $2,345.00
Avg Win: $180.00 | Avg Loss: $-95.00"

# Compact:
"trades:45 closed:32 open:13 wr:68% pnl:$2345 avgW:$180 avgL:$-95"
```

**Files:** `src/lib/agents/coachAgent.ts`

**Estimated savings:** ~100–150 tokens per call

---

#### 2.4 — Strip Trade Notes by Default
**Status: `PENDING`**

**What:** Remove `notes.slice(0, 80)` and `planNotes.slice(0, 80)` from the default trade line format at `coachAgent.ts:244`. Notes are only useful when the user asks about a specific trade's reasoning — omit them unless the query mentions a specific symbol that matches the trade.

**Files:** `src/lib/agents/coachAgent.ts`

**Estimated savings:** ~50–100 tokens per call

---

### Phase 3 — Session-Level Optimization (Medium effort)

---

#### 3.1 — Rolling Conversation Summary
**Status: `PENDING`**

**What:** When conversation history exceeds 8 messages, trigger a single cheap LLM call to compress the history into a 2–3 sentence summary. Replace the raw message array with the summary going forward. Store the summary in `coach_sessions` table alongside the messages.

**Impact:** Prevents the history block from growing unboundedly across long sessions.

**Files:**
- `src/lib/agents/coachAgent.ts` — add `summarizeHistory()` method
- `src/pages/api/chat/coach.ts` — pass summary instead of full history when length > 8
- `src/pages/api/chat/coach-session.ts` — store and return summary field

**Estimated savings:** ~200–500 tokens (grows as sessions lengthen)

---

## Summary: Token Savings Projection

| Phase | Strategy | Est. Tokens Saved | Status |
|---|---|---|---|
| 1.1 | Portfolio cache cron | ~450 | ✅ DONE |
| 1.2 | Nightly behavioral brief cron | ~300 | ✅ DONE |
| 2.1 | Recent trades 15→5 | ~275 | ✅ DONE |
| 2.2 | RAG 6×300→4×150 | ~500 | ✅ DONE |
| 2.3 | Compact text format | ~125 | ✅ DONE |
| 2.4 | Strip notes by default | ~75 | ✅ DONE |
| 3.1 | Rolling history summary | ~350 | ✅ DONE |
| **Total** | | **~2,075 / call** | |

> Current baseline: ~1,800 tokens/call input
> Target after all phases: ~600–800 tokens/call input (~60% reduction)

---

## Execution Log

| Date | Item | Files | Notes |
|---|---|---|---|
| 2026-05-27 | Phase 1.1 — DB migration | `supabase/migrations/018_coach_context_cache.sql` | `coach_context_cache` table + `history_summary` column on `coach_sessions` |
| 2026-05-27 | Phase 1.1 — Cron API | `src/pages/api/cron/refresh-coach-context.ts` | Builds compact 5-line summary per user every 30 min |
| 2026-05-27 | Phase 1.1 — Netlify scheduler | `netlify/functions/refresh-coach-context.ts` | Runs `*/30 * * * *` |
| 2026-05-27 | Phase 1.1 — Coach API hot path | `src/pages/api/chat/coach.ts` | Reads cache first (45 min TTL), falls back to live query |
| 2026-05-27 | Phase 1.2 — Nightly brief cron | `src/pages/api/cron/nightly-coach-brief.ts` | Single LLM call per user, stores 150-token behavioral brief |
| 2026-05-27 | Phase 1.2 — Netlify scheduler | `netlify/functions/nightly-coach-brief.ts` | Runs `0 5 * * *` (midnight CT) |
| 2026-05-27 | Phase 2.1 — Recent trades 15→5 | `src/lib/agents/coachAgent.ts` | `buildUserPrompt` fallback path uses `.slice(0, 5)` |
| 2026-05-27 | Phase 2.2 — RAG 6×300→4×150 | `src/lib/agents/coachAgent.ts` | `similarTrades.slice(0, 4)`, `embedded_text.substring(0, 150)` |
| 2026-05-27 | Phase 2.3 — Compact format | `src/lib/agents/coachAgent.ts` | Cache path injects pre-built string; fallback uses compact key:value format |
| 2026-05-27 | Phase 2.4 — Strip notes | `src/lib/agents/coachAgent.ts` + `coach.ts` | Notes omitted in fallback and cache build; `recentTrades` notes set to null |
| 2026-05-27 | Phase 3.1 — Rolling summary | `src/pages/api/chat/coach-session.ts` | Summarises when history ≥ 8 msgs; coach injects summary + drops full history |
| 2026-05-27 | netlify.toml | `netlify.toml` | Added `refresh-coach-context` and `nightly-coach-brief` schedules |

---

## Notes

- All Netlify scheduled functions follow the existing pattern in `netlify.toml` (`refresh-market-data`, `refresh-ai-analyses`, etc.)
- Phase 1 cron jobs should be implemented before Phase 2 code changes, since Phase 1 eliminates the most tokens without touching the live call path
- Phase 2 changes are safe to ship independently — each is a 1–2 line edit
- Phase 3 requires a schema change (`summary` column on `coach_sessions`) and should be last
- The stock-coach and options-coach endpoints (`/api/chat/stock-coach`, `/api/chat/options-coach`) use simpler context stuffing and are not included in this plan — their token usage is lower (~600 tokens/call) and the same Phase 2 principles apply if needed later
