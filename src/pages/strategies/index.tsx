import React, { useState } from 'react';
import { Layout } from '@/components/Layout';

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
type Bias    = 'bullish' | 'bearish' | 'neutral' | 'volatile';
type ProfitT = 'limited' | 'unlimited';
type LossT   = 'limited' | 'unlimited';
type DiagramT =
  | 'long-call' | 'long-put' | 'short-call' | 'short-put'
  | 'bull-call' | 'bull-put' | 'bear-call' | 'bear-put'
  | 'iron-condor' | 'iron-butterfly' | 'straddle' | 'strangle'
  | 'short-straddle' | 'short-strangle'
  | 'covered-call' | 'protective-put' | 'cash-secured-put'
  | 'collar' | 'calendar'
  | 'ratio-backspread-call' | 'ratio-backspread-put'
  | 'long-butterfly-call' | 'short-butterfly-call'
  | 'broken-wing-put' | 'broken-wing-call'
  | 'jade-lizard' | 'reverse-jade-lizard'
  | 'synthetic-long' | 'synthetic-short' | 'synthetic-put'
  | 'strip' | 'strap'
  | 'ratio-spread-call' | 'ratio-spread-put'
  | 'double-diagonal';

interface Strategy {
  name: string;
  bias: Bias;
  profit: ProfitT;
  loss: LossT;
  description: string;
  legs: string[];
  diagram: DiagramT;
}

interface Group {
  label: string;
  strategies: Strategy[];
}

interface Category {
  level: string;
  color: string;          // Tailwind text color for the level badge
  groups: Group[];
}

/* ─────────────────────────────────────────────
   Strategy Data
───────────────────────────────────────────── */
const CATEGORIES: Category[] = [
  {
    level: 'Novice',
    color: 'text-green-600',
    groups: [
      {
        label: 'BASIC',
        strategies: [
          {
            name: 'Long Call',
            bias: 'bullish', profit: 'unlimited', loss: 'limited',
            description: 'Buy a call option. Profits when the stock rises above the strike + premium paid.',
            legs: ['Buy 1 call at strike A'],
            diagram: 'long-call',
          },
          {
            name: 'Long Put',
            bias: 'bearish', profit: 'limited', loss: 'limited',
            description: 'Buy a put option. Profits when the stock falls below the strike minus premium paid.',
            legs: ['Buy 1 put at strike A'],
            diagram: 'long-put',
          },
        ],
      },
      {
        label: 'INCOME',
        strategies: [
          {
            name: 'Covered Call',
            bias: 'neutral', profit: 'limited', loss: 'unlimited',
            description: 'Own 100 shares and sell an OTM call to generate income. Caps upside but reduces cost basis.',
            legs: ['Own 100 shares', 'Sell 1 call at strike A (OTM)'],
            diagram: 'covered-call',
          },
          {
            name: 'Cash-Secured Put',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Sell an OTM put backed by enough cash to buy the shares. Collect premium; get paid to wait.',
            legs: ['Sell 1 put at strike A', 'Hold cash equal to 100 × strike A'],
            diagram: 'cash-secured-put',
          },
        ],
      },
      {
        label: 'OTHER',
        strategies: [
          {
            name: 'Protective Put',
            bias: 'bullish', profit: 'unlimited', loss: 'limited',
            description: 'Own shares and buy a put to insure against downside. Acts like a stock + insurance policy.',
            legs: ['Own 100 shares', 'Buy 1 put at strike A (OTM)'],
            diagram: 'protective-put',
          },
        ],
      },
    ],
  },
  {
    level: 'Intermediate',
    color: 'text-blue-600',
    groups: [
      {
        label: 'CREDIT SPREADS',
        strategies: [
          {
            name: 'Bull Put Spread',
            bias: 'bullish', profit: 'limited', loss: 'limited',
            description: 'Sell a higher-strike put, buy a lower-strike put. Collect net credit. Profits if price stays above short put at expiry.',
            legs: ['Sell 1 put at strike B (higher)', 'Buy 1 put at strike A (lower)'],
            diagram: 'bull-put',
          },
          {
            name: 'Bear Call Spread',
            bias: 'bearish', profit: 'limited', loss: 'limited',
            description: 'Sell a lower-strike call, buy a higher-strike call. Collect net credit. Profits if price stays below short call at expiry.',
            legs: ['Sell 1 call at strike A (lower)', 'Buy 1 call at strike B (higher)'],
            diagram: 'bear-call',
          },
        ],
      },
      {
        label: 'NEUTRAL',
        strategies: [
          {
            name: 'Iron Butterfly',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Sell ATM straddle, buy OTM strangle wings for protection. Max profit if price pins at the short strikes at expiry.',
            legs: ['Buy 1 put at strike A', 'Sell 1 put at strike B (ATM)', 'Sell 1 call at strike B (ATM)', 'Buy 1 call at strike C'],
            diagram: 'iron-butterfly',
          },
          {
            name: 'Iron Condor',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Sell OTM strangle, buy wider strangle wings. Profits in a defined range. Most popular income strategy.',
            legs: ['Buy 1 put at strike A', 'Sell 1 put at strike B', 'Sell 1 call at strike C', 'Buy 1 call at strike D'],
            diagram: 'iron-condor',
          },
          {
            name: 'Long Put Butterfly',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Buy two OTM puts, sell two ATM puts. Low cost debit spread that profits if price ends near the short strikes.',
            legs: ['Buy 1 put at strike A (lower wing)', 'Sell 2 puts at strike B (body)', 'Buy 1 put at strike C (upper wing)'],
            diagram: 'long-butterfly-call',
          },
          {
            name: 'Long Call Butterfly',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Buy two OTM calls, sell two ATM calls. Low cost debit spread that profits if price ends near the short strikes.',
            legs: ['Buy 1 call at strike A', 'Sell 2 calls at strike B (body)', 'Buy 1 call at strike C'],
            diagram: 'long-butterfly-call',
          },
        ],
      },
      {
        label: 'CALENDAR SPREADS',
        strategies: [
          {
            name: 'Calendar Call Spread',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Sell a near-term call and buy a later-term call at the same strike. Profits from time decay differential.',
            legs: ['Sell 1 near-term call at strike A', 'Buy 1 far-term call at strike A'],
            diagram: 'calendar',
          },
          {
            name: 'Calendar Put Spread',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Sell a near-term put and buy a later-term put at the same strike. Profits from time decay differential.',
            legs: ['Sell 1 near-term put at strike A', 'Buy 1 far-term put at strike A'],
            diagram: 'calendar',
          },
          {
            name: 'Diagonal Call Spread',
            bias: 'bullish', profit: 'limited', loss: 'limited',
            description: 'Sell a near-term OTM call and buy a longer-dated call at a lower strike. Combines calendar and vertical spread.',
            legs: ['Buy 1 far-term call at strike A (lower)', 'Sell 1 near-term call at strike B (higher, OTM)'],
            diagram: 'calendar',
          },
          {
            name: 'Diagonal Put Spread',
            bias: 'bearish', profit: 'limited', loss: 'limited',
            description: 'Sell a near-term put and buy a later-expiry put further in the money. Changes the shape of the risk profile.',
            legs: ['Sell 1 near-term put at strike A', 'Buy 1 far-term put at strike B (further expiration)'],
            diagram: 'calendar',
          },
        ],
      },
      {
        label: 'DEBIT SPREADS',
        strategies: [
          {
            name: 'Bull Call Spread',
            bias: 'bullish', profit: 'limited', loss: 'limited',
            description: 'Buy a lower-strike call, sell a higher-strike call for a net debit. Cheaper than a naked long call with capped upside.',
            legs: ['Buy 1 call at strike A (lower)', 'Sell 1 call at strike B (higher)'],
            diagram: 'bull-call',
          },
          {
            name: 'Bear Put Spread',
            bias: 'bearish', profit: 'limited', loss: 'limited',
            description: 'Buy a higher-strike put, sell a lower-strike put for a net debit. Cheaper than a naked long put with capped profit.',
            legs: ['Buy 1 put at strike B (higher)', 'Sell 1 put at strike A (lower)'],
            diagram: 'bear-put',
          },
        ],
      },
      {
        label: 'DIRECTIONAL',
        strategies: [
          {
            name: 'Inverse Iron Butterfly',
            bias: 'volatile', profit: 'limited', loss: 'limited',
            description: 'Buy ATM straddle, sell OTM strangle wings. Profits from large moves in either direction. Reverse of Iron Butterfly.',
            legs: ['Sell 1 put at strike A', 'Buy 1 put at strike B (ATM)', 'Buy 1 call at strike B (ATM)', 'Sell 1 call at strike C'],
            diagram: 'straddle',
          },
          {
            name: 'Inverse Iron Condor',
            bias: 'volatile', profit: 'limited', loss: 'limited',
            description: 'Buy OTM strangle, sell wider strangle. Profits from large moves in either direction.',
            legs: ['Sell 1 put at strike A', 'Buy 1 put at strike B', 'Buy 1 call at strike C', 'Sell 1 call at strike D'],
            diagram: 'straddle',
          },
          {
            name: 'Short Put Butterfly',
            bias: 'volatile', profit: 'limited', loss: 'limited',
            description: 'Sell the outer wings, buy the body. Profits when price moves away from the center strikes.',
            legs: ['Sell 1 put at strike A', 'Buy 2 puts at strike B', 'Sell 1 put at strike C'],
            diagram: 'short-butterfly-call',
          },
          {
            name: 'Short Call Butterfly',
            bias: 'volatile', profit: 'limited', loss: 'limited',
            description: 'Sell outer call wings, buy the body. Net credit. Profits when price moves significantly away from center.',
            legs: ['Sell 1 call at strike A', 'Buy 2 calls at strike B', 'Sell 1 call at strike C'],
            diagram: 'short-butterfly-call',
          },
          {
            name: 'Straddle',
            bias: 'volatile', profit: 'unlimited', loss: 'limited',
            description: 'Buy an ATM call and ATM put at the same strike and expiry. Profits from large moves in either direction.',
            legs: ['Buy 1 call at strike A (ATM)', 'Buy 1 put at strike A (ATM)'],
            diagram: 'straddle',
          },
          {
            name: 'Strangle',
            bias: 'volatile', profit: 'unlimited', loss: 'limited',
            description: 'Buy an OTM call and OTM put at different strikes. Cheaper than a straddle but needs a bigger move to profit.',
            legs: ['Buy 1 put at strike A (OTM below)', 'Buy 1 call at strike B (OTM above)'],
            diagram: 'strangle',
          },
        ],
      },
      {
        label: 'OTHER',
        strategies: [
          {
            name: 'Collar',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Own shares, sell an OTM call, buy an OTM put. Caps both upside and downside — a protective range.',
            legs: ['Own 100 shares', 'Buy 1 put at strike A (OTM below)', 'Sell 1 call at strike B (OTM above)'],
            diagram: 'collar',
          },
        ],
      },
    ],
  },
  {
    level: 'Advanced',
    color: 'text-orange-500',
    groups: [
      {
        label: 'NAKED',
        strategies: [
          {
            name: 'Short Put',
            bias: 'bullish', profit: 'limited', loss: 'limited',
            description: 'Sell a put naked. Collect full premium. Obligated to buy shares at the strike if assigned. High buying power required.',
            legs: ['Sell 1 put at strike A'],
            diagram: 'short-put',
          },
          {
            name: 'Short Call',
            bias: 'bearish', profit: 'limited', loss: 'unlimited',
            description: 'Sell a call naked. Collect full premium. Unlimited risk if stock rallies. Requires high margin.',
            legs: ['Sell 1 call at strike A'],
            diagram: 'short-call',
          },
        ],
      },
      {
        label: 'NEUTRAL',
        strategies: [
          {
            name: 'Short Straddle',
            bias: 'neutral', profit: 'limited', loss: 'unlimited',
            description: 'Sell an ATM call and ATM put. Maximum premium collected. Profits if price stays near the strike at expiry.',
            legs: ['Sell 1 call at strike A (ATM)', 'Sell 1 put at strike A (ATM)'],
            diagram: 'short-straddle',
          },
          {
            name: 'Short Strangle',
            bias: 'neutral', profit: 'limited', loss: 'unlimited',
            description: 'Sell an OTM call and OTM put. Wider profit zone than short straddle but collects less premium.',
            legs: ['Sell 1 put at strike A (OTM below)', 'Sell 1 call at strike B (OTM above)'],
            diagram: 'short-strangle',
          },
          {
            name: 'Long Call Condor',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Buy a call spread and sell an inner call spread. Four strikes. Max profit in a narrow range at center.',
            legs: ['Buy 1 call at strike A', 'Sell 1 call at strike B', 'Sell 1 call at strike C', 'Buy 1 call at strike D'],
            diagram: 'iron-condor',
          },
          {
            name: 'Long Put Condor',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Buy a put spread and sell an inner put spread. Four strikes. Max profit in a narrow range at center.',
            legs: ['Buy 1 put at strike D', 'Sell 1 put at strike C', 'Sell 1 put at strike B', 'Buy 1 put at strike A'],
            diagram: 'iron-condor',
          },
        ],
      },
      {
        label: 'RATIO SPREADS',
        strategies: [
          {
            name: 'Call Ratio Backspread',
            bias: 'bullish', profit: 'unlimited', loss: 'limited',
            description: 'Sell fewer calls at a lower strike, buy more calls at a higher strike. Net credit or debit. Profits from large upward moves.',
            legs: ['Sell 1 call at strike A', 'Buy 2 calls at strike B (higher, OTM)'],
            diagram: 'ratio-backspread-call',
          },
          {
            name: 'Put Broken Wing',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Modified bull put spread where the long put is moved further OTM, creating a credit without full downside protection.',
            legs: ['Sell 1 put at strike B', 'Buy 1 put at strike A (further OTM, skip a strike)'],
            diagram: 'broken-wing-put',
          },
          {
            name: 'Inverse Call Broken Wing',
            bias: 'volatile', profit: 'unlimited', loss: 'limited',
            description: 'Buy closer call, sell further OTM call at a skip strike. Creates asymmetric upside with capped downside.',
            legs: ['Sell 1 call at strike A', 'Buy 1 call at strike B (skip a strike)'],
            diagram: 'broken-wing-call',
          },
          {
            name: 'Put Ratio Backspread',
            bias: 'bearish', profit: 'limited', loss: 'limited',
            description: 'Sell fewer puts at a higher strike, buy more puts at a lower strike. Profits from large downward moves.',
            legs: ['Sell 1 put at strike B', 'Buy 2 puts at strike A (lower, OTM)'],
            diagram: 'ratio-backspread-put',
          },
          {
            name: 'Call Broken Wing',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Modified bear call spread where the long call is moved further OTM at a skip strike, creating a net credit.',
            legs: ['Sell 1 call at strike A', 'Buy 1 call at strike B (skip a strike, further OTM)'],
            diagram: 'broken-wing-call',
          },
          {
            name: 'Inverse Put Broken Wing',
            bias: 'volatile', profit: 'limited', loss: 'unlimited',
            description: 'Buy closer put, sell further OTM put at a skip strike. Creates asymmetric downside exposure.',
            legs: ['Buy 1 put at strike B', 'Sell 1 put at strike A (skip a strike, OTM)'],
            diagram: 'broken-wing-put',
          },
        ],
      },
      {
        label: 'INCOME',
        strategies: [
          {
            name: 'Covered Short Straddle',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Own shares, sell an ATM call and ATM put. Maximum premium income but stock ownership covers call risk.',
            legs: ['Own 100 shares', 'Sell 1 call at strike A (ATM)', 'Sell 1 put at strike A (ATM)'],
            diagram: 'covered-call',
          },
          {
            name: 'Covered Short Strangle',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Own shares, sell OTM call and OTM put. Wider profit zone than covered straddle with extra premium.',
            legs: ['Own 100 shares', 'Sell 1 put at strike A (OTM)', 'Sell 1 call at strike B (OTM)'],
            diagram: 'covered-call',
          },
        ],
      },
      {
        label: 'DIRECTIONAL',
        strategies: [
          {
            name: 'Short Call Condor',
            bias: 'volatile', profit: 'limited', loss: 'limited',
            description: 'Sell outer call wings, buy inner call spreads. Net credit. Profits from large moves away from the center.',
            legs: ['Sell 1 call at strike A', 'Buy 1 call at strike B', 'Buy 1 call at strike C', 'Sell 1 call at strike D'],
            diagram: 'short-butterfly-call',
          },
          {
            name: 'Short Put Condor',
            bias: 'volatile', profit: 'limited', loss: 'limited',
            description: 'Sell outer put wings, buy inner put spreads. Net credit. Profits from large moves away from the center.',
            legs: ['Sell 1 put at strike D', 'Buy 1 put at strike C', 'Buy 1 put at strike B', 'Sell 1 put at strike A'],
            diagram: 'short-butterfly-call',
          },
        ],
      },
      {
        label: 'LADDERS',
        strategies: [
          {
            name: 'Bull Call Ladder',
            bias: 'bullish', profit: 'limited', loss: 'unlimited',
            description: 'Buy a call spread and sell another OTM call. Reduces cost but adds risk above the highest strike.',
            legs: ['Buy 1 call at strike A', 'Sell 1 call at strike B', 'Sell 1 call at strike C (higher)'],
            diagram: 'long-call',
          },
          {
            name: 'Bear Call Ladder',
            bias: 'volatile', profit: 'unlimited', loss: 'limited',
            description: 'Sell a lower call, buy two higher calls. Net credit possible. Profits from large move up or if stock collapses.',
            legs: ['Sell 1 call at strike A', 'Buy 1 call at strike B', 'Buy 1 call at strike C (higher)'],
            diagram: 'ratio-backspread-call',
          },
          {
            name: 'Bull Put Ladder',
            bias: 'volatile', profit: 'unlimited', loss: 'limited',
            description: 'Sell a higher put, buy two lower puts. Profits from large downward move or if stock rallies above top strike.',
            legs: ['Sell 1 put at strike C', 'Buy 1 put at strike B', 'Buy 1 put at strike A (lower)'],
            diagram: 'ratio-backspread-put',
          },
          {
            name: 'Bear Put Ladder',
            bias: 'bearish', profit: 'limited', loss: 'unlimited',
            description: 'Buy a put spread, sell another OTM put. Reduces cost but exposes to catastrophic downside below lowest strike.',
            legs: ['Sell 1 put at strike A', 'Sell 1 put at strike B', 'Buy 1 put at strike C (higher)'],
            diagram: 'long-put',
          },
        ],
      },
      {
        label: 'OTHER',
        strategies: [
          {
            name: 'Jade Lizard',
            bias: 'bullish', profit: 'limited', loss: 'limited',
            description: 'Sell an OTM put and an OTM call spread. No upside risk. Profits as long as price stays above put strike at expiry.',
            legs: ['Sell 1 OTM put at strike A', 'Sell 1 OTM call at strike B', 'Buy 1 OTM call at strike C'],
            diagram: 'jade-lizard',
          },
          {
            name: 'Reverse Jade Lizard',
            bias: 'bearish', profit: 'limited', loss: 'limited',
            description: 'Sell an OTM call and an OTM put spread. No downside risk. Profits if price stays below call strike at expiry.',
            legs: ['Buy 1 OTM put at strike A', 'Sell 1 OTM put at strike B', 'Sell 1 OTM call at strike C'],
            diagram: 'reverse-jade-lizard',
          },
        ],
      },
    ],
  },
  {
    level: 'Expert',
    color: 'text-purple-600',
    groups: [
      {
        label: 'RATIO SPREADS',
        strategies: [
          {
            name: 'Call Ratio Spread',
            bias: 'neutral', profit: 'limited', loss: 'unlimited',
            description: 'Buy one call, sell two or more calls at a higher strike. Net credit. Profits in a range but unlimited risk above upper strikes.',
            legs: ['Buy 1 call at strike A', 'Sell 2 calls at strike B (higher)'],
            diagram: 'ratio-spread-call',
          },
          {
            name: 'Put Ratio Spread',
            bias: 'neutral', profit: 'limited', loss: 'unlimited',
            description: 'Buy one put, sell two or more puts at a lower strike. Net credit. Profits in a range but large risk below lower strikes.',
            legs: ['Buy 1 put at strike B', 'Sell 2 puts at strike A (lower)'],
            diagram: 'ratio-spread-put',
          },
        ],
      },
      {
        label: 'SYNTHETIC',
        strategies: [
          {
            name: 'Long Synthetic Future',
            bias: 'bullish', profit: 'unlimited', loss: 'unlimited',
            description: 'Buy an ATM call and sell an ATM put at the same strike and expiry. Mimics owning 100 shares at zero or low cost.',
            legs: ['Buy 1 call at strike A (ATM)', 'Sell 1 put at strike A (ATM)'],
            diagram: 'synthetic-long',
          },
          {
            name: 'Short Synthetic Future',
            bias: 'bearish', profit: 'limited', loss: 'unlimited',
            description: 'Sell an ATM call and buy an ATM put. Mimics shorting 100 shares at zero or low cost.',
            legs: ['Sell 1 call at strike A (ATM)', 'Buy 1 put at strike A (ATM)'],
            diagram: 'synthetic-short',
          },
          {
            name: 'Synthetic Put',
            bias: 'bearish', profit: 'limited', loss: 'unlimited',
            description: 'Short the stock and buy a call. Equivalent risk profile to a long put, useful when puts are expensive.',
            legs: ['Short 100 shares', 'Buy 1 call at strike A (ATM)'],
            diagram: 'synthetic-put',
          },
        ],
      },
      {
        label: 'ARBITRAGE',
        strategies: [
          {
            name: 'Long Combo',
            bias: 'bullish', profit: 'unlimited', loss: 'limited',
            description: 'Buy an OTM call and sell an OTM put. Similar to long synthetic but strikes are different — bullish directional.',
            legs: ['Sell 1 OTM put at strike A', 'Buy 1 OTM call at strike B'],
            diagram: 'synthetic-long',
          },
          {
            name: 'Short Combo',
            bias: 'bearish', profit: 'limited', loss: 'unlimited',
            description: 'Sell an OTM call and buy an OTM put. Bearish directional. Profits from strong downward move.',
            legs: ['Buy 1 OTM put at strike A', 'Sell 1 OTM call at strike B'],
            diagram: 'synthetic-short',
          },
        ],
      },
      {
        label: 'OTHER',
        strategies: [
          {
            name: 'Strip',
            bias: 'bearish', profit: 'unlimited', loss: 'limited',
            description: 'Buy one ATM call and two ATM puts. Profits from large moves but has a bearish bias (extra put).',
            legs: ['Buy 1 call at strike A (ATM)', 'Buy 2 puts at strike A (ATM)'],
            diagram: 'strip',
          },
          {
            name: 'Strap',
            bias: 'bullish', profit: 'unlimited', loss: 'limited',
            description: 'Buy two ATM calls and one ATM put. Profits from large moves but has a bullish bias (extra call).',
            legs: ['Buy 2 calls at strike A (ATM)', 'Buy 1 put at strike A (ATM)'],
            diagram: 'strap',
          },
          {
            name: 'Guts',
            bias: 'volatile', profit: 'unlimited', loss: 'limited',
            description: 'Buy an ITM call and ITM put. Expensive but profits from huge moves. Less theta decay than straddle.',
            legs: ['Buy 1 ITM call at strike B', 'Buy 1 ITM put at strike A'],
            diagram: 'strangle',
          },
          {
            name: 'Short Guts',
            bias: 'neutral', profit: 'limited', loss: 'unlimited',
            description: 'Sell an ITM call and ITM put. Collect large premium but substantial directional risk.',
            legs: ['Sell 1 ITM call at strike B', 'Sell 1 ITM put at strike A'],
            diagram: 'short-strangle',
          },
          {
            name: 'Double Diagonal',
            bias: 'neutral', profit: 'limited', loss: 'limited',
            description: 'Sell near-term OTM strangle, buy longer-dated wider strangle. Blends calendar and iron condor properties.',
            legs: ['Buy far-term put at strike A', 'Sell near-term put at strike B', 'Sell near-term call at strike C', 'Buy far-term call at strike D'],
            diagram: 'double-diagonal',
          },
        ],
      },
    ],
  },
];

/* ─────────────────────────────────────────────
   Payoff diagram SVGs
───────────────────────────────────────────── */
function PayoffDiagram({ type }: { type: DiagramT }) {
  const W = 220, H = 100, mid = H / 2;
  const green = '#22c55e', red = '#ef4444', gray = '#d1d5db';

  const paths: Record<DiagramT, React.ReactNode> = {
    'long-call': (
      <>
        <line x1="0" y1={mid} x2={W * 0.5} y2={mid} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={mid} x2={W} y2={20} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'long-put': (
      <>
        <line x1="0" y1={20} x2={W * 0.5} y2={mid} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={mid} x2={W} y2={mid} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'short-call': (
      <>
        <line x1="0" y1={mid} x2={W * 0.5} y2={mid} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={mid} x2={W} y2={H - 15} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'short-put': (
      <>
        <line x1="0" y1={H - 15} x2={W * 0.5} y2={mid} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={mid} x2={W} y2={mid} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'bull-call': (
      <>
        <line x1="0" y1={mid + 12} x2={W * 0.35} y2={mid + 12} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.35} y1={mid + 12} x2={W * 0.65} y2={mid - 18} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.65} y1={mid - 18} x2={W} y2={mid - 18} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'bull-put': (
      <>
        <line x1="0" y1={H - 20} x2={W * 0.3} y2={H - 20} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.3} y1={H - 20} x2={W * 0.6} y2={mid - 15} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.6} y1={mid - 15} x2={W} y2={mid - 15} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'bear-call': (
      <>
        <line x1="0" y1={mid - 15} x2={W * 0.4} y2={mid - 15} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.4} y1={mid - 15} x2={W * 0.7} y2={H - 20} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.7} y1={H - 20} x2={W} y2={H - 20} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'bear-put': (
      <>
        <line x1="0" y1={mid - 18} x2={W * 0.35} y2={mid - 18} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.35} y1={mid - 18} x2={W * 0.65} y2={mid + 12} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.65} y1={mid + 12} x2={W} y2={mid + 12} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'iron-condor': (
      <>
        <line x1="0" y1={H - 18} x2={W * 0.2} y2={H - 18} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.2} y1={H - 18} x2={W * 0.35} y2={mid - 18} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.35} y1={mid - 18} x2={W * 0.65} y2={mid - 18} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.65} y1={mid - 18} x2={W * 0.8} y2={H - 18} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.8} y1={H - 18} x2={W} y2={H - 18} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'iron-butterfly': (
      <>
        <line x1="0" y1={H - 18} x2={W * 0.35} y2={H - 18} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.35} y1={H - 18} x2={W * 0.5} y2={20} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={20} x2={W * 0.65} y2={H - 18} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.65} y1={H - 18} x2={W} y2={H - 18} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'straddle': (
      <>
        <line x1="0" y1={20} x2={W * 0.5} y2={H - 20} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={H - 20} x2={W} y2={20} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'strangle': (
      <>
        <line x1="0" y1={25} x2={W * 0.3} y2={H - 20} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.3} y1={H - 20} x2={W * 0.7} y2={H - 20} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.7} y1={H - 20} x2={W} y2={25} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'short-straddle': (
      <>
        <line x1="0" y1={H - 20} x2={W * 0.5} y2={20} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={20} x2={W} y2={H - 20} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'short-strangle': (
      <>
        <line x1="0" y1={H - 25} x2={W * 0.3} y2={20} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.3} y1={20} x2={W * 0.7} y2={20} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.7} y1={20} x2={W} y2={H - 25} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'covered-call': (
      <>
        <line x1="0" y1={mid + 15} x2={W * 0.45} y2={mid - 15} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.45} y1={mid - 15} x2={W} y2={mid - 15} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'protective-put': (
      <>
        <line x1="0" y1={H - 15} x2={W * 0.4} y2={H - 15} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.4} y1={H - 15} x2={W} y2={25} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'cash-secured-put': (
      <>
        <line x1="0" y1={H - 15} x2={W * 0.5} y2={mid} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={mid} x2={W} y2={mid} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'collar': (
      <>
        <line x1="0" y1={H - 20} x2={W * 0.3} y2={H - 20} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.3} y1={H - 20} x2={W * 0.7} y2={mid - 10} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.7} y1={mid - 10} x2={W} y2={mid - 10} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'calendar': (
      <>
        <line x1="0" y1={H - 15} x2={W * 0.35} y2={H - 15} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.35} y1={H - 15} x2={W * 0.5} y2={20} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={20} x2={W * 0.65} y2={H - 15} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.65} y1={H - 15} x2={W} y2={H - 15} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'ratio-backspread-call': (
      <>
        <line x1="0" y1={mid - 5} x2={W * 0.45} y2={H - 20} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.45} y1={H - 20} x2={W * 0.65} y2={mid} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.65} y1={mid} x2={W} y2={20} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'ratio-backspread-put': (
      <>
        <line x1="0" y1={20} x2={W * 0.35} y2={mid} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.35} y1={mid} x2={W * 0.55} y2={H - 20} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.55} y1={H - 20} x2={W} y2={mid - 5} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'long-butterfly-call': (
      <>
        <line x1="0" y1={H - 15} x2={W * 0.3} y2={H - 15} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.3} y1={H - 15} x2={W * 0.5} y2={22} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={22} x2={W * 0.7} y2={H - 15} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.7} y1={H - 15} x2={W} y2={H - 15} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'short-butterfly-call': (
      <>
        <line x1="0" y1={22} x2={W * 0.3} y2={22} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.3} y1={22} x2={W * 0.5} y2={H - 15} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={H - 15} x2={W * 0.7} y2={22} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.7} y1={22} x2={W} y2={22} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'broken-wing-put': (
      <>
        <line x1="0" y1={H - 15} x2={W * 0.2} y2={H - 15} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.2} y1={H - 15} x2={W * 0.55} y2={mid - 10} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.55} y1={mid - 10} x2={W} y2={mid - 10} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'broken-wing-call': (
      <>
        <line x1="0" y1={mid - 10} x2={W * 0.45} y2={mid - 10} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.45} y1={mid - 10} x2={W * 0.8} y2={H - 15} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.8} y1={H - 15} x2={W} y2={H - 15} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'jade-lizard': (
      <>
        <line x1="0" y1={H - 15} x2={W * 0.3} y2={H - 15} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.3} y1={H - 15} x2={W * 0.55} y2={mid - 12} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.55} y1={mid - 12} x2={W * 0.75} y2={mid - 12} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.75} y1={mid - 12} x2={W} y2={H - 20} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'reverse-jade-lizard': (
      <>
        <line x1="0" y1={H - 20} x2={W * 0.25} y2={mid - 12} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.25} y1={mid - 12} x2={W * 0.45} y2={mid - 12} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.45} y1={mid - 12} x2={W * 0.7} y2={H - 15} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.7} y1={H - 15} x2={W} y2={H - 15} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'synthetic-long': (
      <>
        <line x1="0" y1={H - 15} x2={W} y2={15} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'synthetic-short': (
      <>
        <line x1="0" y1={15} x2={W} y2={H - 15} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'synthetic-put': (
      <>
        <line x1="0" y1={20} x2={W * 0.5} y2={mid} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={mid} x2={W} y2={mid} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'strip': (
      <>
        <line x1="0" y1={20} x2={W * 0.5} y2={H - 20} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={H - 20} x2={W} y2={mid} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'strap': (
      <>
        <line x1="0" y1={mid} x2={W * 0.5} y2={H - 20} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.5} y1={H - 20} x2={W} y2={20} stroke={green} strokeWidth="2.5" />
      </>
    ),
    'ratio-spread-call': (
      <>
        <line x1="0" y1={mid + 5} x2={W * 0.35} y2={mid + 5} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.35} y1={mid + 5} x2={W * 0.6} y2={mid - 20} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.6} y1={mid - 20} x2={W} y2={H - 15} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'ratio-spread-put': (
      <>
        <line x1="0" y1={H - 15} x2={W * 0.4} y2={mid - 20} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.4} y1={mid - 20} x2={W * 0.65} y2={mid + 5} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.65} y1={mid + 5} x2={W} y2={mid + 5} stroke={red} strokeWidth="2.5" />
      </>
    ),
    'double-diagonal': (
      <>
        <line x1="0" y1={H - 18} x2={W * 0.22} y2={H - 18} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.22} y1={H - 18} x2={W * 0.4} y2={mid - 15} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.4} y1={mid - 15} x2={W * 0.6} y2={mid - 15} stroke={green} strokeWidth="2.5" />
        <line x1={W * 0.6} y1={mid - 15} x2={W * 0.78} y2={H - 18} stroke={red} strokeWidth="2.5" />
        <line x1={W * 0.78} y1={H - 18} x2={W} y2={H - 18} stroke={red} strokeWidth="2.5" />
      </>
    ),
  };

  return (
    <svg width={W} height={H} className="block">
      {/* Axes */}
      <line x1="0" y1={mid} x2={W} y2={mid} stroke={gray} strokeWidth="1" strokeDasharray="4 3" />
      <text x={W - 2} y={mid - 4} fontSize="9" fill={gray} textAnchor="end">Profit</text>
      <text x={W - 2} y={mid + 11} fontSize="9" fill={gray} textAnchor="end">Loss</text>
      <text x={W / 2} y={H - 2} fontSize="9" fill={gray} textAnchor="middle">Stock Price</text>
      {paths[type]}
    </svg>
  );
}

/* ─────────────────────────────────────────────
   Badges
───────────────────────────────────────────── */
const BIAS_BADGE: Record<Bias, { label: string; cls: string }> = {
  bullish:  { label: '▲ Bullish',  cls: 'bg-green-600 text-white' },
  bearish:  { label: '▼ Bearish',  cls: 'bg-red-600 text-white' },
  neutral:  { label: '→ Neutral',  cls: 'bg-gray-500 text-white' },
  volatile: { label: '↕ Volatile', cls: 'bg-purple-600 text-white' },
};

const PROFIT_BADGE: Record<ProfitT, { label: string; cls: string }> = {
  limited:   { label: '◎ Limited Profit',   cls: 'bg-amber-100 text-amber-700 border border-amber-300' },
  unlimited: { label: '◎ Unlimited Profit',  cls: 'bg-green-100 text-green-700 border border-green-300' },
};

const LOSS_BADGE: Record<LossT, { label: string; cls: string }> = {
  limited:   { label: '◎ Limited Loss',   cls: 'bg-blue-100 text-blue-700 border border-blue-300' },
  unlimited: { label: '◎ Unlimited Loss', cls: 'bg-red-100 text-red-700 border border-red-300' },
};

/* ─────────────────────────────────────────────
   Tooltip popup
───────────────────────────────────────────── */
interface TooltipState {
  strategy: Strategy;
  x: number;
  y: number;
}

function StrategyTooltip({ tip }: { tip: TooltipState }) {
  const { strategy: s, x, y } = tip;
  const biasBadge   = BIAS_BADGE[s.bias];
  const profitBadge = PROFIT_BADGE[s.profit];
  const lossBadge   = LOSS_BADGE[s.loss];

  // Keep popup inside viewport
  const left = Math.min(x + 14, typeof window !== 'undefined' ? window.innerWidth - 340 : x + 14);
  const top  = Math.min(y - 8,  typeof window !== 'undefined' ? window.innerHeight - 320 : y - 8);

  return (
    <div
      className="fixed z-[9999] w-80 bg-gray-900 text-white rounded-xl shadow-2xl p-4 pointer-events-none"
      style={{ left, top }}
    >
      {/* Strategy name */}
      <p className="text-sm font-bold text-white mb-2">{s.name}</p>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${biasBadge.cls}`}>{biasBadge.label}</span>
        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${profitBadge.cls}`}>{profitBadge.label}</span>
        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${lossBadge.cls}`}>{lossBadge.label}</span>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-300 leading-relaxed mb-3">{s.description}</p>

      {/* Payoff diagram */}
      <div className="bg-gray-800 rounded-lg p-2 mb-3 flex justify-center">
        <PayoffDiagram type={s.diagram} />
      </div>

      {/* Legs */}
      <ul className="space-y-1">
        {s.legs.map((leg) => (
          <li key={leg} className="text-[11px] text-gray-300 flex gap-1.5">
            <span className="text-indigo-400 shrink-0">•</span>
            <span>{leg}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Strategy pill
───────────────────────────────────────────── */
function StrategyPill({
  strategy,
  onEnter,
  onMove,
  onLeave,
}: {
  strategy: Strategy;
  onEnter: (s: Strategy, e: React.MouseEvent) => void;
  onMove: (e: React.MouseEvent) => void;
  onLeave: () => void;
}) {
  const biasColor: Record<Bias, string> = {
    bullish: 'text-green-400',
    bearish: 'text-red-400',
    neutral: 'text-gray-300',
    volatile: 'text-purple-400',
  };

  return (
    <span
      className={`cursor-pointer text-sm font-medium hover:underline underline-offset-2 transition-colors ${biasColor[strategy.bias]}`}
      onMouseEnter={(e) => onEnter(strategy, e)}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {strategy.name}
    </span>
  );
}

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */
export default function StrategiesPage() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const handleEnter = (strategy: Strategy, e: React.MouseEvent) => {
    setTooltip({ strategy, x: e.clientX, y: e.clientY });
  };
  const handleMove = (e: React.MouseEvent) => {
    if (tooltip) setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
  };
  const handleLeave = () => setTooltip(null);

  const levelBadge: Record<string, string> = {
    Novice:       'bg-green-100 text-green-700',
    Intermediate: 'bg-blue-100 text-blue-700',
    Advanced:     'bg-orange-100 text-orange-700',
    Expert:       'bg-purple-100 text-purple-700',
  };

  const totalStrategies = CATEGORIES.reduce(
    (sum, cat) => sum + cat.groups.reduce((s2, g) => s2 + g.strategies.length, 0),
    0,
  );

  return (
    <Layout title="Options Strategies">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-700 shadow-sm px-6 py-5">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Options Strategies</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {totalStrategies} strategies across 4 skill levels — hover any strategy name to see its payoff diagram, bias, and legs.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs">
          {Object.entries(BIAS_BADGE).map(([, v]) => (
            <span key={v.label} className={`px-2.5 py-1 rounded-full font-semibold ${v.cls}`}>{v.label}</span>
          ))}
          <span className="text-gray-400 self-center">← hover strategy names for full details</span>
        </div>

        {/* Categories */}
        {CATEGORIES.map((cat) => (
          <div key={cat.level} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
            {/* Level header */}
            <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${levelBadge[cat.level]}`}>
                {cat.level}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {cat.groups.reduce((s, g) => s + g.strategies.length, 0)} strategies
              </span>
            </div>

            {/* Groups grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-0 divide-y divide-gray-50 dark:divide-gray-800 sm:divide-y-0">
              {cat.groups.map((group) => (
                <div key={group.label} className="p-5 border-b sm:border-b-0 sm:border-r border-gray-100 dark:border-gray-800 last:border-0">
                  <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {group.strategies.map((s) => (
                      <StrategyPill
                        key={s.name}
                        strategy={s}
                        onEnter={handleEnter}
                        onMove={handleMove}
                        onLeave={handleLeave}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="text-center text-xs text-gray-400 pb-4">
          For educational purposes only. Always verify strategy mechanics with your broker before trading.
        </p>
      </div>

      {/* Tooltip portal */}
      {tooltip && <StrategyTooltip tip={tooltip} />}
    </Layout>
  );
}
