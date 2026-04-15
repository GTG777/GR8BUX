import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Layout } from '@/components/Layout';
import { calculateCallGreeks, calculatePutGreeks } from '@/lib/greeks';
import type { LeapsContract, LeapsChainResponse } from '@/pages/api/options/leaps-chain';
import { AIAdvisorPanel } from '@/components';
import { useAIAnalysis } from '@/hooks/useAIAnalysis';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';

/* ─────────────────────────────────────────────────────────────────
   Constants & helpers
───────────────────────────────────────────────────────────────── */
const TODAY = new Date();
const fmt$ = (v: number) => v >= 0 ? `+$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`;
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

// Screener watchlist — popular LEAPS candidates
const LEAPS_UNIVERSE = [
  { symbol: 'SPY',  name: 'S&P 500 ETF',     sector: 'Index' },
  { symbol: 'QQQ',  name: 'Nasdaq 100 ETF',   sector: 'Index' },
  { symbol: 'AAPL', name: 'Apple',            sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft',        sector: 'Technology' },
  { symbol: 'NVDA', name: 'Nvidia',           sector: 'Technology' },
  { symbol: 'META', name: 'Meta Platforms',   sector: 'Technology' },
  { symbol: 'AMZN', name: 'Amazon',           sector: 'Consumer' },
  { symbol: 'GOOGL',name: 'Alphabet',         sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla',            sector: 'Consumer' },
  { symbol: 'JPM',  name: 'JPMorgan',         sector: 'Financials' },
  { symbol: 'GS',   name: 'Goldman Sachs',    sector: 'Financials' },
  { symbol: 'BRK-B',name: 'Berkshire Hathaway',sector: 'Financials' },
  { symbol: 'XOM',  name: 'ExxonMobil',       sector: 'Energy' },
  { symbol: 'UNH',  name: 'UnitedHealth',     sector: 'Healthcare' },
  { symbol: 'LLY',  name: 'Eli Lilly',        sector: 'Healthcare' },
  { symbol: 'V',    name: 'Visa',             sector: 'Financials' },
  { symbol: 'AMD',  name: 'AMD',              sector: 'Technology' },
  { symbol: 'PLTR', name: 'Palantir',         sector: 'Technology' },
];

const SECTORS = ['All', ...Array.from(new Set(LEAPS_UNIVERSE.map((s) => s.sector)))];

// Delta-based categorisation for the chain viewer
function deltaLabel(d: number, type: 'call' | 'put'): { label: string; cls: string } {
  const abs = Math.abs(d);
  if (abs >= 0.75) return { label: 'Deep ITM', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (abs >= 0.55) return { label: 'ITM',      cls: 'text-green-700 bg-green-50 border-green-200' };
  if (abs >= 0.45) return { label: 'ATM',      cls: 'text-indigo-700 bg-indigo-50 border-indigo-200' };
  if (abs >= 0.30) return { label: 'OTM',      cls: 'text-amber-700 bg-amber-50 border-amber-200' };
  return               { label: 'Far OTM',  cls: 'text-red-600 bg-red-50 border-red-200' };
}

// PMCC income projection: assume rolling short calls every ~45 days
function pmccProjection(leapsMid: number, spot: number, ivPct: number, dteLeaps: number) {
  const cycles = Math.floor(dteLeaps / 45);
  const weeklyYield = (ivPct / 100) * spot * Math.sqrt(45 / 365) * 0.30; // rough 30Δ call premium
  const totalIncome = cycles * weeklyYield;
  const netCost = Math.max(0, leapsMid * 100 - totalIncome);
  return { cycles, weeklyYield, totalIncome, netCost };
}

// Build simple P&L curve for the builder
function buildLeapsPnL(
  type: 'call' | 'put',
  strike: number,
  premium: number,
  spot: number,
  daysHeld: number,
  daysTotal: number,
  ivFrac: number,
  qty: number,
): { price: number; expiry: number; theta: number }[] {
  const lo = spot * 0.60;
  const hi = spot * 1.50;
  const steps = 100;
  const rate = 0.045;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const s = lo + (hi - lo) * (i / steps);
    const intrinsic = type === 'call' ? Math.max(0, s - strike) : Math.max(0, strike - s);
    const expiry = (intrinsic - premium) * qty * 100;
    // Current value (time remaining = daysTotal - daysHeld)
    const T = Math.max((daysTotal - daysHeld), 1) / 365;
    const g = type === 'call'
      ? calculateCallGreeks({ spotPrice: s, strikePrice: strike, timeToExpiration: T, volatility: ivFrac, riskFreeRate: rate })
      : calculatePutGreeks({ spotPrice: s, strikePrice: strike, timeToExpiration: T, volatility: ivFrac, riskFreeRate: rate });
    const currentVal = (g.premium ?? 0) * qty * 100;
    const thetaPnL = (currentVal - premium * qty * 100);
    out.push({
      price: parseFloat(s.toFixed(2)),
      expiry: parseFloat(expiry.toFixed(2)),
      theta: parseFloat(thetaPnL.toFixed(2)),
    });
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────────────── */

// Small badge
function Badge({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${cls}`}>{children}</span>;
}

// Loading spinner
function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <svg className="animate-spin h-6 w-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    </div>
  );
}

// Screener row
interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string;
  price: number | null;
  hv20: number | null;
  ivr: number | null;
  bestDelta: number | null;
  bestExpiry: string | null;
  bestPremium: number | null;
  loading: boolean;
  error: boolean;
}

type ScreenerSortKey = 'symbol' | 'sector' | 'price' | 'hv20' | 'ivr' | 'bestExpiry' | 'bestDelta' | 'bestPremium';

function ScreenerTable({
  rows,
  onPick,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: ScreenerRow[];
  onPick: (sym: string) => void;
  sortKey: ScreenerSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: ScreenerSortKey) => void;
}) {
  const ivrColor = (ivr: number | null) => {
    if (ivr === null) return 'text-gray-400';
    if (ivr <= 30) return 'text-green-600 font-bold';
    if (ivr <= 60) return 'text-amber-600';
    return 'text-red-600';
  };
  const arrow = (key: ScreenerSortKey) => sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[720px]">
        <thead>
          <tr className="text-gray-400 border-b border-gray-100">
            <th
              className="text-left py-2.5 px-3 cursor-pointer hover:text-gray-600"
              onClick={() => onSort('symbol')}
            >
              Symbol {arrow('symbol')}
            </th>
            <th
              className="text-left py-2.5 px-3 cursor-pointer hover:text-gray-600"
              onClick={() => onSort('sector')}
            >
              Sector {arrow('sector')}
            </th>
            <th
              className="text-right py-2.5 px-3 cursor-pointer hover:text-gray-600"
              onClick={() => onSort('price')}
            >
              Price {arrow('price')}
            </th>
            <th
              className="text-right py-2.5 px-3 cursor-pointer hover:text-gray-600"
              onClick={() => onSort('hv20')}
            >
              HV20 {arrow('hv20')}
            </th>
            <th
              className="text-right py-2.5 px-3 cursor-pointer hover:text-gray-600"
              onClick={() => onSort('ivr')}
            >
              IV Rank {arrow('ivr')}
            </th>
            <th
              className="text-right py-2.5 px-3 cursor-pointer hover:text-gray-600"
              onClick={() => onSort('bestExpiry')}
            >
              Best LEAPS {arrow('bestExpiry')}
            </th>
            <th
              className="text-right py-2.5 px-3 cursor-pointer hover:text-gray-600"
              onClick={() => onSort('bestDelta')}
            >
              Delta {arrow('bestDelta')}
            </th>
            <th
              className="text-right py-2.5 px-3 cursor-pointer hover:text-gray-600"
              onClick={() => onSort('bestPremium')}
            >
              Premium {arrow('bestPremium')}
            </th>
            <th className="text-center py-2.5 px-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.symbol} className="border-b border-gray-50 hover:bg-indigo-50/30 transition-colors">
              <td className="py-2 px-3 font-bold text-gray-800">
                {row.symbol}
                <span className="block text-[10px] font-normal text-gray-400">{row.name}</span>
              </td>
              <td className="py-2 px-3 text-gray-500">{row.sector}</td>
              <td className="py-2 px-3 text-right font-semibold text-gray-800">
                {row.loading ? '…' : row.price ? `$${row.price.toFixed(2)}` : '—'}
              </td>
              <td className="py-2 px-3 text-right text-gray-600">
                {row.loading ? '…' : row.hv20 !== null ? `${row.hv20}%` : '—'}
              </td>
              <td className={`py-2 px-3 text-right ${ivrColor(row.ivr)}`}>
                {row.loading ? '…' : row.ivr !== null ? `${row.ivr.toFixed(0)}` : '—'}
              </td>
              <td className="py-2 px-3 text-right text-indigo-600 text-[10px]">{row.bestExpiry ?? '—'}</td>
              <td className="py-2 px-3 text-right">
                {row.bestDelta !== null
                  ? <Badge cls={deltaLabel(row.bestDelta, 'call').cls}>{row.bestDelta.toFixed(2)}</Badge>
                  : '—'}
              </td>
              <td className="py-2 px-3 text-right font-semibold text-gray-700">
                {row.bestPremium !== null ? `$${(row.bestPremium * 100).toFixed(0)}` : '—'}
              </td>
              <td className="py-2 px-3 text-center">
                <button
                  onClick={() => onPick(row.symbol)}
                  className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700"
                >
                  Analyze →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Tab Guide banner
───────────────────────────────────────────────────────────────── */
interface GuideData {
  headline: string;
  bg: string; border: string; accent: string; badge: string;
  steps: string[];
  tip: string;
}

function GuideBox({ data, onClose }: { data: GuideData; onClose: () => void }) {
  return (
    <div className={`rounded-xl border ${data.border} ${data.bg} p-4 relative`}>
      <button
        onClick={onClose}
        aria-label="Dismiss guide"
        className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-white/70 text-lg leading-none shrink-0"
      >
        ×
      </button>
      <p className={`text-xs font-bold ${data.accent} mb-3 flex items-center gap-1.5 pr-8`}>
        <span className="text-base">ⓘ</span> {data.headline}
      </p>
      <div className="space-y-2 mb-3">
        {data.steps.map((s, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shrink-0 ${data.badge}`}>{i + 1}</span>
            <p className="text-xs text-gray-600 leading-relaxed">{s}</p>
          </div>
        ))}
      </div>
      <p className={`text-xs ${data.accent} font-semibold border-t ${data.border} pt-2.5`}>
        💡 {data.tip}
      </p>
    </div>
  );
}

const GUIDES: Record<string, GuideData> = {
  screener: {
    headline: 'How to use the Screener — find the right LEAPS candidate in 4 steps',
    bg: 'bg-indigo-50', border: 'border-indigo-200', accent: 'text-indigo-700', badge: 'bg-indigo-600 text-white',
    steps: [
      'Set the Sector filter and drag Max IV Rank ≤ 30. IV Rank < 30 means options are historically cheap — the best time to buy LEAPS.',
      'Wait a few seconds for rows to auto-load live price, HV20, and the best available LEAPS contract. Data loads staggered to avoid rate-limiting.',
      'Scan for a green IV Rank number and a best delta near 0.70. Green = you are buying cheap time value. High IV Rank = you are overpaying.',
      'Click Analyze → on any row to jump to the Chain Viewer with that symbol pre-loaded and ready to filter.',
    ],
    tip: 'Start with SPY or QQQ to learn the workflow — index LEAPS are the most liquid and easiest to enter and exit.',
  },
  chain: {
    headline: 'How to use the Chain Viewer — read the LEAPS chain and pick the right contract',
    bg: 'bg-teal-50', border: 'border-teal-200', accent: 'text-teal-700', badge: 'bg-teal-600 text-white',
    steps: [
      'Type a ticker and click Load. Only expirations ≥ 12 months appear. Toggle Calls or Puts based on your directional view (bullish → calls).',
      'Use the Expiry dropdown — 12–18 months is the sweet spot. 18–24 months is ideal for a PMCC base leg or stock replacement.',
      'Drag the Min Delta slider: 0.70+ for deep ITM (moves like stock), 0.50 for balanced cost/leverage, 0.30 for speculative plays.',
      'Before trading, confirm OI > 500 and bid/ask spread < $0.50 — a wide spread destroys edge on both entry and exit.',
      'Click Build → on any row to send that contract to the Builder tab with all fields pre-filled automatically.',
    ],
    tip: 'The “vs. Shares %” column shows your committed capital vs. buying 100 shares outright. 10–20% is the typical LEAPS leverage sweet spot.',
  },
  builder: {
    headline: 'How to use the Builder — model P&L before risking real money',
    bg: 'bg-violet-50', border: 'border-violet-200', accent: 'text-violet-700', badge: 'bg-violet-600 text-white',
    steps: [
      'Choose a strategy: Pure LEAPS (directional hold), PMCC / Poor Man\'s Covered Call (sell monthly calls for income), or Bull Call Spread (capped profit, lower cost).',
      'If you came from the Chain Viewer, all fields pre-fill automatically. Otherwise enter: Symbol, Spot, Strike, Expiry, IV %, premium paid per share, and contracts.',
      'Click Analyze LEAPS to generate the P&L chart. The solid indigo line = profit at expiration. The dashed amber line = current estimated value with time remaining.',
      'Drag the Days Held slider to simulate time decay — watch how the dashed amber line shifts downward as theta erodes your premium gradually.',
      'For PMCC: check the Income Projection card below the chart to see how many 45-day short call cycles reduce your net cost basis toward zero.',
    ],
    tip: 'If the dashed amber line stays close to the solid line even at 180 days held, your LEAPS has excellent time-decay resistance — a good entry.',
  },
  portfolio: {
    headline: 'How to use the Portfolio — track positions and never miss a roll',
    bg: 'bg-emerald-50', border: 'border-emerald-200', accent: 'text-emerald-700', badge: 'bg-emerald-600 text-white',
    steps: [
      'Click Add Position and fill in symbol, option type, strike, expiry date, premium paid per share (e.g. $12.50), and number of contracts.',
      'Each row automatically calculates DTE. Roll Status updates on every visit: ✅ > 270d (holding fine), ⚠️ ≤ 270d (plan your roll), 🚨 ≤ 180d (act now).',
      'At the red alert: go to Chain Viewer, find the same strike at a +12 month expiry, and execute a roll — sell current + buy new in one order.',
      'When you close a trade (profit target, stop-loss, or roll completed), click Remove to clear it from the tracker.',
    ],
    tip: 'Positions are saved in your browser (localStorage) and persist between visits on this device. They do not sync across browsers or devices.',
  },
  rules: {
    headline: 'How to use Rules & Tips — your LEAPS reference guide before every trade',
    bg: 'bg-amber-50', border: 'border-amber-200', accent: 'text-amber-700', badge: 'bg-amber-500 text-white',
    steps: [
      'Before entering any LEAPS: run through the Entry Checklist in Section 2. All 8 items should pass. If 2+ are red flags, skip the trade.',
      'Use the Strike & Expiry Selection table (Section 4) to match your goal to the right delta and expiry for your risk tolerance.',
      'After any losing position: re-read Common Mistakes (Section 5). Understanding why a trade failed is more valuable than the next entry.',
      'Memorize the 8 numbers in the Quick-Reference Card at the bottom — these cover every key decision in the LEAPS lifecycle.',
    ],
    tip: 'Screenshot or print the Quick-Reference Card. The most common LEAPS mistake is holding past 90 DTE without rolling forward.',
  },
};

/* ─────────────────────────────────────────────────────────────────
   Main Page
───────────────────────────────────────────────────────────────── */
type Tab = 'screener' | 'chain' | 'builder' | 'portfolio' | 'rules';
type SortKey = 'expiry' | 'strike' | 'delta' | 'premium' | 'theta' | 'oi' | 'be';

// Portfolio position (persisted to localStorage)
interface PortfolioPosition {
  id: string;
  symbol: string;
  type: 'call' | 'put';
  strike: number;
  expiryStr: string;
  entryPremium: number;  // price per share (e.g. 12.50)
  qty: number;
  entryDate: string;     // YYYY-MM-DD
  notes: string;
}

const STORAGE_KEY = 'gr8bux_leaps_portfolio';

function loadPortfolio(): PortfolioPosition[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function savePortfolio(positions: PortfolioPosition[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

export default function LeapsPage() {
  const [tab, setTab] = useState<Tab>('screener');

  // ── AI Analysis state ───────────────────────────────────────
  const { analysis: aiAnalysis, isLoading: aiLoading, error: aiError, analyzeSetup: runAnalysis } = useAIAnalysis();
  const [selectedScreenerRow, setSelectedScreenerRow] = useState<ScreenerRow | null>(null);

  // ── Screener state ──────────────────────────────────────────────
  const [sectorFilter, setSectorFilter] = useState('All');
  const [maxIvr, setMaxIvr] = useState(50);
  const [screenerData, setScreenerData] = useState<ScreenerRow[]>(
    LEAPS_UNIVERSE.map((u) => ({ ...u, price: null, hv20: null, ivr: null, bestDelta: null, bestExpiry: null, bestPremium: null, loading: false, error: false }))
  );
  const [screenerSortKey, setScreenerSortKey] = useState<ScreenerSortKey>('ivr');
  const [screenerSortDir, setScreenerSortDir] = useState<'asc' | 'desc'>('asc');
  const screenerLoaded = useRef(false);

  const loadScreenerRow = useCallback(async (symbol: string) => {
    setScreenerData((prev) =>
      prev.map((r) => r.symbol === symbol ? { ...r, loading: true, error: false } : r)
    );
    try {
      const res = await fetch(`/api/options/leaps-chain?symbol=${encodeURIComponent(symbol)}`);
      if (!res.ok) throw new Error('fetch failed');
      const data: LeapsChainResponse = await res.json();

      // Find the best ATM call (delta closest to 0.70, expiry 12–18mo)
      const targetMs = Date.now() + 18 * 30 * 24 * 60 * 60 * 1000;
      const best = data.contracts
        .filter((c) => c.type === 'call' && c.delta > 0 && c.openInterest >= 10)
        .sort((a, b) => {
          const aDeltaDiff = Math.abs(Math.abs(a.delta) - 0.70);
          const bDeltaDiff = Math.abs(Math.abs(b.delta) - 0.70);
          return aDeltaDiff - bDeltaDiff;
        })[0] ?? null;

      // Compute IVR from all contracts
      const ivs = data.contracts.map((c) => c.impliedVolatility).filter((v) => v > 0);
      let ivr: number | null = null;
      if (ivs.length >= 4) {
        ivs.sort((a, b) => a - b);
        const mid = ivs.slice(Math.floor(ivs.length * 0.3), Math.ceil(ivs.length * 0.7));
        const current = mid.reduce((s, v) => s + v, 0) / mid.length;
        const mn = Math.min(...ivs), mx = Math.max(...ivs);
        if (mx !== mn) ivr = parseFloat(((current - mn) / (mx - mn) * 100).toFixed(1));
      }

      setScreenerData((prev) =>
        prev.map((r) => r.symbol === symbol ? {
          ...r,
          loading: false,
          price: data.underlyingPrice,
          hv20: data.hv20,
          ivr,
          bestDelta: best?.delta ?? null,
          bestExpiry: best?.expirationStr ?? null,
          bestPremium: best?.mid ?? null,
        } : r)
      );
    } catch {
      setScreenerData((prev) =>
        prev.map((r) => r.symbol === symbol ? { ...r, loading: false, error: true } : r)
      );
    }
  }, []);

  // Load screener when that tab is first visited
  useEffect(() => {
    if (tab !== 'screener' || screenerLoaded.current) return;
    screenerLoaded.current = true;
    // Stagger loads to avoid hammering the API
    LEAPS_UNIVERSE.forEach((u, i) => {
      setTimeout(() => loadScreenerRow(u.symbol), i * 400);
    });
  }, [tab, loadScreenerRow]);

  // ── Chain state ─────────────────────────────────────────────────
  const [chainSymbol, setChainSymbol] = useState('AAPL');
  const [chainInput, setChainInput] = useState('AAPL');
  const [chainData, setChainData] = useState<LeapsChainResponse | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState('');
  const [typeFilter, setTypeFilter] = useState<'call' | 'put' | 'both'>('call');
  const [expiryFilter, setExpiryFilter] = useState<string>('');
  const [deltaFilter, setDeltaFilter] = useState<[number, number]>([0.20, 1.0]);
  const [sortKey, setSortKey] = useState<SortKey>('delta');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchChain = useCallback(async (sym: string) => {
    setChainLoading(true);
    setChainError('');
    setChainData(null);
    try {
      const res = await fetch(`/api/options/leaps-chain?symbol=${encodeURIComponent(sym)}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: LeapsChainResponse = await res.json();
      setChainData(data);
      if (data.leapsExpirations.length) setExpiryFilter(data.leapsExpirations[0]);
    } catch (e: unknown) {
      setChainError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setChainLoading(false);
    }
  }, []);

  // When user switches to chain tab from screener via "Analyze →"
  const handlePickFromScreener = (sym: string) => {
    const row = screenerData.find((r) => r.symbol === sym);
    if (!row) return;

    // Set selected row and trigger AI analysis
    setSelectedScreenerRow(row);
    if (row.price && row.hv20 !== null && row.ivr !== null) {
      runAnalysis({
        symbol: row.symbol,
        setupType: 'leaps_opportunity',
        currentPrice: row.price,
        support: row.price * 0.95,
        resistance: row.price * 1.05,
        ivRank: row.ivr,
        hv20: row.hv20,
        delta: row.bestDelta ?? 0.65,
        premium: row.bestPremium ?? 0,
        detectedAt: new Date().toISOString(),
      });
    }

    // Also switch to chain tab for detailed analysis
    setChainSymbol(sym);
    setChainInput(sym);
    setTab('chain');
    fetchChain(sym);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'delta' ? 'desc' : 'asc'); }
  };

  const handleScreenerSort = (key: ScreenerSortKey) => {
    if (screenerSortKey === key) setScreenerSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else {
      setScreenerSortKey(key);
      setScreenerSortDir(key === 'symbol' || key === 'sector' || key === 'bestExpiry' ? 'asc' : 'desc');
    }
  };

  const sortScreenerRows = (rows: ScreenerRow[], key: ScreenerSortKey, dir: 'asc' | 'desc') => {
    const direction = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const getValue = (row: ScreenerRow) => {
        switch (key) {
          case 'symbol': return row.symbol;
          case 'sector': return row.sector;
          case 'price': return row.price;
          case 'hv20': return row.hv20;
          case 'ivr': return row.ivr;
          case 'bestExpiry': return row.bestExpiry;
          case 'bestDelta': return row.bestDelta;
          case 'bestPremium': return row.bestPremium;
        }
      };
      const aVal = getValue(a);
      const bVal = getValue(b);
      if (aVal === bVal) return a.symbol.localeCompare(b.symbol) * direction;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') return aVal.localeCompare(bVal) * direction;
      return ((aVal as number) - (bVal as number)) * direction;
    });
  };

  const chainContracts = (chainData?.contracts ?? [])
    .filter((c) => {
      if (typeFilter !== 'both' && c.type !== typeFilter) return false;
      if (expiryFilter && c.expirationStr !== expiryFilter) return false;
      const abs = Math.abs(c.delta);
      if (abs < deltaFilter[0] || abs > deltaFilter[1]) return false;
      return true;
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'expiry':  return (a.expiration - b.expiration) * dir;
        case 'strike':  return (a.strike - b.strike) * dir;
        case 'delta':   return (Math.abs(a.delta) - Math.abs(b.delta)) * dir;
        case 'premium': return (a.mid - b.mid) * dir;
        case 'theta':   return (Math.abs(a.theta) - Math.abs(b.theta)) * dir;
        case 'oi':      return (a.openInterest - b.openInterest) * dir;
        case 'be':      return (a.breakeven - b.breakeven) * dir;
        default:        return 0;
      }
    });

  // ── Builder state ───────────────────────────────────────────────
  const [bldStrategy, setBldStrategy] = useState<'pure' | 'pmcc' | 'spread'>('pure');
  const [bldSymbol, setBldSymbol] = useState('AAPL');
  const [bldSpot, setBldSpot] = useState('');
  const [bldType, setBldType] = useState<'call' | 'put'>('call');
  const [bldStrike, setBldStrike] = useState('');
  const [bldStrike2, setBldStrike2] = useState('');    // for PMCC short call or spread upper
  const [bldExpiry, setBldExpiry] = useState('');
  const [bldIV, setBldIV] = useState('25');
  const [bldQty, setBldQty] = useState('1');
  const [bldDaysHeld, setBldDaysHeld] = useState('0');
  const [bldPremium, setBldPremium] = useState('');
  const [bldPnL, setBldPnL] = useState<{ price: number; expiry: number; theta: number }[] | null>(null);
  const [bldError, setBldError] = useState('');

  const handleBldCalc = () => {
    setBldError('');
    const spot = parseFloat(bldSpot);
    const strike = parseFloat(bldStrike);
    const premium = parseFloat(bldPremium);
    const iv = parseFloat(bldIV) / 100;
    const qty = parseInt(bldQty) || 1;
    const daysHeld = parseInt(bldDaysHeld) || 0;

    if (!spot || !strike || !premium || !bldExpiry) { setBldError('Fill in all fields.'); return; }
    const daysTotal = Math.max(1, Math.round((new Date(bldExpiry).getTime() - Date.now()) / 86400000) + daysHeld);
    if (daysTotal < 1) { setBldError('Expiry must be in the future.'); return; }

    const curve = buildLeapsPnL(bldType, strike, premium, spot, daysHeld, daysTotal, iv, qty);
    setBldPnL(curve);
  };

  const bldPmcc = (() => {
    const spot = parseFloat(bldSpot);
    const premium = parseFloat(bldPremium);
    const iv = parseFloat(bldIV);
    if (!spot || !premium || !bldExpiry) return null;
    const daysTotal = Math.max(1, Math.round((new Date(bldExpiry).getTime() - Date.now()) / 86400000));
    return pmccProjection(premium, spot, iv, daysTotal);
  })();

  // ── Portfolio state ─────────────────────────────────────────────
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
  const [newPos, setNewPos] = useState<Partial<PortfolioPosition>>({ type: 'call', qty: 1 });
  const [addOpen, setAddOpen] = useState(false);

  // ── Tab guide state (dismissed per tab, persisted to localStorage) ──
  const [guideClosed, setGuideClosed] = useState<Partial<Record<string, boolean>>>({});

  useEffect(() => {
    setPortfolio(loadPortfolio());
    try {
      const stored = JSON.parse(localStorage.getItem('gr8bux_leaps_guide') ?? '{}');
      setGuideClosed(stored);
    } catch { /* ignore */ }
  }, []);

  const toggleGuide = useCallback((t: string) => {
    setGuideClosed((prev) => {
      const next = { ...prev, [t]: !prev[t] };
      try { localStorage.setItem('gr8bux_leaps_guide', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const addPosition = () => {
    if (!newPos.symbol || !newPos.strike || !newPos.expiryStr || !newPos.entryPremium) return;
    const pos: PortfolioPosition = {
      id: Date.now().toString(),
      symbol: (newPos.symbol as string).toUpperCase(),
      type: newPos.type as 'call' | 'put',
      strike: newPos.strike as number,
      expiryStr: newPos.expiryStr as string,
      entryPremium: newPos.entryPremium as number,
      qty: newPos.qty as number ?? 1,
      entryDate: newPos.entryDate ?? new Date().toISOString().slice(0, 10),
      notes: newPos.notes ?? '',
    };
    const updated = [...portfolio, pos];
    setPortfolio(updated);
    savePortfolio(updated);
    setNewPos({ type: 'call', qty: 1 });
    setAddOpen(false);
  };

  const removePosition = (id: string) => {
    const updated = portfolio.filter((p) => p.id !== id);
    setPortfolio(updated);
    savePortfolio(updated);
  };

  const daysToExpiry = (expiryStr: string) =>
    Math.max(0, Math.round((new Date(expiryStr).getTime() - Date.now()) / 86400000));

  const rollAlert = (dte: number) =>
    dte <= 180 ? 'bg-red-100 text-red-700' :
    dte <= 270 ? 'bg-amber-100 text-amber-700' :
    'bg-green-100 text-green-700';

  const rollMsg = (dte: number) =>
    dte <= 60  ? '🚨 Roll immediately' :
    dte <= 180 ? '⚠️ Consider rolling (< 6mo)' :
    dte <= 270 ? '📅 Roll in ~3–4 months' :
    '✅ Holding comfortably';

  /* ── shared input class ─────────────────────────────────────── */
  const iCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full bg-white';

  /* ─────────────────────────────────────────────────────────────
     RENDER
  ──────────────────────────────────────────────────────────────*/
  const TABS: { id: Tab; label: string }[] = [
    { id: 'screener', label: '🔍 Screener' },
    { id: 'chain',    label: '📋 Chain Viewer' },
    { id: 'builder',  label: '🛠️ Builder' },
    { id: 'portfolio',label: '💼 Portfolio' },
    { id: 'rules',    label: '📖 Rules & Tips' },
  ];

  return (
    <Layout title="LEAPS">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Page Header ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-6 py-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">LEAPS Options</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Long-term Equity Anticipation Securities — expirations ≥ 12 months
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                { emoji: '📅', label: 'Min 12 months to expiry' },
                { emoji: '🎯', label: 'Target 0.60–0.80 Delta' },
                { emoji: '📉', label: 'Enter when IV Rank < 30' },
              ].map(({ emoji, label }) => (
                <span key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 font-medium">
                  {emoji} {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div className="flex border-b border-gray-200 bg-white rounded-t-xl overflow-hidden shadow-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-semibold transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'border-b-2 border-indigo-600 text-indigo-700 bg-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center px-4 border-l border-gray-100 shrink-0">
            <button
              onClick={() => toggleGuide(tab)}
              title={guideClosed[tab] ? 'Show how-to guide for this tab' : 'Hide guide'}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
            >
              {guideClosed[tab]
                ? <><span className="text-sm">ⓘ</span> Guide</>
                : <><span className="text-sm opacity-60">✕</span> Hide guide</>}
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            TAB: SCREENER
        ══════════════════════════════════════════════════════ */}
        {tab === 'screener' && (
          <div className="space-y-4">
            {!guideClosed['screener'] && <GuideBox data={GUIDES.screener} onClose={() => toggleGuide('screener')} />}
            {/* Filters */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-wrap gap-4 items-end">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Sector</label>
                <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none">
                  {SECTORS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Max IV Rank: <strong>{maxIvr}</strong></label>
                <input type="range" min={10} max={100} value={maxIvr} onChange={(e) => setMaxIvr(Number(e.target.value))}
                  className="w-32 accent-indigo-500" />
              </div>
              <p className="text-xs text-gray-400 self-center">Green IV Rank = IV is cheap → good for LEAPS buyers</p>
            </div>

            {/* Education bar */}
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-xs text-indigo-700 space-y-1">
              <p className="font-bold mb-1">📚 Screener Guide</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <p><strong>IV Rank &lt; 30</strong> — options are cheap. Buy now, don&apos;t sell.</p>
                <p><strong>Delta 0.70–0.80</strong> — moves like stock at a fraction of capital (deep ITM LEAPS).</p>
                <p><strong>Premium</strong> shown per contract (×100 shares). Compare to owning 100 shares outright.</p>
              </div>
            </div>

            {/* Screener + AI Advisor Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Screener Table (left side) */}
              <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <ScreenerTable
                  rows={sortScreenerRows(
                    screenerData.filter((r) =>
                      (sectorFilter === 'All' || r.sector === sectorFilter) &&
                      (r.ivr === null || r.ivr <= maxIvr)
                    ),
                    screenerSortKey,
                    screenerSortDir,
                  )}
                  onPick={handlePickFromScreener}
                  sortKey={screenerSortKey}
                  sortDir={screenerSortDir}
                  onSort={handleScreenerSort}
                />
              </div>

              {/* AI Advisor Panel (right side) */}
              <div>
                {selectedScreenerRow ? (
                  <AIAdvisorPanel
                    analysis={aiAnalysis}
                    isLoading={aiLoading}
                    error={aiError}
                    onTradeClick={() => handlePickFromScreener(selectedScreenerRow.symbol)}
                    compact={false}
                  />
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center">
                    <p className="text-sm text-gray-500 font-medium">Click "Analyze →" on any row to see AI analysis</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: CHAIN VIEWER
        ══════════════════════════════════════════════════════ */}
        {tab === 'chain' && (
          <div className="space-y-4">
            {!guideClosed['chain'] && <GuideBox data={GUIDES.chain} onClose={() => toggleGuide('chain')} />}
            {/* Search bar */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Symbol</label>
                <form onSubmit={(e) => { e.preventDefault(); setChainSymbol(chainInput.toUpperCase()); fetchChain(chainInput.toUpperCase()); }}
                  className="flex gap-2">
                  <input value={chainInput} onChange={(e) => setChainInput(e.target.value.toUpperCase())}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    placeholder="AAPL" />
                  <button type="submit" className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700">
                    Load
                  </button>
                </form>
              </div>
              {/* Type filter */}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Type</label>
                <div className="flex gap-1">
                  {(['call', 'put', 'both'] as const).map((t) => (
                    <button key={t} onClick={() => setTypeFilter(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${typeFilter === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {/* Expiry filter */}
              {chainData && (
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Expiry</label>
                  <select value={expiryFilter} onChange={(e) => setExpiryFilter(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none">
                    <option value="">All LEAPS</option>
                    {chainData.leapsExpirations.map((ex) => <option key={ex}>{ex}</option>)}
                  </select>
                </div>
              )}
              {/* Delta filter */}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  Min Delta: <strong>{deltaFilter[0].toFixed(2)}</strong>
                </label>
                <input type="range" min={0.10} max={0.95} step={0.05}
                  value={deltaFilter[0]}
                  onChange={(e) => setDeltaFilter([Number(e.target.value), deltaFilter[1]])}
                  className="w-28 accent-indigo-500" />
              </div>
            </div>

            {/* Status / price */}
            {chainData && !chainLoading && (
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="font-bold text-gray-800">{chainData.symbol}</span>
                <span className="text-indigo-700 font-bold">${chainData.underlyingPrice.toFixed(2)}</span>
                {chainData.hv20 !== null && <span className="text-gray-500">HV20: <strong>{chainData.hv20}%</strong></span>}
                <span className="text-gray-400 text-xs">{chainContracts.length} contracts shown</span>
              </div>
            )}

            {chainLoading && <Spinner />}
            {chainError && <p className="text-sm text-red-500">{chainError}</p>}

            {/* Chain table */}
            {chainData && !chainLoading && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[900px]">
                    <thead className="bg-gray-50">
                      <tr className="text-gray-400 border-b border-gray-100">
                        <th className="text-left py-3 px-3 cursor-pointer hover:text-gray-600" onClick={() => handleSort('expiry')}>
                          Expiry {sortKey === 'expiry' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th className="text-left py-3 px-3">Type</th>
                        <th className="text-right py-3 px-3 cursor-pointer hover:text-gray-600" onClick={() => handleSort('strike')}>
                          Strike {sortKey === 'strike' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th className="text-right py-3 px-3 cursor-pointer hover:text-gray-600" onClick={() => handleSort('delta')}>
                          Δ Delta {sortKey === 'delta' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th className="text-right py-3 px-3">IV %</th>
                        <th className="text-right py-3 px-3 cursor-pointer hover:text-gray-600" onClick={() => handleSort('theta')}>
                          Θ /day {sortKey === 'theta' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th className="text-right py-3 px-3 cursor-pointer hover:text-gray-600" onClick={() => handleSort('oi')}>
                          OI {sortKey === 'oi' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th className="text-right py-3 px-3 cursor-pointer hover:text-gray-600" onClick={() => handleSort('premium')}>
                          Bid / Ask {sortKey === 'premium' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th className="text-right py-3 px-3 cursor-pointer hover:text-gray-600" onClick={() => handleSort('be')}>
                          Breakeven {sortKey === 'be' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                        </th>
                        <th className="text-right py-3 px-3">vs. Shares</th>
                        <th className="text-center py-3 px-3">Build</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chainContracts.length === 0 && (
                        <tr><td colSpan={11} className="text-center py-8 text-gray-400">No contracts match your filters.</td></tr>
                      )}
                      {chainContracts.map((c) => {
                        const dl = deltaLabel(c.delta, c.type);
                        const beVsSpot = chainData.underlyingPrice > 0
                          ? ((c.breakeven - chainData.underlyingPrice) / chainData.underlyingPrice * 100)
                          : 0;
                        return (
                          <tr key={c.contractSymbol} className="border-b border-gray-50 hover:bg-indigo-50/30">
                            <td className="py-2 px-3 font-medium text-gray-700">
                              {c.expirationStr}
                              <span className="block text-[9px] text-gray-400">{c.daysToExpiry}d</span>
                            </td>
                            <td className="py-2 px-3">
                              <Badge cls={c.type === 'call' ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}>
                                {c.type.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-gray-800">${c.strike}</td>
                            <td className="py-2 px-3 text-right">
                              <Badge cls={dl.cls}>{c.delta.toFixed(2)}</Badge>
                            </td>
                            <td className="py-2 px-3 text-right text-gray-600">{c.impliedVolatility.toFixed(1)}%</td>
                            <td className={`py-2 px-3 text-right font-semibold ${c.theta < 0 ? 'text-red-500' : 'text-green-600'}`}>
                              ${c.theta.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right text-gray-600">{c.openInterest.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-gray-700">
                              ${c.bid.toFixed(2)} / ${c.ask.toFixed(2)}
                              <span className="block text-[10px] text-indigo-600 font-semibold">mid ${c.mid.toFixed(2)}</span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className="font-semibold text-gray-800">${c.breakeven.toFixed(2)}</span>
                              <span className={`block text-[10px] ${beVsSpot > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                                {beVsSpot > 0 ? '+' : ''}{beVsSpot.toFixed(1)}% from spot
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className="font-semibold text-indigo-700">{c.costVs100Shares.toFixed(1)}%</span>
                              <span className="block text-[10px] text-gray-400">of ${(chainData.underlyingPrice * 100).toFixed(0)}</span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                onClick={() => {
                                  setBldSymbol(chainData.symbol);
                                  setBldSpot(chainData.underlyingPrice.toFixed(2));
                                  setBldType(c.type);
                                  setBldStrike(c.strike.toString());
                                  setBldExpiry(c.expirationStr);
                                  setBldIV(c.impliedVolatility.toFixed(1));
                                  setBldPremium(c.mid.toFixed(2));
                                  setBldPnL(null);
                                  setTab('builder');
                                }}
                                className="px-2 py-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-semibold hover:bg-indigo-100"
                              >
                                Build →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Education bar */}
            {!chainLoading && !chainError && !chainData && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 text-xs text-gray-500 space-y-2">
                <p className="font-semibold text-gray-700">📋 What to look for in the LEAPS chain:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li><strong>Delta 0.70–0.80</strong> — deep ITM, moves like stock, slowest theta decay</li>
                  <li><strong>Delta 0.50–0.60</strong> — ATM, best balance of cost and leverage</li>
                  <li><strong>Delta 0.30–0.40</strong> — OTM, cheapest but needs a large move to profit</li>
                  <li><strong>Theta/day</strong> — how much the option loses per day from time decay alone</li>
                  <li><strong>vs. Shares</strong> — the option costs this % of buying 100 shares outright</li>
                  <li><strong>Breakeven</strong> — the stock price where you break even <em>at expiration</em></li>
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: BUILDER
        ══════════════════════════════════════════════════════ */}
        {tab === 'builder' && (
          <div className="space-y-4">
            {!guideClosed['builder'] && <GuideBox data={GUIDES.builder} onClose={() => toggleGuide('builder')} />}
            {/* Strategy selector */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-700 mb-3">LEAPS Strategy</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {([
                  { id: 'pure',  label: 'Pure LEAPS',          desc: 'Buy and hold for directional move. Exit at target or stop.' },
                  { id: 'pmcc',  label: 'Poor Man\'s Covered Call', desc: 'Buy deep ITM LEAPS + sell 30-45 DTE OTM calls monthly for income.' },
                  { id: 'spread',label: 'LEAPS Bull Call Spread', desc: 'Buy ATM LEAPS + sell same-expiry OTM call. Lower cost, capped profit.' },
                ] as { id: 'pure' | 'pmcc' | 'spread'; label: string; desc: string }[]).map(({ id, label, desc }) => (
                  <button key={id} onClick={() => setBldStrategy(id)}
                    className={`px-4 py-2.5 rounded-lg text-xs font-semibold border text-left transition-colors ${bldStrategy === id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-indigo-300'}`}>
                    {label}
                    <span className={`block mt-0.5 font-normal leading-tight ${bldStrategy === id ? 'text-indigo-200' : 'text-gray-400'}`}>{desc}</span>
                  </button>
                ))}
              </div>

              {/* Inputs grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Symbol</label>
                  <input value={bldSymbol} onChange={(e) => setBldSymbol(e.target.value.toUpperCase())} className={iCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Spot Price ($)</label>
                  <input value={bldSpot} onChange={(e) => setBldSpot(e.target.value)} placeholder="0.00" className={iCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Type</label>
                  <select value={bldType} onChange={(e) => setBldType(e.target.value as 'call' | 'put')} className={iCls}>
                    <option value="call">Call</option>
                    <option value="put">Put</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">LEAPS Strike ($)</label>
                  <input value={bldStrike} onChange={(e) => setBldStrike(e.target.value)} placeholder="e.g. 190" className={iCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Expiry (YYYY-MM-DD)</label>
                  <input type="date" value={bldExpiry} onChange={(e) => setBldExpiry(e.target.value)} className={iCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">IV (%)</label>
                  <input value={bldIV} onChange={(e) => setBldIV(e.target.value)} placeholder="25" className={iCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Premium Paid ($)</label>
                  <input value={bldPremium} onChange={(e) => setBldPremium(e.target.value)} placeholder="per share" className={iCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Contracts</label>
                  <input value={bldQty} onChange={(e) => setBldQty(e.target.value)} placeholder="1" className={iCls} />
                </div>
                {bldStrategy === 'pmcc' && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Short Call Strike ($)</label>
                    <input value={bldStrike2} onChange={(e) => setBldStrike2(e.target.value)} placeholder="e.g. 210 OTM" className={iCls} />
                  </div>
                )}
              </div>

              {/* Days held slider */}
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-medium text-gray-500">Days held for &quot;today&quot; P&L curve</label>
                  <span className="text-xs font-bold text-indigo-600">{bldDaysHeld}d</span>
                </div>
                <input type="range" min={0} max={300} value={bldDaysHeld}
                  onChange={(e) => { setBldDaysHeld(e.target.value); setBldPnL(null); }}
                  className="w-full accent-indigo-500" />
                <div className="flex justify-between text-[9px] text-gray-300">
                  <span>Entry (0d)</span><span>300 days in</span>
                </div>
              </div>

              {bldError && <p className="text-xs text-red-500 mb-3">{bldError}</p>}
              <button onClick={handleBldCalc}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700">
                Analyze LEAPS
              </button>
            </div>

            {/* P&L Chart */}
            {bldPnL && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">P&L Analysis — {bldSymbol} {bldType.toUpperCase()} ${bldStrike}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {(() => {
                    const premium = parseFloat(bldPremium);
                    const qty = parseInt(bldQty) || 1;
                    const totalCost = premium * qty * 100;
                    const maxProfit = bldType === 'call'
                      ? (parseFloat(bldSpot) * 1.50 - parseFloat(bldStrike) - premium) * qty * 100
                      : (parseFloat(bldStrike) - parseFloat(bldSpot) * 0.50 - premium) * qty * 100;
                    const be = bldType === 'call'
                      ? parseFloat(bldStrike) + premium
                      : parseFloat(bldStrike) - premium;
                    const dte = Math.max(0, Math.round((new Date(bldExpiry).getTime() - Date.now()) / 86400000));
                    const items = [
                      { label: 'Total Cost', value: `$${totalCost.toFixed(2)}`, color: 'text-red-600' },
                      { label: 'Breakeven',  value: `$${be.toFixed(2)}`,       color: 'text-indigo-600' },
                      { label: 'DTE',        value: `${dte} days`,             color: 'text-gray-700' },
                      { label: 'Stop Loss',  value: `$${(totalCost * 0.50).toFixed(2)} (50%)`, color: 'text-red-500' },
                    ];
                    return items.map(({ label, value, color }) => (
                      <div key={label} className="rounded-lg border border-gray-100 p-3 bg-gray-50">
                        <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
                        <p className={`text-base font-extrabold ${color}`}>{value}</p>
                      </div>
                    ));
                  })()}
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={bldPnL} margin={{ top: 8, right: 24, left: 16, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="price" tickFormatter={(v) => `$${(v as number).toFixed(0)}`} tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: '#94a3b8' }}
                      formatter={(val: number, name: string) => [fmt$(val), name === 'expiry' ? 'At Expiry' : `Today (+${bldDaysHeld}d)`]}
                      labelFormatter={(l) => `Price: $${(l as number).toFixed(2)}`}
                    />
                    <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1.5} />
                    <ReferenceLine x={parseFloat(bldSpot)} stroke="#94a3b8" strokeDasharray="4 4"
                      label={{ value: 'Spot', fill: '#94a3b8', fontSize: 10 }} />
                    <Line type="monotone" dataKey="expiry" stroke="#6366f1" strokeWidth={2.5} dot={false} name="expiry" />
                    <Line type="monotone" dataKey="theta" stroke="#f59e0b" strokeWidth={1.5} dot={false}
                      strokeDasharray="5 3" name="theta" />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-5 text-xs text-gray-400 mt-3 justify-center">
                  <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-0.5 bg-indigo-500 rounded" />At Expiry</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-0" style={{ border: '1px dashed #f59e0b' }} />Today (+{bldDaysHeld}d)</span>
                </div>
              </div>
            )}

            {/* PMCC Income Projection */}
            {bldStrategy === 'pmcc' && bldPmcc && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 shadow-sm p-5">
                <h3 className="text-sm font-bold text-blue-800 mb-3">💰 PMCC Income Projection</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Sell cycles (~45d)',    value: `${bldPmcc.cycles}x` },
                    { label: 'Est. per cycle (30Δ)',  value: `$${(bldPmcc.weeklyYield).toFixed(0)}` },
                    { label: 'Total income (est.)',   value: `$${bldPmcc.totalIncome.toFixed(0)}` },
                    { label: 'Net cost after income', value: `$${bldPmcc.netCost.toFixed(0)}` },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-white border border-blue-100 p-3">
                      <p className="text-[10px] text-blue-400 mb-0.5">{label}</p>
                      <p className="text-base font-extrabold text-blue-800">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-blue-600 mt-3">
                  ⚠️ That&apos;s {bldPmcc.cycles} short call rolls, each approximately 45 days, selling a 30Δ call for ~{((bldPmcc.weeklyYield / (parseFloat(bldSpot) || 100)) * 100).toFixed(1)}% of spot.
                  Actual income varies with IV and spot movement. Always check the short call delta stays above the LEAPS delta before selling.
                </p>
              </div>
            )}

            {/* Management rules */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-700 mb-3">📋 Management Playbook</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {[
                  { trigger: '🟢 Profit hits +50–100%',     action: 'Sell or roll strike closer to stock; bank partial gains' },
                  { trigger: '🔴 Loss hits -40–50%',        action: 'Hard stop — exit. Thesis is broken or IV imploded.' },
                  { trigger: '📅 DTE crosses 180 days',      action: 'Prepare to roll forward to a later expiry, same strike' },
                  { trigger: '📈 Delta > 0.95 (deep ITM)',   action: 'Roll down to a lower strike; recapture extrinsic value' },
                  { trigger: '📊 IV spikes before event',    action: 'Sell a short call against LEAPS to capture premium (PMCC)' },
                  { trigger: '🎯 Target price reached',      action: 'Sell to close — almost never exercise (lose extrinsic)' },
                ].map(({ trigger, action }) => (
                  <div key={trigger} className="flex gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                    <span className="font-semibold text-gray-700 w-48 shrink-0">{trigger}</span>
                    <span className="text-gray-500">{action}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: PORTFOLIO
        ══════════════════════════════════════════════════════ */}
        {tab === 'portfolio' && (
          <div className="space-y-4">
            {!guideClosed['portfolio'] && <GuideBox data={GUIDES.portfolio} onClose={() => toggleGuide('portfolio')} />}
            {/* Add position button */}
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">{portfolio.length} open LEAPS position{portfolio.length !== 1 ? 's' : ''}</p>
              <button onClick={() => setAddOpen(!addOpen)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Position
              </button>
            </div>

            {/* Add form */}
            {addOpen && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-indigo-800 mb-3">New LEAPS Position</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  {[
                    { label: 'Symbol',         key: 'symbol',        ph: 'AAPL', type: 'text' },
                    { label: 'Strike ($)',      key: 'strike',        ph: '190',  type: 'number' },
                    { label: 'Expiry',          key: 'expiryStr',     ph: '',     type: 'date' },
                    { label: 'Entry Premium',   key: 'entryPremium',  ph: '12.50',type: 'number' },
                    { label: 'Contracts',       key: 'qty',           ph: '1',    type: 'number' },
                    { label: 'Entry Date',      key: 'entryDate',     ph: '',     type: 'date' },
                  ].map(({ label, key, ph, type }) => (
                    <div key={key}>
                      <label className="text-xs font-medium text-indigo-700 block mb-1">{label}</label>
                      <input
                        type={type}
                        placeholder={ph}
                        value={(newPos as Record<string, unknown>)[key] as string ?? ''}
                        onChange={(e) => setNewPos((p) => ({ ...p, [key]: type === 'number' ? parseFloat(e.target.value) || e.target.value : e.target.value }))}
                        className="border border-indigo-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full bg-white"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="text-xs font-medium text-indigo-700 block mb-1">Type</label>
                    <select value={newPos.type ?? 'call'} onChange={(e) => setNewPos((p) => ({ ...p, type: e.target.value as 'call' | 'put' }))}
                      className="border border-indigo-200 rounded-lg px-3 py-2 text-sm w-full bg-white focus:outline-none">
                      <option value="call">Call</option>
                      <option value="put">Put</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-indigo-700 block mb-1">Notes</label>
                    <input placeholder="Thesis, target price, etc."
                      value={newPos.notes ?? ''}
                      onChange={(e) => setNewPos((p) => ({ ...p, notes: e.target.value }))}
                      className="border border-indigo-200 rounded-lg px-3 py-2 text-sm w-full bg-white focus:outline-none" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={addPosition}
                    className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700">Save Position</button>
                  <button onClick={() => setAddOpen(false)}
                    className="bg-white border border-gray-200 text-gray-600 px-5 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            )}

            {/* Portfolio table */}
            {portfolio.length === 0 && !addOpen && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
                <p className="text-gray-400 text-sm mb-2">No positions tracked yet.</p>
                <p className="text-xs text-gray-300">Use the Screener and Chain Viewer to find LEAPS, then add them here to track.</p>
              </div>
            )}
            {portfolio.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[800px]">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-gray-400">
                        <th className="text-left py-3 px-3">Symbol</th>
                        <th className="text-left py-3 px-3">Position</th>
                        <th className="text-right py-3 px-3">Entry</th>
                        <th className="text-right py-3 px-3">Total Cost</th>
                        <th className="text-right py-3 px-3">DTE</th>
                        <th className="text-left py-3 px-3">Roll Status</th>
                        <th className="text-left py-3 px-3">Notes</th>
                        <th className="text-center py-3 px-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.map((pos) => {
                        const dte = daysToExpiry(pos.expiryStr);
                        const totalCost = pos.entryPremium * pos.qty * 100;
                        const rollCls = rollAlert(dte);
                        return (
                          <tr key={pos.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-3 px-3">
                              <span className="font-bold text-gray-800">{pos.symbol}</span>
                              <span className="block text-[10px] text-gray-400">entered {pos.entryDate}</span>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`font-semibold ${pos.type === 'call' ? 'text-green-700' : 'text-red-600'}`}>
                                {pos.qty}× {pos.type.toUpperCase()}
                              </span>
                              <span className="block text-gray-500">${pos.strike} · {pos.expiryStr}</span>
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-gray-700">
                              ${pos.entryPremium.toFixed(2)}/sh
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-red-600">
                              ${totalCost.toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-gray-800">{dte}d</td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${rollCls}`}>
                                {rollMsg(dte)}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-gray-500 max-w-[200px] truncate">{pos.notes || '—'}</td>
                            <td className="py-3 px-3 text-center">
                              <button onClick={() => removePosition(pos.id)}
                                className="text-red-400 hover:text-red-600 text-[11px] font-semibold px-2 py-1 rounded hover:bg-red-50">
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Roll alerts summary */}
                {portfolio.some((p) => daysToExpiry(p.expiryStr) <= 180) && (
                  <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-700 font-medium">
                    ⚠️ {portfolio.filter((p) => daysToExpiry(p.expiryStr) <= 180).length} position(s) within 180 days — review roll timing.
                  </div>
                )}
              </div>
            )}

            {/* Cheat sheet */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-700 mb-3">📌 LEAPS Management Cheat Sheet</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-gray-600">
                <div className="space-y-2">
                  <p className="font-bold text-gray-700">⏰ When to Roll</p>
                  <p>DTE &lt; 180: begin looking for a roll date.</p>
                  <p>DTE &lt; 90: aggressive roll — theta decay accelerates below 90 days.</p>
                  <p>Roll to same strike, 12+ months farther. Cost = debit/credit of the roll.</p>
                </div>
                <div className="space-y-2">
                  <p className="font-bold text-gray-700">🎯 Profit Targets</p>
                  <p>+50% of premium paid: excellent — take it.</p>
                  <p>+100% of premium paid: exceptional — exit fully.</p>
                  <p>If the stock hits your thesis target early, sell — don&apos;t wait for expiry.</p>
                </div>
                <div className="space-y-2">
                  <p className="font-bold text-gray-700">🛑 Stop Loss Rules</p>
                  <p>-40 to -50% of premium paid: hard stop. No averaging down on LEAPS.</p>
                  <p>If IV collapses dramatically, that can cause losses even if the stock is flat — reassess.</p>
                  <p>Never exercise early — you lose all remaining extrinsic value.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: RULES & TIPS
        ══════════════════════════════════════════════════════ */}
        {tab === 'rules' && (
          <div className="space-y-5">
            {!guideClosed['rules'] && <GuideBox data={GUIDES.rules} onClose={() => toggleGuide('rules')} />}

            {/* ── 1. Stock Selection ── */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-indigo-600 flex items-center gap-2">
                <span className="text-lg">📈</span>
                <h2 className="text-sm font-bold text-white">1. Stock Selection</h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { icon: '🔺', title: 'Upward-trending stock',   body: 'Only buy LEAPS on stocks with strong fundamentals and a clear bullish trend. Avoid sideways or downtrending names — theta works against you every day.' },
                  { icon: '💰', title: 'P/E ratio below 100',      body: 'High P/E stocks have more valuation compression risk. Ideally target P/E < 100 so you\u2019re not paying two premiums: an expensive stock AND expensive options.' },
                  { icon: '📅', title: '1–1.5 year chart uptrend', body: 'Look for a consistent series of higher highs and higher lows on the weekly chart. A stock that has been trending up for 12–18 months is far more likely to continue.' },
                ].map(({ icon, title, body }) => (
                  <div key={title} className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{icon}</span>
                      <p className="text-sm font-bold text-gray-800">{title}</p>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 2. Entry Rules ── */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-emerald-600 flex items-center gap-2">
                <span className="text-lg">🎯</span>
                <h2 className="text-sm font-bold text-white">2. Entry Rules</h2>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-sm font-bold text-emerald-800 mb-1">📉 Enter at / near lower Bollinger Band</p>
                    <p className="text-xs text-emerald-700 leading-relaxed">
                      The lower BB is a mean-reversion zone on an uptrending stock — statistically cheap. Buying LEAPS here captures both the
                      bounce AND gives you time to be right. IV is often elevated during dips, so consider waiting a day or two for IV to cool before entering.
                    </p>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                    <p className="text-sm font-bold text-blue-800 mb-1">⚡ High-beta exception (β &gt; 2.0)</p>
                    <p className="text-xs text-blue-700 leading-relaxed">
                      High-beta stocks (TSLA, NVDA, PLTR) rarely touch the lower BB before reversing. For these,
                      entering <strong>below the mid-band</strong> is acceptable — waiting for the lower band risks missing the whole move.
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <p className="text-sm font-bold text-gray-700 mb-2">✅ Full Entry Checklist</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      'Stock is in a confirmed uptrend (weekly chart)',
                      'Price is at or below lower Bollinger Band (or mid-band for β > 2)',
                      'IV Rank is ideally below 30% — options are cheap',
                      'No earnings within 2 weeks (IV crush risk)',
                      'Market indices (SPY/QQQ) are not in a downtrend',
                      'Choose expiry ≥ 12 months — never less than 9 months',
                      'Select strike with delta 0.70–0.80 for deep ITM LEAPS',
                      'Position size: risk ≤ 2–5% of total portfolio per LEAPS',
                    ].map((item) => (
                      <div key={item} className="flex items-start gap-2 text-xs text-gray-600">
                        <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── 3. Exit Rules ── */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-amber-500 flex items-center gap-2">
                <span className="text-lg">🚪</span>
                <h2 className="text-sm font-bold text-white">3. Exit Rules</h2>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    {
                      icon: '⚡', title: 'Quick Profit Target',
                      tag: '10–20% gain', tagCls: 'bg-green-100 text-green-700',
                      time: 'Within 7 days',
                      body: 'If you enter near the lower BB and the stock bounces sharply, take the quick win. 10–20% on a LEAPS in under a week compounds beautifully over a year.',
                    },
                    {
                      icon: '🏌️', title: 'Swing Profit Target',
                      tag: '20–40% gain', tagCls: 'bg-blue-100 text-blue-700',
                      time: 'Within 4 weeks',
                      body: 'For swing holds, aim for 20–40% premium gain. At this point your delta has expanded (ITM) and theta is starting to eat faster. Lock in the win.',
                    },
                    {
                      icon: '📅', title: 'Long-hold Exit',
                      tag: 'DTE < 90 days', tagCls: 'bg-red-100 text-red-700',
                      time: 'Close or roll',
                      body: 'Never hold a LEAPS inside 90 DTE. Theta decay accelerates sharply. Either sell-to-close, or roll forward to a new 12–18 month expiry to preserve your position.',
                    },
                  ].map(({ icon, title, tag, tagCls, time, body }) => (
                    <div key={title} className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg">{icon}</span>
                        <p className="text-sm font-bold text-gray-800">{title}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tagCls}`}>{tag}</span>
                      </div>
                      <p className="text-[11px] text-indigo-600 font-semibold">{time}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{body}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-red-100 bg-red-50 p-4">
                  <p className="text-sm font-bold text-red-700 mb-2">🛡️ Black Swan Protection Rule</p>
                  <p className="text-xs text-red-600 leading-relaxed">
                    If the broad market (SPY) drops more than <strong>10% in a single week</strong> or breaks a major support on the weekly chart,
                    close all open LEAPS immediately — regardless of P&amp;L. LEAPS bleed fast in a crash: IV spikes, delta collapses, and premium can
                    fall 50–70% even if you are directionally right. Capital preservation is the priority.
                  </p>
                </div>
              </div>
            </div>

            {/* ── 4. Strike & Expiry Selection ── */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-violet-600 flex items-center gap-2">
                <span className="text-lg">🎲</span>
                <h2 className="text-sm font-bold text-white">4. Strike & Expiry Selection Guide</h2>
              </div>
              <div className="p-5 overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400">
                      <th className="text-left py-2 px-3">Strategy Goal</th>
                      <th className="text-left py-2 px-3">Delta Target</th>
                      <th className="text-left py-2 px-3">Expiry</th>
                      <th className="text-left py-2 px-3">Risk Level</th>
                      <th className="text-left py-2 px-3">Best For</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { goal: 'Stock Replacement',  delta: '0.75–0.90',  expiry: '12–24 months', risk: '🟢 Low',    best: 'Long-term investors wanting leverage without margin' },
                      { goal: 'Directional Swing',  delta: '0.55–0.75',  expiry: '12–18 months', risk: '🟡 Medium', best: 'Swing traders with 1–3 month thesis' },
                      { goal: 'Speculative Move',   delta: '0.35–0.55',  expiry: '12–15 months', risk: '🟠 High',   best: 'Catalyst plays, earnings recovery, sector rotation' },
                      { goal: 'PMCC Base Leg',       delta: '0.80–0.90',  expiry: '18–24 months', risk: '🟢 Low',    best: 'Selling monthly calls against it to reduce cost basis' },
                      { goal: 'Bull Call Spread',    delta: '0.50 long',  expiry: '12–18 months', risk: '🟡 Medium', best: 'Capped upside, lower cost, defined max loss' },
                    ].map((row) => (
                      <tr key={row.goal} className="border-b border-gray-50 hover:bg-violet-50/30">
                        <td className="py-2.5 px-3 font-semibold text-gray-700">{row.goal}</td>
                        <td className="py-2.5 px-3 text-indigo-600 font-bold">{row.delta}</td>
                        <td className="py-2.5 px-3 text-gray-600">{row.expiry}</td>
                        <td className="py-2.5 px-3">{row.risk}</td>
                        <td className="py-2.5 px-3 text-gray-500">{row.best}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── 5. Common Mistakes ── */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-red-500 flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <h2 className="text-sm font-bold text-white">5. Common Mistakes to Avoid</h2>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { bad: 'Buying LEAPS on downtrending stocks',        fix: 'Even cheap IV doesn\'t help if the stock keeps falling. Only buy LEAPS on stocks above their 200-day MA.' },
                  { bad: 'Choosing expiry too close (< 9 months)',      fix: 'Below 9 months, you no longer have a LEAPS — you have a short-dated option with fast theta decay. Always stay ≥ 12 months.' },
                  { bad: 'Buying during IV spikes (earnings, events)',  fix: 'IV crush after an event can wipe out gains even if you are right on the direction. Buy in low-IV environments (IV Rank < 30).' },
                  { bad: 'Exercising the option early',                 fix: 'Never exercise a LEAPS early. You forfeit all remaining extrinsic/time value. Always sell-to-close instead.' },
                  { bad: 'Holding past 90 DTE without a plan',         fix: 'Theta decay accelerates sharply below 90 DTE. Either have a clear exit or roll to a new expiry at least 12 months out.' },
                  { bad: 'Sizing too large (> 5% of portfolio)',        fix: 'LEAPS can drop 50–70% in a correction. Keep each position small. Total LEAPS exposure should be < 20% of portfolio.' },
                  { bad: 'Ignoring liquidity / bid-ask spread',        fix: 'Wide spreads (> $0.50) destroy your edge on entry and exit. Only trade LEAPS with open interest > 500 and volume > 50/day.' },
                  { bad: 'Averaging down on losing LEAPS',             fix: 'If the thesis is broken, exit. Adding to a losing position doubles your loss when the stock continues against you.' },
                ].map(({ bad, fix }) => (
                  <div key={bad} className="rounded-lg border border-red-100 bg-red-50 p-3">
                    <div className="flex gap-2 mb-1">
                      <span className="text-red-500 font-bold text-xs shrink-0">✗</span>
                      <p className="text-xs font-semibold text-red-700">{bad}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-green-500 font-bold text-xs shrink-0">✓</span>
                      <p className="text-xs text-gray-600">{fix}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 6. Quick-reference card ── */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
              <h3 className="text-sm font-bold text-indigo-800 mb-3">📌 Quick-Reference Card</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {[
                  { label: 'Min expiry',       value: '≥ 12 months' },
                  { label: 'Delta target',     value: '0.70 – 0.80' },
                  { label: 'Max IV Rank',      value: '< 30 to buy' },
                  { label: 'Entry signal',     value: 'Near lower BB' },
                  { label: 'Quick target',     value: '+10–20% / 7d' },
                  { label: 'Swing target',     value: '+20–40% / 4wk' },
                  { label: 'Roll at DTE',      value: '< 180 days' },
                  { label: 'Hard stop',        value: '-40 to -50%' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-white border border-indigo-100 p-3">
                    <p className="text-[10px] text-indigo-400 font-medium mb-0.5">{label}</p>
                    <p className="text-sm font-extrabold text-indigo-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">
          LEAPS data via Yahoo Finance. Black-Scholes greeks computed server-side. For educational purposes — not financial advice.
        </p>
      </div>
    </Layout>
  );
}
