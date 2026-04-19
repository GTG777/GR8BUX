import React, { useState } from 'react';
import Link from 'next/link';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';

/* ─── Types ──────────────────────────────────────────────────────── */
interface Section {
  id: string;
  title: string;
  icon: string;
  route: string;
  tagline: string;
  body: React.ReactNode;
}

/* ─── Reusable sub-components ────────────────────────────────────── */
function Badge({ children, color = 'blue' }: { children: React.ReactNode; color?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray' }) {
  const cls: Record<string, string> = {
    blue:   'bg-blue-100 text-blue-700',
    green:  'bg-green-100 text-green-700',
    amber:  'bg-amber-100 text-amber-700',
    red:    'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
    gray:   'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls[color]}`}>
      {children}
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 mb-4">
      <h4 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">{title}</h4>
      {children}
    </div>
  );
}

function FeatureList({ items }: { items: { label: string; desc: string }[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.label} className="flex gap-2 text-sm">
          <span className="text-blue-500 font-bold shrink-0">▸</span>
          <span><span className="font-semibold text-gray-800">{it.label}</span> — {it.desc}</span>
        </li>
      ))}
    </ul>
  );
}

function IndicatorList({ items }: { items: { label: string; desc: string }[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {items.map((it) => (
        <div key={it.label} className="flex gap-2 text-sm bg-white dark:bg-zinc-900 rounded border border-gray-200 dark:border-zinc-800 p-3">
          <span className="text-indigo-500 font-bold shrink-0">⊛</span>
          <div>
            <span className="font-semibold text-gray-800 block">{it.label}</span>
            <span className="text-gray-500 text-xs">{it.desc}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 mt-3">
      <span className="shrink-0 font-bold">💡</span>
      <span>{children}</span>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mt-3">
      <span className="shrink-0 font-bold">⚠️</span>
      <span>{children}</span>
    </div>
  );
}

/* ─── Page content sections ──────────────────────────────────────── */
const sections: Section[] = [
  /* ── 1. Dashboard ── */
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: '📊',
    route: '/dashboard',
    tagline: 'Your trading command center — performance overview at a glance.',
    body: (
      <>
        <p className="text-sm text-gray-600 mb-4">
          The Dashboard is the first page you see after signing in. It gives you a high-level snapshot
          of your trading activity so you can quickly assess your overall performance without diving into
          individual trade records.
        </p>

        <SectionCard title="Key Metrics Grid">
          <FeatureList items={[
            { label: 'Total Trades', desc: 'Count of all trades you have logged in the journal.' },
            { label: 'Win Rate', desc: 'Percentage of profitable trades out of all completed trades.' },
            { label: 'Total P&L', desc: 'Net profit or loss across all your trades in dollars.' },
            { label: 'Largest Win', desc: 'The single best trade result you have recorded.' },
          ]} />
        </SectionCard>

        <SectionCard title="Charts (coming soon)">
          <FeatureList items={[
            { label: 'P&L Over Time', desc: 'A line chart showing cumulative profit/loss day by day.' },
            { label: 'Win/Loss Distribution', desc: 'Visual breakdown of how often each outcome (win, loss, breakeven) occurs.' },
          ]} />
        </SectionCard>

        <Tip>Use the Dashboard as your morning check-in. If your win rate is dropping, head to the Trades page to review recent entries and identify patterns.</Tip>
      </>
    ),
  },

  /* ── 2. Trades ── */
  {
    id: 'trades',
    title: 'Trades',
    icon: '📋',
    route: '/trades',
    tagline: 'Log every trade, review your history, and track performance.',
    body: (
      <>
        <p className="text-sm text-gray-600 mb-4">
          The Trades page is your journal — the core of the platform. Every trade you take should be
          recorded here for performance tracking and review. You switch between the trade list and the
          entry form using the buttons at the top of the page.
        </p>

        <SectionCard title="Trade History List">
          <FeatureList items={[
            { label: 'Symbol', desc: 'Ticker (e.g., AAPL) for the stock or contract traded.' },
            { label: 'Entry / Exit Price', desc: 'The prices at which the position was opened and closed.' },
            { label: 'P&L', desc: 'Profit or loss for that trade, calculated as (exit − entry) × quantity.' },
            { label: 'Date', desc: 'When the trade was entered.' },
            { label: 'Status', desc: 'Open (still active) or Closed.' },
            { label: 'Edit / Delete', desc: 'Modify trade details or remove a record from the journal.' },
          ]} />
        </SectionCard>

        <SectionCard title="Add a New Trade (Trade Form)">
          <FeatureList items={[
            { label: 'Symbol', desc: 'Enter the ticker symbol (1–5 letters, auto uppercased).' },
            { label: 'Direction', desc: 'Long (you bought) or Short (you sold/shorted).' },
            { label: 'Entry Price & Date', desc: 'The price and date you opened the trade.' },
            { label: 'Exit Price & Date', desc: 'Leave blank if the trade is still open.' },
            { label: 'Quantity', desc: 'Number of shares or contracts.' },
            { label: 'Notes', desc: 'Your thoughts, reasons for entry, or lessons learned. Highly recommended for future review.' },
          ]} />
          <p className="text-xs text-gray-500 mt-2">Click <strong>+ New Trade</strong> to open the form, and <strong>Back to trade list</strong> to return.</p>
        </SectionCard>

        <Tip>Add notes to every trade explaining your reasoning. Reviewing these notes later is one of the most powerful ways to identify where your edge is and where you are giving money back.</Tip>
      </>
    ),
  },

  /* ── 3. Market ── */
  {
    id: 'market',
    title: 'Market',
    icon: '🌐',
    route: '/market',
    tagline: 'Live market overview — indices, sectors, futures, and top movers.',
    body: (
      <>
        <p className="text-sm text-gray-600 mb-4">
          The Market page is your macro-level dashboard. It uses TradingView&apos;s embedded widgets to give
          you a real-time pulse on the broad market, sector rotation, and individual stock movers — all
          without leaving the platform.
        </p>

        <SectionCard title="Ticker Tape">
          <p className="text-sm text-gray-600">
            A scrolling live ticker across the top showing price and day-change for the S&P 500, NASDAQ 100,
            Dow Jones, Russell 2000, VIX, Bitcoin, Ethereum, and major large-cap tech stocks (NVDA, AAPL,
            MSFT, TSLA, META, GOOGL, AMZN).
          </p>
        </SectionCard>

        <SectionCard title="Index Mini Charts">
          <p className="text-sm text-gray-600 mb-2">Four sparkline charts showing the intraday movement of the four main US indices:</p>
          <div className="flex flex-wrap gap-2">
            {['S&P 500 (SPX)', 'NASDAQ 100 (NDX)', 'Dow Jones (DJI)', 'Russell 2000 (RUT)'].map(i => (
              <Badge key={i} color="gray">{i}</Badge>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Market Overview Widget (Tabbed)">
          <FeatureList items={[
            { label: 'Indices Tab', desc: 'S&P 500, NASDAQ, Dow Jones, Russell 2000, and VIX with percentage change.' },
            { label: 'Sectors Tab', desc: 'All 11 GICS sector ETFs (XLK, XLF, XLV, XLC, XLY, XLP, XLI, XLE, XLB, XLU, XLRE).' },
            { label: 'Futures Tab', desc: 'ES1 (S&P futures), NQ1 (NASDAQ futures), YM1 (Dow futures), CL1 (crude oil), GC1 (gold).' },
          ]} />
        </SectionCard>

        <SectionCard title="Sector Performance Heatmap">
          <p className="text-sm text-gray-600">
            A color-coded heat map of all major US ETFs arranged by asset class and market cap. Green cells
            indicate outperformers, red cells indicate underperformers on a percentage change basis.
            Great for spotting sector rotation and risk-on/risk-off shifts.
          </p>
        </SectionCard>

        <SectionCard title="Stock Screener Widget">
          <p className="text-sm text-gray-600">
            A TradingView stock screener preset to the US market. Use it to filter by technical criteria
            or browse general market overview. For more powerful screening, see Options Screener and Stock Scanner.
          </p>
        </SectionCard>

        <SectionCard title="Top Movers / Hotlists">
          <p className="text-sm text-gray-600">
            Lists the top percentage gainers, losers, and most volatile names for the current trading day.
            Useful for finding momentum candidates or checking if a stock you own is making unusual moves.
          </p>
        </SectionCard>

        <Tip>Check the Sectors tab every morning. If XLK (technology) is lagging while XLP (consumer staples) leads, the market is rotating defensively — that context matters for all your technical setups.</Tip>
      </>
    ),
  },

  /* ── 4. Chart ── */
  {
    id: 'chart',
    title: 'Chart',
    icon: '📈',
    route: '/chart',
    tagline: 'Professional charting with EMAs, pivot points, TSI momentum, and smart trade signals.',
    body: (
      <>
        <p className="text-sm text-gray-600 mb-4">
          The Chart page is built for serious technical analysis. It combines TradingView&apos;s advanced
          interactive chart with custom in-house panels — including a fully rendered True Strength Index
          chart, pivot levels, and an automated signal engine — all calculated locally from real Yahoo
          Finance price data.
        </p>

        <SectionCard title="TradingView Advanced Chart">
          <FeatureList items={[
            { label: 'Full interactivity', desc: 'Pan, zoom, draw trendlines, switch timeframes (1m → 1D).' },
            { label: 'EMA Overlays', desc: 'EMA 9 (fast), EMA 21, EMA 50 (trend), EMA 200 (macro trend) plotted directly on candles.' },
            { label: 'Volume', desc: 'Volume histogram at the bottom of the main chart.' },
            { label: 'Symbol search', desc: 'Enter any US or global ticker symbol in the chart\'s top-left search box.' },
          ]} />
        </SectionCard>

        <SectionCard title="True Strength Index (TSI) Chart — In-House">
          <p className="text-sm text-gray-600 mb-3">
            This is our custom-built momentum oscillator chart rendered below the TradingView widget.
            It uses the last 120 trading days of data fetched from Yahoo Finance.
          </p>
          <FeatureList items={[
            { label: 'TSI Line (indigo)', desc: 'The main oscillator. Ranges approximately from −100 to +100.' },
            { label: 'Signal Line (amber dashed)', desc: 'EMA(7) of the TSI. Crossovers are buy/sell signals.' },
            { label: '+25 / −25 Reference Lines', desc: 'Thresholds for overbought (above +25) and oversold (below −25) conditions.' },
            { label: 'Zero Line', desc: 'Crossing above zero signals an uptrend; crossing below signals a downtrend.' },
            { label: 'Bullish / Bearish Badge', desc: 'Shows current TSI vs Signal relationship: Bullish when TSI > Signal.' },
            { label: 'Interpretation Guide', desc: 'Footer explains the four key signals: TSI cross, +25/−25 thresholds, zero-line cross.' },
          ]} />
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            <div className="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-700"><strong>Buy signals:</strong> TSI crosses above Signal · TSI crosses above zero</div>
            <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700"><strong>Sell signals:</strong> TSI crosses below Signal · TSI crosses below zero</div>
          </div>
        </SectionCard>

        <SectionCard title="Pivot Points Panel">
          <FeatureList items={[
            { label: 'PP (Pivot Point)', desc: 'Daily pivot = (Yesterday High + Low + Close) / 3. Acts as the key intraday balance level.' },
            { label: 'R1, R2, R3', desc: 'Resistance levels above PP. Price tends to stall or reverse at these levels.' },
            { label: 'S1, S2, S3', desc: 'Support levels below PP. Strong supports for bounce trades.' },
            { label: '52-Week High / Low', desc: 'The highest and lowest prices over the past 252 trading days, plus % distance from current price.' },
          ]} />
        </SectionCard>

        <SectionCard title="EMA Stack Panel">
          <p className="text-sm text-gray-600 mb-2">
            Shows all four EMAs (9, 21, 50, 200) with visual bars indicating whether price is above or below each.
            A <Badge color="green">Full Bullish</Badge> stack means price is above all four EMAs, which is the 
            strongest trend confirmation.
          </p>
        </SectionCard>

        <SectionCard title="Signals Panel">
          <FeatureList items={[
            { label: 'Golden / Death Cross', desc: 'EMA crossovers (e.g., EMA9 crossing above EMA21 = bullish).' },
            { label: 'TSI Extremes', desc: 'Alerts when TSI goes above +50 (extreme bullish) or below −50 (extreme bearish).' },
            { label: 'S/R Proximity', desc: 'Flags when price is within 0.5% of a pivot support or resistance level.' },
            { label: '52-Week Levels', desc: 'Alerts when price approaches the annual high or low.' },
            { label: 'Pivot Breaks', desc: 'Notifies when price closes above/below the daily pivot point.' },
          ]} />
        </SectionCard>

        <SectionCard title="Indicators Explained">
          <IndicatorList items={[
            { label: 'TSI (25, 13, 7)', desc: 'True Strength Index — double-smoothed momentum: EMA(fast) of EMA(slow) applied to price changes, then normalized. Slow=25, Fast=13, Signal=7.' },
            { label: 'EMA 9', desc: 'Very responsive to short-term price action. Used for day-trading signals.' },
            { label: 'EMA 21', desc: 'Short-term trend filter used in swing trading.' },
            { label: 'EMA 50', desc: 'The most watched moving average on Wall Street. Institutional support/resistance.' },
            { label: 'EMA 200', desc: 'Defines the macro bull/bear trend. Price above = bull market.' },
            { label: 'Pivot Points', desc: 'Classic floor trader levels calculated from previous day\'s H, L, C.' },
          ]} />
        </SectionCard>

        <Tip>Switch to the 1D timeframe for swing trade analysis, and 30m or 1h for intraday. The TSI chart always shows the most recent 120 daily candles regardless of the TV chart timeframe.</Tip>
      </>
    ),
  },

  /* ── 5. Options ── */
  {
    id: 'options',
    title: 'Options',
    icon: '⚙️',
    route: '/options',
    tagline: 'Options strategy analyzer and Greeks calculator powered by Black-Scholes.',
    body: (
      <>
        <p className="text-sm text-gray-600 mb-4">
          The Options page is a strategy modeling tool. Select any of 12 common options strategies,
          enter your parameters, and instantly see the Greeks, P&L curve, breakeven prices, and risk
          metrics — all calculated in real time using the Black-Scholes model.
        </p>

        <SectionCard title="Strategy Selector">
          <p className="text-sm text-gray-600 mb-2">Choose from 12 strategies, organized by complexity:</p>
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <div>
              <p className="font-semibold text-gray-700 mb-1">Single-Leg</p>
              {['Long Call', 'Long Put', 'Covered Call', 'Cash Secured Put (CSP)'].map(s => <div key={s} className="text-gray-600 py-0.5">• {s}</div>)}
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">Spreads</p>
              {['Bull Call Spread', 'Bear Put Spread', 'Bull Put Spread', 'Bear Call Spread'].map(s => <div key={s} className="text-gray-600 py-0.5">• {s}</div>)}
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">Volatility</p>
              {['Long Straddle', 'Long Strangle'].map(s => <div key={s} className="text-gray-600 py-0.5">• {s}</div>)}
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-1">Complex</p>
              {['Iron Condor', 'Long Butterfly'].map(s => <div key={s} className="text-gray-600 py-0.5">• {s}</div>)}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Parameter Inputs">
          <FeatureList items={[
            { label: 'Spot Price', desc: 'Current price of the underlying stock.' },
            { label: 'Strike Price(s)', desc: '1–4 strike inputs depending on the selected strategy.' },
            { label: 'Days to Expiration (DTE)', desc: 'How many calendar days until the options expire.' },
            { label: 'Implied Volatility (IV%)', desc: 'The market\'s expectation of future volatility, expressed as an annualized percentage.' },
            { label: 'Risk-Free Rate', desc: 'The current risk-free rate (usually the 3-month T-bill yield, ~5%).' },
            { label: 'Quantity', desc: 'Number of contracts (each contract controls 100 shares).' },
          ]} />
        </SectionCard>

        <SectionCard title="Legs Table">
          <p className="text-sm text-gray-600">
            For multi-leg strategies, each individual option leg is displayed with its full details:
            strike, type (call/put), direction (long/short), and premium. Greeks are shown per leg:
          </p>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { g: 'Delta (Δ)', d: 'Price sensitivity to a $1 move in the underlying.' },
              { g: 'Gamma (Γ)', d: 'Rate of change of delta per $1 move.' },
              { g: 'Theta (Θ)', d: 'Daily time decay — how much premium is lost each day.' },
              { g: 'Vega (V)', d: 'Sensitivity to a 1% change in implied volatility.' },
            ].map(x => (
              <div key={x.g} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded p-2 text-xs dark:text-zinc-300">
                <div className="font-bold text-gray-800">{x.g}</div>
                <div className="text-gray-500 mt-0.5">{x.d}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="P&L Chart">
          <FeatureList items={[
            { label: 'Expiry P&L Line', desc: 'Shows the profit or loss at expiration across a range of underlying prices.' },
            { label: 'Current P&L Line', desc: 'Shows mark-to-market P&L at current market conditions.' },
            { label: 'Breakeven(s)', desc: 'Price(s) where the strategy breaks even — shown on the chart and listed in the metrics panel.' },
            { label: 'Price Range', desc: 'X-axis spans 65% to 140% of the current spot price to capture all meaningful scenarios.' },
          ]} />
        </SectionCard>

        <SectionCard title="Risk Metrics Panel">
          <FeatureList items={[
            { label: 'Net Debit / Credit', desc: 'Total cost (debit strategies) or premium received (credit strategies).' },
            { label: 'Max Profit', desc: 'The best-case outcome. Unlimited for directional long options, capped for spreads.' },
            { label: 'Max Loss', desc: 'The worst-case outcome. Always limited to what you paid for debit strategies.' },
            { label: 'Breakeven Price(s)', desc: 'Underlying price(s) where you neither profit nor lose at expiration.' },
            { label: 'Probability of Success', desc: 'Risk-neutral probability of the strategy expiring profitable, from the Black-Scholes model.' },
          ]} />
        </SectionCard>

        <Warning>Options pricing changes in real time. The values shown are modeled estimates based on your inputs. Always verify with your broker before placing a trade.</Warning>
      </>
    ),
  },

  /* ── 6. Options Screener ── */
  {
    id: 'scanner',
    title: 'Options Screener',
    icon: '🔍',
    route: '/scanner',
    tagline: 'Scan real options chains for high-probability spread opportunities with statistical edge.',
    body: (
      <>
        <p className="text-sm text-gray-600 mb-4">
          The Options Screener pulls live options chain data directly from Yahoo Finance (including
          real bid/ask prices and implied volatility) and automatically identifies the best Bull Put,
          Bear Call, and Iron Condor spread candidates for your selected symbol. Everything is ranked
          by edge — Probability of Success, Expected Value, and Theta.
        </p>

        <SectionCard title="Symbol Selector">
          <p className="text-sm text-gray-600">
            Click any of the quick-pick tickers (AAPL, GOOGL, MSFT, TSLA, etc.) or type your own in
            the search box. The screener will fetch the live options chain and run all calculations
            automatically.
          </p>
        </SectionCard>

        <SectionCard title="Market Bias Bar">
          <FeatureList items={[
            { label: 'Current Price', desc: 'Live last trade price for the selected symbol.' },
            { label: 'HV10 / HV20 / HV30', desc: 'Historical Volatility over 10, 20, and 30 trading days — the realized volatility of the stock.' },
            { label: 'ATM Implied Volatility', desc: 'The market\'s expectation of future volatility at the money. Compared to HV to detect IV Premium.' },
            { label: 'IV Premium', desc: 'When IV > HV, options are "rich" — a statistical edge for credit strategies (selling spreads).' },
            { label: 'EMA20 & % Distance', desc: 'Whether price is above or below the 20-day EMA and by how much.' },
            { label: 'Market Bias', desc: 'Bullish ▲ / Bearish ▼ / Neutral → based on price vs. EMA and momentum. Suggests which spread direction has the most wind behind it.' },
          ]} />
        </SectionCard>

        <SectionCard title="Filter Controls">
          <FeatureList items={[
            { label: 'Min Probability of Profit', desc: 'Slider (55–80%). Only spreads with PoP above this threshold are shown. Higher = more conservative.' },
            { label: 'Spread Width', desc: 'Target width of the spread in dollars ($5, $10, $25, $50). Wider spreads = more credit but more risk.' },
            { label: 'Strategy Type', desc: 'Toggle Bull Put Spreads (bullish/neutral), Bear Call Spreads (bearish/neutral), or Iron Condors (neutral).' },
          ]} />
        </SectionCard>

        <SectionCard title="TradingView Mini Chart">
          <p className="text-sm text-gray-600">
            A daily candlestick chart of the selected symbol with EMA20, EMA50, and Volume overlays.
            Use it to confirm your directional bias before acting on any spread recommendation.
          </p>
        </SectionCard>

        <SectionCard title="Top Opportunity Cards">
          <p className="text-sm text-gray-600 mb-2">
            The top 1–3 ranked spreads are displayed as detailed cards. Each card shows:
          </p>
          <FeatureList items={[
            { label: 'Expiry Date', desc: 'When the options expire. Displayed prominently at the top of the card.' },
            { label: 'Strike Prices', desc: 'The short and long strikes of the spread (e.g., 180/175 Put Spread).' },
            { label: 'Probability of Success', desc: 'Large percentage showing the statistical likelihood of this spread expiring worthless (profit for the seller).' },
            { label: 'Credit Received', desc: 'Cash collected when selling the spread.' },
            { label: 'Max Loss', desc: 'Width of spread minus credit received. This is your maximum risk if wrong.' },
            { label: 'Risk : Reward', desc: 'e.g., 1:3 means risk $3 to potentially keep $1 collected.' },
            { label: 'Return on Risk', desc: 'Credit ÷ Max Loss as a percentage.' },
            { label: 'Expected Value (EV)', desc: 'PoP × Credit − (1 − PoP) × MaxLoss. Positive EV = statistical edge.' },
            { label: 'Theta / Day', desc: 'How much premium the spread decays per calendar day. Positive theta means time works in your favor.' },
          ]} />
        </SectionCard>

        <SectionCard title="Results Table (All Spreads)">
          <p className="text-sm text-gray-600 mb-2">
            Below the top cards, a full sortable table shows every spread that passed your filters.
            Click any column header to sort. Key columns include: DTE, Expiry, Strategy, Strikes,
            Credit, Max Loss, R:R, IV, PoP, Theta, EV, Credit-to-Width ratio, Breakevens.
          </p>
        </SectionCard>

        <SectionCard title="Formulas Used">
          <IndicatorList items={[
            { label: 'Probability of Success (PoP)', desc: 'Risk-neutral probability P(Sₜ > K) using d2 from Black-Scholes.' },
            { label: 'Historical Volatility (HV)', desc: 'Annualized std dev of log returns: σ√252 × 100.' },
            { label: 'Expected Value (EV)', desc: 'EV = (PoP × Credit) − ((1 − PoP) × MaxLoss).' },
            { label: 'IV Premium', desc: 'ATM mid-point IV minus HV20. Positive = options are expensive relative to realized vol.' },
            { label: 'Credit-to-Width Ratio', desc: 'Credit ÷ (Spread Width × 100). Higher ratio = better capital efficiency.' },
          ]} />
        </SectionCard>

        <Tip>The best setups have: positive EV, PoP above 65%, and positive Theta. After hours the screener falls back to last-trade price when bid/ask are zero — this is normal.</Tip>
        <Warning>Probability and EV are statistical estimates. No spread is guaranteed to be profitable. Always size positions to risk no more than 1–2% of your account on any single trade.</Warning>
      </>
    ),
  },

  /* ── 7. Stock Scanner ── */
  {
    id: 'stocks',
    title: 'Stock Scanner',
    icon: '🚀',
    route: '/stocks',
    tagline: 'Scan any stock for high-probability technical setups with precise entry, stop, and target levels.',
    body: (
      <>
        <p className="text-sm text-gray-600 mb-4">
          The Stock Scanner analyzes any US stock using up to two years of daily price history fetched
          from Yahoo Finance. It computes a full suite of technical indicators locally and automatically
          detects up to 7 distinct setup types, each with a specific entry price, stop loss, two profit
          targets, Probability of Success, and Risk:Reward ratio.
        </p>

        <SectionCard title="Symbol Input">
          <FeatureList items={[
            { label: 'Quick Picks', desc: 'Click SPY, QQQ, AAPL, NVDA, TSLA, MSFT, AMZN, GOOGL, META, or JPM to instantly scan them.' },
            { label: 'Custom Ticker', desc: 'Type any US stock symbol in the search box and click Scan.' },
          ]} />
        </SectionCard>

        <SectionCard title="TradingView Chart">
          <p className="text-sm text-gray-600">
            An embedded interactive daily chart with EMA 20, EMA 50, EMA 200, and Volume overlays.
            Use this to visually confirm any setup detected below. Note: all indicator calculations
            (TSI, ATR, etc.) are done separately from real Yahoo Finance data — they are not dependent
            on the TradingView chart.
          </p>
        </SectionCard>

        <SectionCard title="True Strength Index (TSI) Chart — In-House">
          <p className="text-sm text-gray-600 mb-2">
            The same in-house TSI chart from the Chart page is rendered directly below the TradingView
            widget. It shows the last 120 daily bars of TSI and Signal computed from real price data.
          </p>
          <FeatureList items={[
            { label: 'TSI Line (indigo)', desc: 'Double-smoothed momentum oscillator, params: slow=25, fast=13.' },
            { label: 'Signal Line (amber dashed)', desc: 'EMA(7) of TSI. Crossovers indicate momentum shifts.' },
            { label: '±25 Reference Bands', desc: 'Overbought above +25, oversold below −25.' },
            { label: 'Bullish/Bearish Badge', desc: 'Real-time status based on TSI vs Signal relationship.' },
          ]} />
        </SectionCard>

        <SectionCard title="Technical Snapshot Bar (TechBar)">
          <p className="text-sm text-gray-600 mb-2">A dark bar below the TSI chart showing all computed indicator values at a glance:</p>
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            {[
              'Price & Daily Change %',
              'Trend Score (−3 to +3)',
              'TSI value + Signal + Label',
              'MACD Line / Signal / Histogram',
              'ATR(14) — daily range volatility',
              'HV20 — 20-day historical volatility',
              'Volume Ratio vs. 20-day average',
              'Bollinger Bands (Upper / Middle / Lower)',
            ].map(item => (
              <div key={item} className="flex gap-2 bg-gray-800 text-gray-200 rounded px-2 py-1">
                <span className="text-blue-400">▸</span>{item}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Setup Cards (7 Setup Types)">
          <p className="text-sm text-gray-600 mb-3">
            When one or more setups are detected for the scanned symbol, they appear as cards.
            Each card contains a full trade plan:
          </p>
          <div className="grid sm:grid-cols-2 gap-2 mb-3">
            {[
              { name: '📈 Uptrend Continuation', cond: 'All 3 EMAs aligned bullish, TSI 0–50, MACD histogram positive.' },
              { name: '↩️ EMA20 Pullback', cond: 'Price pulling back to EMA20 in an uptrend; TSI between −10 and +25.' },
              { name: '⚓ EMA50 Bounce', cond: 'Price testing EMA50 while above EMA200; TSI between −20 and +20.' },
              { name: '🔄 Oversold Bounce', cond: 'TSI below −25, price near or at lower Bollinger Band, above EMA200.' },
              { name: '🚀 20-Day Breakout', cond: 'Price at or above 20-day high, volume ratio ≥ 1.4×, TSI 10–70, trend positive.' },
              { name: '📉 Bear Trend Short', cond: 'All 3 EMAs aligned bearish, TSI −50 to 0, MACD histogram negative.' },
              { name: '🔻 Overbought Reversion Short', cond: 'TSI above +50, price at or above upper Bollinger Band, weak trend.' },
            ].map(s => (
              <div key={s.name} className="text-xs bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded p-2">
                <div className="font-bold text-gray-800 mb-1">{s.name}</div>
                <div className="text-gray-500">{s.cond}</div>
              </div>
            ))}
          </div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Each card shows:</p>
          <FeatureList items={[
            { label: 'Entry Price', desc: 'Current market price where you would enter the trade.' },
            { label: 'Stop Loss', desc: 'Placed at 1.5–2× ATR(14) from entry in the adverse direction.' },
            { label: 'Target 1 (2:1)', desc: 'First profit target at 2× the stop distance from entry.' },
            { label: 'Target 2 (3:1)', desc: 'Stretch target at 3× the stop distance.' },
            { label: 'Probability of Success', desc: 'Estimated win rate for setups of this type, adjusted by current conditions (40–75%).' },
            { label: 'Risk : Reward', desc: 'Always 1:2 to Target 1, and 1:3 to Target 2.' },
            { label: 'Grade (A / B / C)', desc: 'A = PoP ≥ 65%, B = PoP ≥ 55%, C = PoP < 55%.' },
            { label: '3 Reason Bullets', desc: 'Specific conditions that triggered this setup (e.g., TSI bullish, volume surge, EMA alignment).' },
          ]} />
        </SectionCard>

        <SectionCard title="Indicators Computed">
          <IndicatorList items={[
            { label: 'TSI (25, 13, 7)', desc: 'Double-smoothed momentum. Used in all 7 setup conditions instead of RSI.' },
            { label: 'EMA 20 / 50 / 200', desc: 'Trend filters. Trend score is +1 for each EMA that price is above, −1 for each below.' },
            { label: 'ATR (14)', desc: 'Average True Range over 14 days. Used to size stop losses.' },
            { label: 'Bollinger Bands (20, 2)', desc: 'Upper / middle (SMA20) / lower bands. Used for breakout and mean-reversion setups.' },
            { label: 'MACD (12, 26, 9)', desc: 'Trend confirmation. Positive histogram = bullish momentum, negative = bearish.' },
            { label: 'HV20', desc: '20-day Historical Volatility — annualized realized vol, shown in TechBar.' },
            { label: 'Volume Ratio', desc: 'Today\'s volume ÷ 20-day average. Ratio ≥ 1.4 = volume confirmation.' },
            { label: '20-Day High/Low', desc: 'Rolling 20-candle highest high and lowest low. Used for breakout detection.' },
          ]} />
        </SectionCard>

        <Tip>No setups appearing? The scanner requires specific technical conditions to be met simultaneously. Try scanning after a multi-day pullback in an uptrending stock — conditions for Uptrend Continuation and EMA20 Pullback setups are often best then.</Tip>
        <Warning>All setup levels are estimates based on historically observed patterns. Always use your own judgment and proper position sizing. The scanner is a starting point, not a guarantee.</Warning>
      </>
    ),
  },

  /* ── 8. News ── */
  {
    id: 'news',
    title: 'News',
    icon: '📰',
    route: '/news',
    tagline: 'Financial news aggregation by symbol or by market sector.',
    body: (
      <>
        <p className="text-sm text-gray-600 mb-4">
          The News page pulls real financial news so you can stay informed about the stocks and sectors
          relevant to your positions. It offers two distinct views: news filtered by specific tickers
          you choose, and a macro-level sector-by-sector news feed covering all 11 GICS sectors.
        </p>

        <SectionCard title="By Symbol Tab (📰)">
          <FeatureList items={[
            { label: 'Symbol Chips', desc: 'A row of pill-shaped chips showing your current symbols (default: AAPL, GOOGL, MSFT, TSLA). Click the × to remove any.' },
            { label: 'Add Symbols', desc: 'Type a ticker in the input box and press Enter or click Add. Up to any number of symbols supported.' },
            { label: 'News Articles', desc: 'Articles are displayed below the chips, fetched for all selected symbols. Shows headline, source, and publication time.' },
            { label: 'Max 50 articles', desc: 'The feed caps at 50 articles per query to keep the page responsive.' },
          ]} />
          <Tip>Add your open positions as symbols here each morning to catch any pre-market news that could affect your trades.</Tip>
        </SectionCard>

        <SectionCard title="All 11 Sectors Tab (🏛️)">
          <p className="text-sm text-gray-600 mb-2">
            A grid view showing all 11 GICS market sectors, each with its representative ETF and
            the latest news headlines from that sector:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {[
              ['XLK', 'Technology'], ['XLF', 'Financials'], ['XLV', 'Health Care'],
              ['XLC', 'Communication'], ['XLY', 'Consumer Disc.'], ['XLP', 'Consumer Staples'],
              ['XLI', 'Industrials'], ['XLE', 'Energy'], ['XLB', 'Materials'],
              ['XLU', 'Utilities'], ['XLRE', 'Real Estate'],
            ].map(([etf, name]) => (
              <div key={etf} className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 flex gap-1">
                <Badge color="blue">{etf}</Badge>
                <span className="text-gray-600">{name}</span>
              </div>
            ))}
          </div>
          <Tip>Use the Sectors tab to spot macro themes — if XLE (Energy) has only negative headlines while XLK is seeing positive news, that tells you something about current money flows.</Tip>
        </SectionCard>
      </>
    ),
  },

  /* ── 9. Community ── */
  {
    id: 'community',
    title: 'Community',
    icon: '💬',
    route: '/community',
    tagline: 'Real-time retail trader sentiment from Reddit and StockTwits.',
    body: (
      <>
        <p className="text-sm text-gray-600 mb-4">
          The Community page aggregates social media activity around the stocks you care about.
          It shows you what retail traders on Reddit and StockTwits are discussing, their sentiment
          direction, and engagement levels — giving you a window into crowd psychology.
        </p>

        <SectionCard title="Symbol Watchlist (Controls)">
          <FeatureList items={[
            { label: 'Add Symbols', desc: 'Type any ticker and click Add. The default watchlist is AAPL, GOOGL, MSFT.' },
            { label: 'Remove Symbols', desc: 'Click the × on any chip to remove a symbol from your community feed.' },
          ]} />
        </SectionCard>

        <SectionCard title="Source Filter">
          <FeatureList items={[
            { label: 'All Sources', desc: 'Show posts from both Reddit and StockTwits combined.' },
            { label: 'Reddit 🔴', desc: 'Show only Reddit discussions (r/stocks, r/wallstreetbets, etc.).' },
            { label: 'StockTwits 💬', desc: 'Show only StockTwits posts — the most concentrated retail options community.' },
          ]} />
        </SectionCard>

        <SectionCard title="Sentiment Display (Talk of the Town)">
          <FeatureList items={[
            { label: 'Bullish / Neutral / Bearish Distribution', desc: 'Percentage breakdown of sentiment across all visible posts for your symbols.' },
            { label: 'Post Feed', desc: 'Recent posts/comments from selected symbols with source attribution and timestamps.' },
            { label: 'Engagement Metrics', desc: 'Upvote counts and reply counts to gauge post traction.' },
          ]} />
        </SectionCard>

        <Warning>Social sentiment is a contrary indicator as often as it is a leading one. Extremely bullish sentiment with high engagement on retail platforms can signal an overextended move, not a safe entry.</Warning>
      </>
    ),
  },

  /* ── 10. Technical ── */
  {
    id: 'technical',
    title: 'Technical',
    icon: '🔬',
    route: '/technical',
    tagline: 'Pattern recognition and technical setup detection for any stock.',
    body: (
      <>
        <p className="text-sm text-gray-600 mb-4">
          The Technical page focuses on detecting recurring chart patterns — coiling, consolidation,
          trend continuation, and EMA-based setups — for any symbol. It fetches daily candle data
          and runs indicator calculations server-side, then displays detected setups as actionable cards.
        </p>

        <SectionCard title="Symbol Selection Panel">
          <FeatureList items={[
            { label: 'Symbol Input', desc: 'Enter any stock ticker and click Analyze to run the technical scan.' },
            { label: 'Current Symbol Display', desc: 'Shows the active symbol in a blue info box.' },
            { label: 'Loading / Error States', desc: 'A spinner shows while data is being fetched; error messages appear if the symbol is invalid or data unavailable.' },
          ]} />
        </SectionCard>

        <SectionCard title="Detected Setups (Setup Cards)">
          <p className="text-sm text-gray-600 mb-2">Setups detected include coiling, consolidation, EMA bounces, trend continuation, and more. Each card shows:</p>
          <FeatureList items={[
            { label: 'Setup Name & Icon', desc: 'Descriptive label (e.g., "Uptrend Continuation") with an icon for quick scanning.' },
            { label: 'Direction', desc: 'Long (bullish) or Short (bearish).' },
            { label: 'Entry / Stop / Targets', desc: 'Specific price levels with 2:1 and 3:1 reward-to-risk targets.' },
            { label: 'Probability of Success & Grade', desc: 'Statistical estimate of win rate (A = ≥65%, B = ≥55%, C = <55%).' },
            { label: 'Reasons / Confluences', desc: 'Bullet points explaining which conditions triggered the setup.' },
          ]} />
        </SectionCard>

        <SectionCard title="Educational Panels">
          <FeatureList items={[
            { label: 'What is Technical Analysis?', desc: 'A concise explanation of TA concepts: support/resistance, trend, coiling patterns, and moving averages.' },
            { label: '⚠️ Risk Disclaimer', desc: 'Reminder that all setups are educational and not financial advice. Proper risk management is essential.' },
          ]} />
        </SectionCard>

        <SectionCard title="Indicators Used">
          <IndicatorList items={[
            { label: 'Trend Score (−3 to +3)', desc: 'Price above EMA20/50/200 = +1 each, below = −1 each.' },
            { label: 'ATR (14)', desc: 'Volatility measure for stop placement.' },
            { label: 'Bollinger Bands (20, 2)', desc: 'Identifies squeeze/expansion and overbought/oversold conditions.' },
            { label: 'MACD (12, 26, 9)', desc: 'Trend/momentum confirmation across setups.' },
            { label: 'HV20', desc: '20-day realized annualized volatility.' },
            { label: 'Coiling Score', desc: 'Proprietary tightening range detection algorithm.' },
          ]} />
        </SectionCard>

        <Tip>The Technical page and the Stock Scanner use the same underlying detection logic. The key difference is that Stock Scanner shows a full chart and TSI panel — use Technical for a faster, chart-free deep dive into multi-symbol analysis.</Tip>
      </>
    ),
  },

  /* ── 11. Watchlist ── */
  {
    id: 'watchlist',
    title: 'Watchlist',
    icon: '⚡',
    route: '/watchlist',
    tagline: 'Monitor multiple symbols with live prices and key technical readings in one table.',
    body: (
      <>
        <p className="text-sm text-gray-600 mb-4">
          The Watchlist page lets you track any number of stock symbols side by side.
          It fetches live price data and computes TSI and coiling strength in parallel for every
          symbol you add. Your watchlist is saved to your browser&apos;s local storage so it persists
          between sessions.
        </p>

        <SectionCard title="Add / Refresh Symbols">
          <FeatureList items={[
            { label: 'Add Symbol', desc: 'Type a ticker (1–5 characters) in the input box and press Enter or click Add.' },
            { label: 'Refresh All', desc: 'Click to re-fetch all data for every symbol in your watchlist (useful after market open or close).' },
            { label: 'Remove Symbol', desc: 'Click the remove button (trash / × icon) on any row to delete it from your watchlist.' },
          ]} />
        </SectionCard>

        <SectionCard title="Watchlist Table Columns">
          <FeatureList items={[
            { label: 'Ticker', desc: 'The stock symbol.' },
            { label: 'Price', desc: 'Current last-trade price.' },
            { label: 'Day Change', desc: 'Dollar change and percentage change from the previous close.' },
            { label: 'TSI', desc: 'True Strength Index value — green if positive (bullish), red if negative (bearish).' },
            { label: 'Coiling', desc: '"Yes ⚡" badge if the stock is currently in a coiling (tightening range) pattern; "No" otherwise.' },
            { label: 'Coiling Strength', desc: 'A percentage bar showing how strong the coiling is: blue (mild) → yellow (moderate) → red (strong coiling).' },
          ]} />
        </SectionCard>

        <SectionCard title="Sorting">
          <p className="text-sm text-gray-600">
            Click any column header to sort the table by that metric. Click again to reverse the sort order (↑↓ indicators show the current direction).
            Null values always sort last.
          </p>
        </SectionCard>

        <SectionCard title="Data Persistence">
          <p className="text-sm text-gray-600">
            Your watchlist symbols are saved to <code className="bg-gray-100 px-1 rounded text-xs">localStorage</code> in your browser.
            They will be restored the next time you visit — even after closing and reopening the page.
            The default watchlist (if nothing is saved) is AAPL, MSFT, GOOGL.
          </p>
        </SectionCard>

        <Tip>Sort by &quot;Coiling Strength&quot; every morning. High-coiling stocks have compressed price ranges and often precede large breakout moves — they pair perfectly with a scan on the Stock Scanner or Technical page.</Tip>
      </>
    ),
  },

  /* ── 12. Profile ── */
  {
    id: 'profile',
    title: 'Profile',
    icon: '👤',
    route: '/profile',
    tagline: 'Your account details, role permissions, and password management.',
    body: (
      <>
        <p className="text-sm text-gray-600 mb-4">
          The Profile page shows your account information, explains your current access level and
          permissions, and lets you update your password. Admin users also have a direct link to
          the Admin Panel from here.
        </p>

        <SectionCard title="Profile Card">
          <FeatureList items={[
            { label: 'Avatar', desc: 'Your initials displayed in a colored circle.' },
            { label: 'Display Name & Email', desc: 'Your registered name and email address.' },
            { label: 'Role', desc: 'User, Manager, or Admin — determines what features you can access.' },
            { label: 'Email Verification Status', desc: 'Green "Verified" or yellow "Unverified".' },
            { label: 'Member Since', desc: 'The date your account was created.' },
            { label: 'User ID', desc: 'Your unique account identifier (first 16 characters shown).' },
          ]} />
        </SectionCard>

        <SectionCard title="Role Permissions">
          <p className="text-sm text-gray-600 mb-2">Your permissions are displayed with ✅ (granted) and ❌ (denied) indicators:</p>
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            {[
              { perm: 'View Dashboard & Trades', roles: 'All roles' },
              { perm: 'Log & Edit Trades', roles: 'All roles' },
              { perm: 'View Analytics', roles: 'All roles' },
              { perm: 'Manage Team Members', roles: 'Manager + Admin' },
              { perm: 'Admin Panel & User Management', roles: 'Admin only' },
            ].map(p => (
              <div key={p.perm} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded p-2">
                <div className="font-semibold text-gray-800">{p.perm}</div>
                <div className="text-gray-500">{p.roles}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Change Password">
          <FeatureList items={[
            { label: 'New Password', desc: 'Must be at least 6 characters.' },
            { label: 'Confirm Password', desc: 'Must match the new password field exactly.' },
            { label: 'Submit', desc: 'Updates your credentials immediately. You will see a success or error message.' },
          ]} />
        </SectionCard>

        <SectionCard title="Admin Zone (Admin role only)">
          <p className="text-sm text-gray-600">
            A red-bordered &quot;Admin Zone&quot; card appears only for users with the Admin role.
            It contains a button that takes you directly to <code className="bg-gray-100 px-1 rounded text-xs">/admin</code> for
            full user management — viewing all users, changing roles, and managing accounts.
          </p>
        </SectionCard>
      </>
    ),
  },
];

/* ─── Main Help Page ──────────────────────────────────────────────── */
function HelpPageContent() {
  const [active, setActive] = useState(sections[0].id);

  const current = sections.find((s) => s.id === active) ?? sections[0];

  return (
    <Layout title="Help & Documentation">
      <div className="max-w-7xl mx-auto">
        {/* Page header */}
        <div className="mb-6 bg-gradient-to-r from-indigo-600 to-blue-500 rounded-2xl px-6 py-8 text-white shadow-lg">
          <h1 className="text-2xl font-bold mb-1">GR8BUX Help & Documentation</h1>
          <p className="text-indigo-100 text-sm">
            A complete reference guide for every page and feature in the platform.
            Select a page from the left to jump to its documentation.
          </p>
        </div>

        <div className="flex gap-6">
          {/* ── Left nav ── */}
          <aside className="w-52 shrink-0">
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm overflow-hidden sticky top-4">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Pages</p>
              </div>
              <nav className="py-2">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
                      active === s.id
                        ? 'bg-indigo-50 text-indigo-700 font-semibold border-r-2 border-indigo-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <span className="text-base">{s.icon}</span>
                    <span className="truncate">{s.title}</span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* ── Content area ── */}
          <main className="flex-1 min-w-0">
            {/* Section header */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm p-5 mb-4">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl">{current.icon}</span>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-gray-900">{current.title}</h2>
                    <Link
                      href={current.route}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-mono bg-indigo-50 px-2 py-0.5 rounded hover:bg-indigo-100 transition-colors"
                    >
                      {current.route} ↗
                    </Link>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{current.tagline}</p>
                </div>
              </div>
            </div>

            {/* Section body */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm p-5">
              {current.body}
            </div>

            {/* Pagination buttons */}
            <div className="mt-4 flex justify-between">
              {sections.findIndex((s) => s.id === active) > 0 && (
                <button
                  onClick={() => {
                    const idx = sections.findIndex((s) => s.id === active);
                    setActive(sections[idx - 1].id);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  ← {sections[sections.findIndex((s) => s.id === active) - 1].title}
                </button>
              )}
              <div className="flex-1" />
              {sections.findIndex((s) => s.id === active) < sections.length - 1 && (
                <button
                  onClick={() => {
                    const idx = sections.findIndex((s) => s.id === active);
                    setActive(sections[idx + 1].id);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {sections[sections.findIndex((s) => s.id === active) + 1].title} →
                </button>
              )}
            </div>
          </main>
        </div>
      </div>
    </Layout>
  );
}

export default function HelpPage() {
  return (
    <ProtectedRoute requiredRoles={['admin']}>
      <HelpPageContent />
    </ProtectedRoute>
  );
}
