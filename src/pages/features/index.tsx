import React, { useState } from 'react';
import Link from 'next/link';

const CATEGORIES = [
  { id: 'journal', label: 'Trade Journal' },
  { id: 'options', label: 'Options Tools' },
  { id: 'research', label: 'Market Research' },
  { id: 'ai', label: 'AI Assistant' },
];

const FEATURES = [
  // ── Trade Journal ──
  {
    category: 'journal',
    icon: '📒',
    title: 'Trade Journal',
    tagline: 'Every trade. Every detail. All in one place.',
    description: 'Log stocks and multi-leg options trades with full detail — entry/exit price, quantity, P&L, and notes. Supports spreads, condors, straddles, and any multi-leg structure.',
    bullets: [
      'Stock and multi-leg options entries',
      'Automatic P&L calculation on close',
      'Filter and search your trade history',
      'Paginated trade list (20/page)',
      'Delete with confirmation safeguard',
      'Cloud synced via Supabase',
    ],
    plan: 'Free',
    planColor: 'text-zinc-400',
  },
  {
    category: 'journal',
    icon: '⚡',
    title: 'Auto Greeks Calculator',
    tagline: 'Understand your exposure on every leg.',
    description: 'When logging options trades, GR8BUX automatically calculates Delta, Gamma, Theta, Vega, and Implied Volatility for each leg using Black-Scholes — no manual input needed.',
    bullets: [
      'Delta, Gamma, Theta, Vega per leg',
      'Implied Volatility estimate',
      'Net Greeks across all legs',
      'Supports all standard options structures',
    ],
    plan: 'Free',
    planColor: 'text-zinc-400',
  },
  {
    category: 'journal',
    icon: '📈',
    title: 'Performance Analytics',
    tagline: 'Know exactly what's working.',
    description: 'Visualize your trading performance with an equity curve, monthly P&L bar chart, win rate tracker, streak counter, and strategy-level breakdowns.',
    bullets: [
      'Equity curve (area chart)',
      'Monthly P&L bar chart',
      'Win rate & streak tracker',
      'Performance by strategy',
      'Stat cards: avg win/loss, total P&L',
    ],
    plan: 'Pro',
    planColor: 'text-indigo-400',
  },
  {
    category: 'journal',
    icon: '☁️',
    title: 'Cloud Sync',
    tagline: 'Your data, everywhere.',
    description: 'All trades, watchlists, and settings are stored in the cloud via Supabase with secure, role-based authentication. Access from any device, any time.',
    bullets: [
      'Supabase-backed storage',
      'Role-based access (Admin / Manager / User)',
      'Secure email/password authentication',
      'Auto-sync on every change',
    ],
    plan: 'Free',
    planColor: 'text-zinc-400',
  },

  // ── Options Tools ──
  {
    category: 'options',
    icon: '🧮',
    title: 'Options Lab (Black-Scholes Calculator)',
    tagline: 'Price any strategy before you place the trade.',
    description: 'Run Black-Scholes pricing across 12 strategy types. Visualize the P&L at expiry and today\'s curve, inspect per-leg Greeks, and calculate net cost, max profit, max loss, and breakeven points.',
    bullets: [
      '12 strategy types (long call → iron condor)',
      'P&L chart at expiry + today',
      'Per-leg Greeks breakdown',
      'Net cost / max profit / max loss / breakeven',
      'Live options chain data integration',
    ],
    plan: 'Pro',
    planColor: 'text-indigo-400',
  },
  {
    category: 'options',
    icon: '🔍',
    title: 'Options Screener',
    tagline: 'Find high-probability setups fast.',
    description: 'Screen for bull-put spreads, bear-call spreads, and iron condors with real probability-of-profit, expected value, theta per day, IVR, Max Pain, GEX, and Put/Call Ratio data.',
    bullets: [
      'Bull-put, bear-call, iron condor scanner',
      'Probability of Profit (PoP) via Black-Scholes',
      'Expected Value (EV) ranking',
      'IVR, Max Pain, GEX, PC Ratio',
      'Bias filter: Bullish / Bearish / Neutral',
      'Candle pattern + VWAP panel',
    ],
    plan: 'Pro',
    planColor: 'text-indigo-400',
  },
  {
    category: 'options',
    icon: '📅',
    title: 'LEAPS Screener & Builder',
    tagline: 'Find and build long-term options positions.',
    description: 'Screen 18+ symbols for LEAPS opportunities, view the full options chain with delta labels (Deep ITM → Far OTM), project PMCC income, and build P&L curves for your chosen positions.',
    bullets: [
      '18-symbol LEAPS universe',
      'Sector filter',
      'Options chain with delta labels',
      'PMCC income projector',
      'P&L curve builder',
      'DTE / IV / strike selector',
    ],
    plan: 'Pro',
    planColor: 'text-indigo-400',
  },
  {
    category: 'options',
    icon: '📚',
    title: 'Strategy Library',
    tagline: '30+ strategies from beginner to advanced.',
    description: 'A comprehensive reference guide covering 30+ options strategies from Novice to Expert level — with P&L diagrams, use cases, max profit/loss, and links to the Options Lab calculator.',
    bullets: [
      'Novice → Expert tiered strategies',
      'Long call / put, covered call, cash-secured put',
      'Spreads: debit, credit, ratio',
      'Iron condor, iron butterfly, broken-wing',
      'Advanced: jade lizard, synthetic, double-diagonal',
      'P&L diagram per strategy',
    ],
    plan: 'Pro',
    planColor: 'text-indigo-400',
  },

  // ── Market Research ──
  {
    category: 'research',
    icon: '🔭',
    title: 'Stock Scanner',
    tagline: 'Find technically strong stocks in seconds.',
    description: 'Scan stocks across EMA 20/50/200, RSI, TSI, MACD, Bollinger Bands, ATR, OBV slope, and trend score. Includes candle pattern detection, VWAP analysis, and insider activity.',
    bullets: [
      'EMA 20 / 50 / 200 alignment',
      'RSI, TSI, MACD signals',
      'Bollinger Bands & ATR',
      'OBV slope & trend score',
      'Candle pattern panel',
      'VWAP analysis',
      'Insider activity feed',
    ],
    plan: 'Pro',
    planColor: 'text-indigo-400',
  },
  {
    category: 'research',
    icon: '📆',
    title: 'Earnings Calendar',
    tagline: 'Never miss a catalyst.',
    description: 'Track upcoming earnings with urgency badges (Today / This Week / Next Week), IVR bars, analyst consensus (Strong Buy → Avoid), and strategy suggestion badges — IV Crush Play, LEAPS Opportunity, Sell Premium, or Avoid.',
    bullets: [
      'Grouped by date with urgency badges',
      'IVR bar per symbol',
      'Analyst consensus color coding',
      'Strategy badges: IV Crush, LEAPS Opp., Sell Premium',
      'EPS & revenue estimates',
    ],
    plan: 'Pro',
    planColor: 'text-indigo-400',
  },
  {
    category: 'research',
    icon: '📰',
    title: 'News Feed',
    tagline: 'Stay on top of your symbols and sectors.',
    description: 'Browse market news by individual symbol (your watchlist or manual entry) or by sector via the Sector News Grid. Always know what\'s moving your positions.',
    bullets: [
      'News by symbol (watchlist or manual)',
      'Sector News Grid',
      'Real-time headlines on Pro+',
    ],
    plan: 'Free',
    planColor: 'text-zinc-400',
  },
  {
    category: 'research',
    icon: '💬',
    title: 'Community Sentiment',
    tagline: 'See what traders are talking about.',
    description: 'Track social mentions and sentiment for any symbol from Reddit and StockTwits. Filter by source and watch the talk-of-the-town surface trending ideas.',
    bullets: [
      'Reddit & StockTwits integration',
      'Filter by source',
      'Trending mention counts',
      'Sentiment polarity indicators',
    ],
    plan: 'Pro',
    planColor: 'text-indigo-400',
  },
  {
    category: 'research',
    icon: '🌐',
    title: 'Market Overview',
    tagline: 'Macro picture at a glance.',
    description: 'TradingView-powered overview of SPX, NDX, DJI, RUT, VIX, BTC, AAPL, NVDA and more. Includes sector rotation panel and macro regime signals on the dashboard.',
    bullets: [
      'Live TradingView ticker tape',
      'Macro regime signals',
      'Sector rotation panel',
      'Quick-nav to all research tools',
    ],
    plan: 'Free',
    planColor: 'text-zinc-400',
  },
  {
    category: 'research',
    icon: '₿',
    title: 'Crypto Overview',
    tagline: 'Trending coins and crypto news.',
    description: 'View trending coins via CoinGecko data, BTC/ETH tickers, 24h price change, volume, Coinbase listed badge, and a crypto news feed — all in one panel.',
    bullets: [
      'CoinGecko trending coins',
      'BTC/ETH live tickers',
      '24h change & volume',
      'Coinbase listed badge',
      'Crypto news feed',
    ],
    plan: 'Free',
    planColor: 'text-zinc-400',
  },

  // ── AI Assistant ──
  {
    category: 'ai',
    icon: '🤖',
    title: 'LEAPS AI Assistant',
    tagline: 'Data-driven LEAPS research. You make the call.',
    description: 'The LEAPS AI Assistant scores LEAPS candidates across delta, DTE, IV, and fundamental filters. It surfaces rationale, verdict badges (Strong Setup → Avoid), and risk context — for research only. Not financial advice.',
    bullets: [
      'LEAPS candidate scoring',
      'Delta / DTE / IV context per setup',
      'Verdict badges: Strong Setup, Neutral, Avoid',
      'Score breakdown with rationale',
      'Chat-style interface',
      'Informational use only',
    ],
    plan: 'Elite',
    planColor: 'text-yellow-400',
  },
  {
    category: 'ai',
    icon: '📊',
    title: 'AI Market Assistant',
    tagline: 'Market signal summaries to inform your research.',
    description: 'The AI Market Assistant summarizes current market regime signals, sector trends, and technical setups to help you focus your research. It does not provide trade recommendations.',
    bullets: [
      'Market regime signal summaries',
      'Sector trend context',
      'Technical setup highlights',
      'Research-oriented, not trade signals',
      'Informational use only',
    ],
    plan: 'Elite',
    planColor: 'text-yellow-400',
  },
];

const PLAN_BADGE: Record<string, string> = {
  Free: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  Pro: 'bg-indigo-900/40 text-indigo-300 border-indigo-700/50',
  Elite: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/40',
};

export default function FeaturesPage() {
  const [activeCategory, setActiveCategory] = useState('journal');

  const filtered = FEATURES.filter(f => f.category === activeCategory);

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 bg-gray-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex justify-between items-center">
          <Link href="/"><img src="/logo-full.png" alt="GR8BUX" className="h-10 w-auto" /></Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/features" className="text-sm text-white font-medium">Features</Link>
            <Link href="/pricing" className="text-sm text-zinc-400 hover:text-white transition">Pricing</Link>
          </nav>
          <div className="flex gap-3">
            <Link href="/auth/signin" className="px-4 py-2 text-sm text-zinc-300 hover:text-white font-medium transition">Sign In</Link>
            <Link href="/auth/signup" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition">Get Started Free</Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="pt-20 pb-12 px-6 text-center">
        <h1 className="text-5xl font-extrabold text-white mb-4 tracking-tight">Everything you need to trade better</h1>
        <p className="text-zinc-400 text-xl max-w-2xl mx-auto">
          A complete suite of tools for journaling, options analysis, market research, and AI-powered setup summaries.
        </p>
        <p className="text-xs text-zinc-600 mt-4">For informational purposes only. Not financial advice.</p>
      </section>

      {/* ── Category tabs ── */}
      <section className="sticky top-[57px] z-40 bg-gray-950/95 backdrop-blur border-b border-white/10 px-6">
        <div className="max-w-6xl mx-auto flex gap-1 overflow-x-auto py-3 scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 px-5 py-2 rounded-full text-sm font-medium transition ${
                activeCategory === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Feature cards ── */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((feature, i) => (
            <div key={i} className="bg-zinc-900 border border-white/10 rounded-2xl p-7 hover:border-blue-500/40 transition flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{feature.icon}</span>
                  <div>
                    <h3 className="text-lg font-bold text-white">{feature.title}</h3>
                    <p className={`text-xs font-semibold ${feature.planColor}`}>{feature.plan} plan</p>
                  </div>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold border ${PLAN_BADGE[feature.plan]}`}>
                  {feature.plan}
                </span>
              </div>
              <p className="text-sm text-blue-400 font-semibold italic">{feature.tagline}</p>
              <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
              <ul className="space-y-1.5 mt-1">
                {feature.bullets.map((b, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm text-zinc-300">
                    <span className="w-4 h-4 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs shrink-0">✓</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="py-20 px-6 bg-gradient-to-br from-blue-900/30 to-indigo-900/20 border-t border-white/10">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-extrabold text-white mb-4">Start free. Upgrade when you're ready.</h2>
          <p className="text-zinc-400 mb-8">All core journaling tools are free. Pro and Elite unlock the full suite.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/signup" className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-lg transition">
              Create Free Account
            </Link>
            <Link href="/pricing" className="px-8 py-4 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-lg transition border border-white/10">
              See Pricing →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <Link href="/"><img src="/logo-full.png" alt="GR8BUX" className="h-8 w-auto opacity-80" /></Link>
          <div className="flex gap-6 text-sm text-zinc-500">
            <Link href="/" className="hover:text-zinc-300 transition">Home</Link>
            <Link href="/pricing" className="hover:text-zinc-300 transition">Pricing</Link>
            <Link href="/auth/signin" className="hover:text-zinc-300 transition">Sign In</Link>
          </div>
          <p className="text-xs text-zinc-700">© {new Date().getFullYear()} GR8BUX. For informational use only. Not financial advice.</p>
        </div>
      </footer>
    </div>
  );
}
