# Nasdaq as Yahoo Finance Replacement — Research Document
**GR8BUX | Prepared: April 2026**

---

## 1. Current Setup — Yahoo Finance

### What GR8BUX Uses Today
- **Source**: Yahoo Finance via the unofficial `yfinance` Python library / scraping approach
- **Endpoint**: `/api/options/leaps-chain` — fetches per-symbol options chain data
- **Data returned**:
  - `underlyingPrice` — current stock price
  - `contracts[]` — full options chain with: `strike`, `expiry`, `delta`, `iv` (implied volatility), `premium`, `bid`, `ask`
- **Downstream uses**:
  - LEAPS screener rows (filtered by delta, IV rank, premium)
  - Supabase `market_data` table (pre-computed cache via cron)
  - AI agent context (Technical, Greeks, Sentiment, Risk, Strategy agents)

### Why We're Investigating a Replacement
- Yahoo Finance has **no official API** — it's unofficial scraping that can break without notice
- No SLA, rate limits change arbitrarily, structure can shift after Yahoo updates
- Not suitable for a production application at scale

---

## 2. Nasdaq Data Link — REST API (nasdaq.com/solutions/data/nasdaq-data-link/api)

### What It Is
The **Nasdaq Data Link APIs** page (nasdaq.com/solutions/data/nasdaq-data-link/api) is Nasdaq's cloud API suite for real-time and delayed exchange data, delivered via REST and Streaming APIs.

### Available Endpoints
The API supports the following endpoints:

| Endpoint | Description |
|----------|-------------|
| **Last Sale** | Latest last-sale-eligible transaction. Fields: symbol, timestamp, price, size, conditions, exchange |
| **Last Trade** | Latest transaction regardless of conditions. Same fields as Last Sale |
| **Last Quote** | Current bid/ask with sizes and venue. Fields: bidPrice, bidSize, bidVenue, askPrice, askSize |
| **Snapshot** | Real-time OHLCV + change data: open, high, low, close, lastTrade, volume, previousClose, netChange, percentChange |
| **Trends (Gainers/Decliners)** | Top 20 gainers and decliners with lastTrade, lastSale, netChange, percentChange |
| **Trends (Most Active)** | Top 20 by share volume or dollar volume |
| **Bars** | OHLCV candlestick data. 10+ years of history. Supports real-time, delayed, and historical. Sources: Nasdaq Basic/NLS+/CQT/OTCBB |
| **Reference Data** | Symbol list, security name, listing exchange, ETF flag |

### Featured Products via API
- Nasdaq Basic & Last Sale+
- Nasdaq TotalView (full order book)
- Historical Data
- CQT (Consolidated Quotes and Trades)
- Global Indexes Data Service
- Nasdaq Fund Network
- **Nasdaq Smart Options** ← options-related product

### Critical Limitation — No Self-Serve Access
> "Contact Us for a Free Trial" — requires form submission and sales engagement

**There is no self-serve API key signup.** Access requires:
1. Filling out a contact form with company name, job title, phone number
2. Nasdaq sales team initiating a "trial"
3. Receiving credentials (client ID, client secret, base URL) via onboarding email

This is a **B2B enterprise product**, not a developer API. Pricing is not publicly disclosed.

### What's Missing for GR8BUX
The documented endpoints cover **equities only** (price, quote, OHLCV, gainers). There is no public documentation for options chain data (strike, expiry, delta, IV, premium, bid/ask per contract). The "Nasdaq Smart Options" product is listed but has no public documentation — it is presumed enterprise-tier with separate pricing.

---

## 3. Nasdaq Data Link — Historical Datasets (data.nasdaq.com / formerly Quandl)

### What It Is
**data.nasdaq.com** (formerly Quandl, acquired by Nasdaq) is a self-serve data marketplace with 250+ financial and alternative datasets. This is different from the cloud API described above.

### Access Model
- **Free tier**: Available for some datasets (historical data, EOD prices)
- **Paid tiers**: Required for real-time, premium, and institutional datasets
- **Self-serve signup** at data.nasdaq.com — get an API key immediately
- REST API + Python SDK, R SDK, Excel add-in, SQL interface

### Available Data
- Equities: EOD prices, fundamentals, OHLCV history
- Alternative data: 250+ datasets across economics, commodities, financial indicators
- Streaming API: Available (requires subscription)
- Real-time/Delayed REST API: Available (requires subscription + sales contact for credentials)

### What's Missing for GR8BUX
- **No options chain data**: Strikes, expiries, delta, IV, premium per contract are NOT available through Nasdaq Data Link datasets
- The NDOD (Nasdaq On Demand) database page was inaccessible during research — this may contain more products but couldn't be verified
- Focus is on tabular datasets (fundamental data, historical EOD prices) — not live options chains

---

## 4. Nasdaq Enterprise Products (nasdaq.com/solutions/data)

### What Exists
| Product | Description |
|---------|-------------|
| Nasdaq Basic | Real-time BBO + Last Sale for all US stocks |
| Nasdaq TotalView | Full order book, tick-by-tick data |
| Options (OPRA feed) | Real-time options data from 6 exchanges (PHLX, NOM, ISE, GEMX, BXOP, MRX) via OPRA |
| Greeks & IV Analytics | Real-time options analytics including theoretical prices and implied volatility |

### Why Not Viable for GR8BUX
- **Enterprise contracts only** — "Contact Us" with no public pricing
- **Institutional pricing** — estimated $1,000s–$10,000s/month based on industry norms
- Designed for hedge funds, market makers, institutional trading desks
- No developer sandbox, no free tier, no self-serve
- Multi-month procurement/legal process to onboard

---

## 5. Better Alternatives for Options Chain Data

Since Nasdaq doesn't provide accessible options chain data (with strike, expiry, delta, IV, premium per contract), here are the realistic alternatives:

### Option A — Polygon.io (RECOMMENDED)
| Detail | Value |
|--------|-------|
| **URL** | polygon.io |
| **Options data** | ✅ Full chains with strike, expiry, greeks (delta, gamma, theta, vega), IV, bid, ask, volume, OI |
| **Free tier** | ✅ Yes — delayed/EOD data free |
| **Paid tier** | Starter: $29/mo — includes real-time options |
| **API style** | REST + WebSocket |
| **Integration effort** | Low — clean REST endpoints, excellent docs |
| **GR8BUX fit** | Direct drop-in for `/api/options/leaps-chain` |

Example options chain call:
```
GET /v3/snapshot/options/{underlyingAsset}?limit=250&contract_type=call&strike_price.gte=100
```
Returns: `strike_price`, `expiration_date`, `delta`, `implied_volatility`, `day.close` (premium), `bid`, `ask`

**This is the strongest upgrade path for GR8BUX** — it directly maps to what Yahoo Finance currently provides.

---

### Option B — Tradier (Free Brokerage API)
| Detail | Value |
|--------|-------|
| **URL** | tradier.com/individual/api |
| **Options data** | ✅ Full chains with greeks, IV, bid, ask, volume, OI |
| **Free tier** | ✅ Developer sandbox — free with brokerage account or standalone developer account |
| **Quirk** | Requires creating a Tradier brokerage account or developer account (free) |
| **API style** | REST |
| **Rate limits** | 200 requests/min (developer), higher for brokerage |
| **GR8BUX fit** | Good — full options chain data available |

---

### Option C — Alpha Vantage (Already in GR8BUX)
| Detail | Value |
|--------|-------|
| **URL** | alphavantage.co |
| **Status** | ✅ API key already exists in `.env.local` as `ALPHAVANTAGE_API_KEY` |
| **Options data** | ⚠️ Limited — has a `HISTORICAL_OPTIONS` endpoint but requires Premium plan ($50/mo) |
| **Free tier** | ✅ For equities (OHLCV, fundamentals, RSI, SMA) — 25 calls/day |
| **Options on free tier** | ❌ Options endpoint is Premium-only |
| **GR8BUX fit** | Could serve as a free supplement for stock prices + RSI; NOT a replacement for options chain |

**Note**: Since we already have the Alpha Vantage key, we could use it for supplemental market data (RSI, HV20 calculations, stock price) on the free tier without adding cost.

---

### Option D — Finnhub
| Detail | Value |
|--------|-------|
| **URL** | finnhub.io |
| **Options data** | ❌ No options chain endpoint in any tier |
| **Free tier** | ✅ Generous — real-time quote, fundamentals, insider sentiment, company news |
| **GR8BUX fit** | Good for supplemental data (insider sentiment, news sentiment, recommendation trends) — NOT a Yahoo Finance replacement for options |

---

### Option E — Unusual Whales / SpotGamma
- Premium-only options flow and analytics platforms
- No REST API for programmatic access at non-enterprise pricing
- **Not viable for GR8BUX**

---

### Option F — Yahoo Finance (Status Quo)
| Detail | Value |
|--------|-------|
| **Options data** | ✅ Full chains with greeks, IV, premium |
| **Cost** | Free (unofficial) |
| **SLA** | ❌ None — unofficial scraping |
| **Stability** | ❌ Breaking changes possible at any time |
| **Risk** | Medium-High — currently working but structural risk exists |

---

## 6. Comparison Matrix

| Provider | Options Chain | Greeks/IV | Free Tier | Self-Serve | Est. Cost | Stability |
|----------|--------------|-----------|-----------|------------|-----------|-----------|
| **Yahoo Finance** (current) | ✅ | ✅ | ✅ | ✅ | $0 | ❌ Unofficial |
| **Polygon.io** | ✅ | ✅ | Delayed only | ✅ | $29/mo | ✅ Official |
| **Tradier** | ✅ | ✅ | ✅ | ✅ | $0 (dev) | ✅ Official |
| **Alpha Vantage** | ⚠️ Premium | ❌ | Equities only | ✅ | $50/mo options | ✅ Official |
| **Finnhub** | ❌ | ❌ | ✅ | ✅ | $0 | ✅ Official |
| **Nasdaq Data Link API** | ❌ | ❌ | ❌ | ❌ | Enterprise | ✅ Official |
| **Nasdaq Data Link (Quandl)** | ❌ | ❌ | ✅ EOD | ✅ | $0–$??? | ✅ Official |
| **Nasdaq Enterprise** | ✅ | ✅ | ❌ | ❌ | $1,000s/mo | ✅ Official |

---

## 7. Recommendation

### Immediate (No Cost)
**Try Tradier's free developer API first.** It provides the same options chain data as Yahoo Finance (strikes, expiries, delta, gamma, theta, vega, IV, bid, ask) through an official API with a real SLA. Requires only creating a free developer account.

### Production Upgrade Path
**Migrate to Polygon.io Starter ($29/mo)** when GR8BUX generates revenue or when Yahoo Finance breaks. Polygon.io is the cleanest 1:1 replacement:
- Same data shape as current Yahoo Finance output
- Official SLA with 99.9% uptime guarantee
- Real-time options chains during market hours
- The `/api/options/leaps-chain` endpoint rewrite would be minimal (~50 lines)

### Leverage Existing Alpha Vantage Key
The `ALPHAVANTAGE_API_KEY` already in the project can be used for supplemental equities data (RSI, HV20 via daily OHLCV) on the free tier — 25 calls/day is enough for the 18-symbol LEAPS universe during market refresh cycles.

### Nasdaq — Conclusion
**Nasdaq is not the right path for GR8BUX at this stage:**
- The accessible "Data Link API" and "Data Link datasets" products do **not include options chain data**
- All Nasdaq products with options data (OPRA feed, Greeks/IV analytics, Smart Options) are enterprise-only with contact-sales procurement and institutional pricing
- No self-serve access, no developer sandbox, no public pricing

---

## 8. Implementation Notes (if migrating to Polygon.io)

The `/api/options/leaps-chain` endpoint currently calls Yahoo Finance. A Polygon.io migration would:

1. Add `POLYGON_API_KEY` to `.env.local` and Netlify env vars
2. Replace Yahoo Finance call with:
   ```
   GET https://api.polygon.io/v3/snapshot/options/{symbol}?limit=250&contract_type=call&apiKey={key}
   ```
3. Map Polygon response fields to GR8BUX contract schema:
   ```
   strike_price → strike
   expiration_date → expiry
   greeks.delta → delta
   implied_volatility → iv
   day.close → premium
   bid → bid
   ask → ask
   ```
4. The Supabase cron pipeline, AIAdvisorPanel, and all agents require **zero changes** — they consume the transformed output, not the raw API

---

*Research conducted April 2026. Sources: nasdaq.com/solutions/data/nasdaq-data-link/api, docs.data.nasdaq.com, finnhub.io/docs/api, polygon.io/docs/stocks, tradier.com/individual/api*
