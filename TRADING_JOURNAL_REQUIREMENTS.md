# Trading Journal App - Requirements & Implementation Plan

**Project Type:** Web App (Personal Use)  
**Target Markets:** Stocks & Options  
**Status:** Requirements Phase (Under Discussion)
**Last Updated:** 2026-03-24

---

## 1. CORE REQUIREMENTS (To Be Refined)

### 1.1 Trade Logging
- [ ] **Stock Trades**
  - Buy/Sell with quantity and price
  - Commission/fees tracking
  - Entry and exit timestamps
  
- [x] **Options Trades**
  - Single leg (calls/puts) and spreads
  - Strike price, expiration date
  - Open/close prices per leg
  - **Greeks tracking:** YES (delta, gamma, theta, vega) - automatic calculation
  - **Spreads:** YES (call spreads, put spreads, calendars, etc.)

### 1.2 Trade Analysis & Metrics
- [ ] P&L tracking (by trade, daily, weekly, monthly)
- [ ] Win rate and consecutive wins/losses
- [ ] Trade duration analysis
- [ ] Performance by strategy/approach
- [ ] Risk metrics (largest loss, max drawdown, risk-reward ratio)

### 1.3 Journal & Notes
- [ ] Trade plan documentation (pre-entry notes)
- [ ] Post-trade journal entries (what worked, lessons learned)
- [ ] Tags/categories for trades (e.g., "technical breakout", "earnings play", "swing trade")

### 1.4 User Experience
- [ ] Dashboard with key metrics overview
- [ ] Trade entry form (quick and intuitive)
- [ ] Trade list/history with filtering and sorting
- [ ] Detailed trade view
- [ ] Performance charts/graphs
- [x] Export data capability - **YES**

### 1.5 News & Market Monitoring (NEW - High Priority!)
- [ ] **Headlines Page**
  - Fetch and display financial news (stocks in the news)
  - Filter by watchlist or search
  - Link trades to relevant news events
  
- [ ] **"Talk of the Town" Feature**
  - Monitor stocks gaining social media attention
  - Track community sentiment/discussions
  - Source: Reddit, Twitter, StockTwits, or similar?
  
- [ ] **Technical Setup Detection**
  - Flag stocks that are "coiling" (consolidating before breakout)
  - Identify other technical setups
  - What technical indicators to track? - **TBD**
  
- [ ] **Community Integration**
  - Integration with community groups/forums? (Reddit, Discord, etc.)
  - Display relevant discussions for tracked stocks?
  - User-generated insights or curated data?

---

## 2. QUESTIONS REQUIRING CLARIFICATION

### Data & Analytics
- [x] **Automatic Greek calculations:** YES
- [x] **Spreads support:** YES
- [ ] Do you need **real-time market data** integration, or will you manually enter prices?
- [ ] How important are **historical charts** of your performance?
- [x] **Export data:** YES (format TBD - CSV, JSON, or both?)

### Features - Priority Ranking
- [x] P&L and performance analytics
- [x] Win rate and statistical analysis
- [x] Trade notes and journaling
- [x] Risk analysis and metrics
- [x] Strategy-based performance tracking
- [x] **NEWS & COMMUNITY PAGE** (NEW!) - Headlines, "talk of the town" stocks, coiling stocks, community discussions

### Technical
- [x] **Cloud storage with sync:** YES - GitHub, Supabase, and/or Netlify
- [x] **Multi-device sync:** YES
- [ ] Authentication method? (GitHub OAuth, email, social?)
- [ ] Data backup strategy?

---

## 3. PROPOSED TECH STACK (Pending Approval)

### Frontend
- **Framework:** React + TypeScript
- **UI Library:** Tailwind CSS (or Material-UI alternative?)
- **State Management:** React Context API or Zustand
- **Charts:** Recharts or Chart.js
- **Form Handling:** React Hook Form
- **Real-time updates:** Socket.io or Server-Sent Events (SSE)

### Backend
- **Runtime:** Node.js + Express (or Next.js API routes)
- **Database:** Supabase (PostgreSQL) - integrates with Netlify
- **Authentication:** GitHub OAuth (or Supabase auth)
- **Hosting:** Netlify (frontend + serverless functions)

### External APIs & Data Sources
- **Stock/Options Data:** Finnhub, Alpaca, or Similar (free/paid tier?)
- **News:** NewsAPI, Finnhub news, or financial RSS feeds
- **Technical Analysis:** TA-Lib or custom indicators
- **Community Data:** Reddit API, Twitter API, or web scraping? (rate limits?)
- **Greeks Calculation:** Black-Scholes library (JS: `greeks-js` or similar)

### GitHub Integration
- Use GitHub as version control + possibly for data sync via GitHub API?
- Store user data in Supabase (primary), with GitHub backups?

### Recommended Stack Summary
**Frontend:** React + Tailwind + Vite  
**Backend:** Next.js API routes (on Netlify)  
**Database:** Supabase PostgreSQL  
**Authentication:** GitHub OAuth  
**Hosting:** Netlify (full-stack deployment)

---

## 4. PROJECT STRUCTURE (Preliminary)

```
trading-journal-app/
├── public/
├── src/
│   ├── components/
│   │   ├── TradeForm/
│   │   ├── TradeList/
│   │   ├── Dashboard/
│   │   ├── Analytics/
│   │   ├── NewsPage/
│   │   ├── TalkOfTown/
│   │   ├── TechnicalSetups/
│   │   └── Navigation/
│   ├── pages/
│   │   ├── Home/
│   │   ├── Dashboard/
│   │   ├── NewTrade/
│   │   ├── TradeDetail/
│   │   ├── Analytics/
│   │   ├── News/
│   │   └── Community/
│   ├── api/ (Next.js API routes or serverless functions)
│   │   ├── trades/
│   │   ├── news/
│   │   ├── market-data/
│   │   └── greeks/
│   ├── services/
│   │   ├── tradeService.ts
│   │   ├── analyticsService.ts
│   │   ├── newsService.ts
│   │   ├── technicalService.ts
│   │   ├── apiIntegrations.ts (Finnhub, NewsAPI, etc.)
│   │   └── greeksCalculator.ts
│   ├── types/
│   │   ├── trade.ts
│   │   ├── news.ts
│   │   └── market.ts
│   ├── App.tsx
│   └── index.tsx
├── package.json
├── supabase/
│   └── migrations/ (database schema)
└── README.md
```

---

## 5. DATA MODELS (Preliminary)

### Trade Object
```typescript
interface Trade {
  id: string;
  type: 'stock' | 'option';
  symbol: string;
  entryDate: Date;
  exitDate?: Date;
  relatedNews?: string[]; // IDs of news articles
  
  // Stock-specific
  quantity?: number;
  entryPrice?: number;
  exitPrice?: number;
  
  // Option-specific
  legs?: OptionLeg[];
  strategy?: string; // e.g., "call spread", "put debit spread"
  
  // Common
  commission: number;
  pnl?: number; // calculated
  notes: string;
  planNotes: string; // pre-entry plan
  tags: string[];
}

interface OptionLeg {
  symbol: string;
  type: 'call' | 'put';
  strikePrice: number;
  expirationDate: Date;
  direction: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
}
```

### News & Market Monitoring Models (NEW)
```typescript
interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string; // e.g., "Reuters", "Bloomberg", "Finnhub"
  sourceUrl: string;
  publishedAt: Date;
  symbols: string[]; // stocks mentioned
  sentiment?: 'positive' | 'negative' | 'neutral'; // if available
  tradedByUser?: boolean;
}

interface StockSetup {
  symbol: string;
  setupType: 'coiling' | 'breakout' | 'support-bounce' | 'custom';
  technicalIndicators: {
    rsi?: number;
    macd?: boolean;
    bollinger?: boolean;
    volume?: number;
  };
  detectedAt: Date;
  communityMentions?: number;
  newsCount?: number;
  tradedByUser?: boolean;
}

interface CommunitySource {
  symbol: string;
  sourceType: 'reddit' | 'stocktwits' | 'discord' | 'twitter'; // TBD
  sentiment: number; // -1 to 1 scale (bearish to bullish)
  mentionCount: number;
  lastUpdated: Date;
}
```

---

## 7. CRITICAL DECISIONS FOR NEWS & COMMUNITY FEATURES

⚠️ **This is a significant scope expansion** - These features add complexity:

### 7.1 Data Sources & APIs (DECIDED ✅)
- **News:** Free sources only
  - [x] Yahoo Finance (free financial news, no API key needed)
  - [x] MSN Finance (free financial news)
  - [x] Google Finance (free market data, limited scraping)
  - [x] RSS feeds (stock market focused - YahooFinance, MarketWatch)
  - [ ] ~~Finnhub~~ (excluded - replaced with free sources)
  - [ ] ~~NewsAPI~~ (excluded - replaced with free sources)
  
- **Social Sentiment:** Community monitoring (no paid APIs)
  - [x] Reddit (r/stocks, r/investing, r/wallstreetbets via free PRAW API)
  - [x] StockTwits (free API available)
  - [ ] ~~Twitter/X API~~ (excluded - expensive)
  - [ ] ~~Discord~~ (excluded)
  - [x] User-curated watchlist (fallback option)

- **Technical Coiling Detection:** (DECIDED ✅)
  - [x] Technical indicator-based approach
    - RSI (relative strength index)
    - Bollinger Bands (range compression)
    - Consolidation pattern detection (low volatility + tight range)
  - [ ] Manual user flagging (secondary feature)
  - [x] Time periods: **Daily & Weekly** (intraday excluded for MVP)
  - Library: TA-Lib or `talib-js` for calculations
  - Market data: Free sources (Yahoo Finance API, IEX Cloud free tier, or Alpaca paper trading API)

### 7.2 Update Frequency (DECIDED ✅)
- [x] **Daily/Hourly scheduled updates** (lighter server load, lower API costs)
  - News aggregation: Once per day (market open or morning)
  - Technical setups: Twice daily (market open + close) or once daily
  - Reddit/StockTwits sentiment: Once daily or on-demand
- [ ] ~~Real-time updates~~ (excluded - too costly for MVP)
- [x] On-demand refresh option (user can manually refresh any page)

### 7.3 User Workflow Integration
- Should the app suggest trades based on news/setups?
- Or just display information for manual review?

## 8. DISCUSSION NOTES

**Decisions Made (2026-03-24):**
- ✅ Options: Automatic Greeks calculation + spreads support
- ✅ Cloud storage: Supabase + Netlify + GitHub integration
- ✅ Export: YES (format TBD)
- ✅ News sources: Free sources only (Yahoo Finance, MSN Finance, Google Finance, RSS feeds)
- ✅ Community tracking: Reddit (PRAW) + StockTwits + user watchlist
- ✅ Coiling detection: Technical indicators (RSI, Bollinger, consolidation), daily/weekly timeframes
- ✅ Update frequency: Daily/hourly scheduled (not real-time)
- ✅ Authentication: GitHub OAuth
- ✅ Export formats: CSV (primary), JSON (backup)
- ✅ Trade suggestions: Passive notifications (just FYI when setups match headlines)

**Still TBD:**
- [ ] Authentication method (GitHub OAuth vs Supabase Auth)
- [ ] Export formats (CSV, JSON, PDF?)
- [ ] Should app suggest trades based on news/setups or just inform user?
- [ ] Which performance charts are highest priority?
- [ ] API rate limits - will we need caching strategy?

*Will add refinements and decisions as we discuss...*
