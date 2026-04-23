import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import { Layout } from '@/components/Layout';
import LWChart from '@/components/LWChart';

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Indicators {
  // EMAs
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  // Momentum
  rsi: number;
  tsi: number;
  // Pivot points (classic floor method)
  pp: number;
  r1: number; r2: number; r3: number;
  s1: number; s2: number; s3: number;
  // 52-week
  high52w: number;
  low52w: number;
  // Price
  price: number;
  change: number;
  changePct: number;
}

/* ─────────────────────────────────────────────
   Pure calc helpers (client-side, no API calls)
───────────────────────────────────────────── */
function calcEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

function calcEMAArr(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function calcEMAFull(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calcTSI(closes: number[], fast = 13, slow = 25): number {
  if (closes.length < slow + fast + 2) return 0;
  const momentum = closes.slice(1).map((c, i) => c - closes[i]);
  const absMom = momentum.map(Math.abs);
  const sm1 = calcEMAArr(momentum, slow);
  const sm2 = calcEMAArr(sm1, fast);
  const sa1 = calcEMAArr(absMom, slow);
  const sa2 = calcEMAArr(sa1, fast);
  if (sa2.length === 0 || sa2[sa2.length - 1] === 0) return 0;
  return (100 * sm2[sm2.length - 1]) / sa2[sa2.length - 1];
}

// Returns full TSI series aligned to candle dates (offset by slow+fast warmup)
function calcTSIArr(candles: Candle[], fast = 13, slow = 25): { date: string; tsi: number; signal: number }[] {
  const closes = candles.map((c) => c.close);
  const momentum = closes.slice(1).map((c, i) => c - closes[i]);
  const absMom = momentum.map(Math.abs);
  const sm1 = calcEMAArr(momentum, slow);
  const sm2 = calcEMAArr(sm1, fast);
  const sa1 = calcEMAArr(absMom, slow);
  const sa2 = calcEMAArr(sa1, fast);
  if (sa2.length === 0) return [];

  // Signal line = EMA(7) of TSI
  const tsiRaw = sm2.map((v, i) => (sa2[i] !== 0 ? (100 * v) / sa2[i] : 0));
  const signalArr = calcEMAArr(tsiRaw, 7);
  const signalOffset = tsiRaw.length - signalArr.length;

  // Align dates: momentum starts at candle index 1, sm1 starts at momentum index (slow-1), sm2 at sm1 index (fast-1)
  const dateOffset = 1 + (slow - 1) + (fast - 1); // candle index where sm2[0] corresponds
  return sm2.map((_, i) => {
    const candleIdx = dateOffset + i;
    const sigIdx = i - signalOffset;
    return {
      date: candles[candleIdx]?.date ?? '',
      tsi: parseFloat(tsiRaw[i].toFixed(2)),
      signal: sigIdx >= 0 ? parseFloat(signalArr[sigIdx].toFixed(2)) : tsiRaw[i],
    };
  }).filter((d) => d.date);
}

function calcPivots(h: number, l: number, c: number) {
  const pp = (h + l + c) / 3;
  return {
    pp,
    r1: 2 * pp - l,
    r2: pp + (h - l),
    r3: h + 2 * (pp - l),
    s1: 2 * pp - h,
    s2: pp - (h - l),
    s3: l - 2 * (h - pp),
  };
}

function computeIndicators(candles: Candle[]): Indicators {
  const closes = candles.map((c) => c.close);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const change = last.close - prev.close;
  const changePct = (change / prev.close) * 100;

  // Use last completed day's H/L/C for pivot points
  const pivotCandle = candles[candles.length - 2] ?? last;
  const pivots = calcPivots(pivotCandle.high, pivotCandle.low, pivotCandle.close);

  // 52-week window (max 252 trading days)
  const window52 = candles.slice(-252);
  const high52w = Math.max(...window52.map((c) => c.high));
  const low52w = Math.min(...window52.map((c) => c.low));

  return {
    ema9: calcEMA(closes, 9),
    ema21: calcEMA(closes, 21),
    ema50: calcEMA(closes, 50),
    ema200: calcEMA(closes, 200),
    rsi: calcRSI(closes),
    tsi: calcTSI(closes),
    ...pivots,
    high52w,
    low52w,
    price: last.close,
    change,
    changePct,
  };
}

/* ─────────────────────────────────────────────
   Custom TSI Chart (Recharts)
───────────────────────────────────────────── */
interface TSIPoint { date: string; tsi: number; signal: number; }

function getTodayCst(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function TSIChart({ data, timeframeLabel, interval }: { data: TSIPoint[]; timeframeLabel?: string; interval?: string }) {
  const todayCst = getTodayCst();

  // Visible slice mirrors TradingView chart's default viewport per timeframe
  const visible = React.useMemo(() => {
    if (!data.length) return [];
    const iv = interval ?? 'D';
    if (iv === '1') {
      // 1m: today's CST session only (market open → now)
      const today = data.filter((d) => d.date.startsWith(todayCst));
      return today.length >= 10 ? today : data.slice(-390); // fallback if pre-market/weekend
    }
    if (iv === '5')   return data.slice(-390);  // ~5 sessions × 78 bars
    if (iv === '15')  return data.slice(-260);  // ~2 weeks × 26 bars
    if (iv === '60')  return data.slice(-390);  // ~6 weeks × 13 bars
    if (iv === '240') return data.slice(-120);  // ~6 months
    if (iv === 'W')   return data;              // weekly: full history
    return data.slice(-252);                    // daily: ~1 year
  }, [data, interval, todayCst]);

  const tsiColor  = '#6366f1'; // indigo
  const sigColor  = '#f59e0b'; // amber
  const bullColor = '#22c55e';
  const bearColor = '#ef4444';

  const lastTSI = visible[visible.length - 1]?.tsi ?? 0;
  const lastSig = visible[visible.length - 1]?.signal ?? 0;
  const isBull  = lastTSI > lastSig;

  const isIntraday = (visible[0]?.date ?? '').length > 10;

  // Tick format: intraday short → HH:mm only; intraday long → MM-DD HH:mm; daily → MM-DD
  const fmtTick = (d: string) => {
    const iv = interval ?? 'D';
    if (iv === '1' || iv === '5' || iv === '15') return d.slice(11);         // HH:mm
    if (iv === '60' || iv === '240')             return d.slice(5).replace('T', ' '); // MM-DD HH:mm
    return d.slice(5);                                                        // MM-DD
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg shadow p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">
            True Strength Index (25, 13, 7)
            {timeframeLabel && <span className="ml-1.5 text-xs font-normal text-gray-400">· {timeframeLabel}</span>}
          </h3>
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
            isBull ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
          }`}>
            {isBull ? '▲ Bullish' : '▼ Bearish'}
          </span>
        </div>
        <div className="flex gap-4 text-xs font-mono">
          <span>TSI <span className="font-bold" style={{ color: tsiColor }}>{lastTSI.toFixed(1)}</span></span>
          <span>Signal <span className="font-bold" style={{ color: sigColor }}>{lastSig.toFixed(1)}</span></span>
          <span className={`font-bold ${
            lastTSI > 25 ? 'text-green-600' : lastTSI < -25 ? 'text-red-600' : 'text-gray-500'
          }`}>
            {lastTSI > 25 ? 'Overbought' : lastTSI < -25 ? 'Oversold' : 'Neutral'}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={visible} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            interval={Math.floor(visible.length / 8)}
            tickFormatter={fmtTick}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            width={36}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, padding: '4px 8px' }}
            formatter={(val: number, name: string) => [val.toFixed(2), name.toUpperCase()]}
            labelFormatter={(label: string) => label}
          />
          <Legend
            iconType="line"
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            formatter={(v: string) => v === 'tsi' ? 'TSI (25,13)' : 'Signal (7)'}
          />
          {/* Key threshold lines */}
          <ReferenceLine y={0}   stroke="#374151" strokeWidth={1.5} strokeDasharray="0" />
          <ReferenceLine y={25}  stroke={bullColor} strokeDasharray="4 3" strokeWidth={1} label={{ value: '+25', position: 'right', fontSize: 9, fill: bullColor }} />
          <ReferenceLine y={-25} stroke={bearColor} strokeDasharray="4 3" strokeWidth={1} label={{ value: '-25', position: 'right', fontSize: 9, fill: bearColor }} />
          {/* TSI line — filled area approximated via stroke */}
          <Line
            type="monotone"
            dataKey="tsi"
            stroke={tsiColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
          {/* Signal line */}
          <Line
            type="monotone"
            dataKey="signal"
            stroke={sigColor}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Interpretation guide */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500 border-t pt-3">
        <span>📈 <strong>TSI crosses above Signal</strong> → Buy signal</span>
        <span>📉 <strong>TSI crosses below Signal</strong> → Sell signal</span>
        <span>⬆️ <strong>Above +25</strong> → Strong bullish momentum</span>
        <span>⬇️ <strong>Below −25</strong> → Strong bearish momentum</span>
        <span>⚡ <strong>Zero-line cross</strong> → Trend change</span>
      </div>
    </div>
  );
}

/* AdvancedChart removed — replaced by LWChart (commercial-safe, Apache 2.0) */

/* ─────────────────────────────────────────────
   Indicator panels
───────────────────────────────────────────── */
function fmt(n: number, dec = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function PivotPanel({ ind }: { ind: Indicators }) {
  const rows: { label: string; value: number; type: 'r' | 'pp' | 's' }[] = [
    { label: 'R3', value: ind.r3, type: 'r' },
    { label: 'R2', value: ind.r2, type: 'r' },
    { label: 'R1', value: ind.r1, type: 'r' },
    { label: 'PP', value: ind.pp, type: 'pp' },
    { label: 'S1', value: ind.s1, type: 's' },
    { label: 'S2', value: ind.s2, type: 's' },
    { label: 'S3', value: ind.s3, type: 's' },
  ];
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg shadow p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pivot Points</h3>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <span className={`text-xs font-bold w-8 ${r.type === 'r' ? 'text-red-600' : r.type === 's' ? 'text-green-600' : 'text-blue-700'}`}>
              {r.label}
            </span>
            <div className="flex-1 mx-2 h-1 rounded" style={{ background: r.type === 'r' ? '#fee2e2' : r.type === 's' ? '#dcfce7' : '#dbeafe' }} />
            <span className={`text-xs font-mono font-semibold ${r.type === 'r' ? 'text-red-700' : r.type === 's' ? 'text-green-700' : 'text-blue-800'}`}>
              ${fmt(r.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t pt-3 space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>52W High</span><span className="font-mono text-red-600">${fmt(ind.high52w)}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>52W Low</span><span className="font-mono text-green-600">${fmt(ind.low52w)}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>% from 52W High</span>
          <span className="font-mono text-gray-700">{fmt(((ind.price - ind.high52w) / ind.high52w) * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

function MomentumBar({ value, min, max, color }: { value: number; min: number; max: number; color: string }) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function MomentumPanel({ ind }: { ind: Indicators }) {
  const tsiColor = ind.tsi > 25 ? '#22c55e' : ind.tsi < -25 ? '#ef4444' : '#f59e0b';
  const tsiLabel = ind.tsi > 25 ? 'Bullish' : ind.tsi < -25 ? 'Bearish' : 'Neutral';

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg shadow p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Momentum</h3>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-600 font-medium">TSI (25,13)</span>
            <span className="text-xs font-mono font-bold" style={{ color: tsiColor }}>{fmt(ind.tsi, 1)}</span>
          </div>
          <MomentumBar value={ind.tsi} min={-100} max={100} color={tsiColor} />
          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>-100</span>
            <span className="font-medium" style={{ color: tsiColor }}>{tsiLabel}</span>
            <span>+100</span>
          </div>
        </div>
        <div className="mt-4 border-t pt-4 space-y-2 text-xs text-gray-500">
          <p className="font-semibold text-gray-700">What is TSI?</p>
          <p>True Strength Index measures momentum using double-smoothed price changes. Values above +25 indicate bullish momentum; below −25 indicate bearish momentum. Zero-line crossovers are key signals.</p>
        </div>
      </div>
    </div>
  );
}

function EMAPanel({ ind }: { ind: Indicators }) {
  const emas = [
    { label: 'EMA 9',   value: ind.ema9   },
    { label: 'EMA 21',  value: ind.ema21  },
    { label: 'EMA 50',  value: ind.ema50  },
    { label: 'EMA 200', value: ind.ema200 },
  ];
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg shadow p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">EMA Stack</h3>
      <div className="space-y-2">
        {emas.map(({ label, value }) => {
          const above = ind.price >= value;
          return (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-600 w-14">{label}</span>
              <div className={`flex-1 h-1 rounded ${above ? 'bg-green-200' : 'bg-red-200'}`} />
              <span className="text-xs font-mono font-semibold text-gray-700">${fmt(value)}</span>
              <span className={`text-xs font-bold w-6 text-right ${above ? 'text-green-600' : 'text-red-500'}`}>
                {above ? '▲' : '▼'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 border-t pt-3">
        {(() => {
          const aboveAll = ind.price > ind.ema9 && ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50 && ind.ema50 > ind.ema200;
          const belowAll = ind.price < ind.ema9 && ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50 && ind.ema50 < ind.ema200;
          if (aboveAll) return <p className="text-xs text-green-700 font-semibold">✅ Full bullish alignment</p>;
          if (belowAll) return <p className="text-xs text-red-600 font-semibold">❌ Full bearish alignment</p>;
          return <p className="text-xs text-yellow-700 font-semibold">⚡ Mixed EMA signals</p>;
        })()}
      </div>
    </div>
  );
}

function SignalsPanel({ ind }: { ind: Indicators }) {
  const signals: { icon: string; text: string; color: string }[] = [];

  // Golden / Death cross (price vs EMA alignment proxy)
  if (ind.ema50 > ind.ema200 && ind.price > ind.ema50) {
    signals.push({ icon: '🌟', text: 'Price above EMA50 > EMA200 (bullish)', color: 'text-green-700' });
  } else if (ind.ema50 < ind.ema200 && ind.price < ind.ema50) {
    signals.push({ icon: '💀', text: 'Price below EMA50 < EMA200 (bearish)', color: 'text-red-600' });
  }

  // TSI cross zero
  if (ind.tsi > 0) {
    signals.push({ icon: '📈', text: `TSI positive (${fmt(ind.tsi, 1)}) — momentum up`, color: 'text-green-700' });
  } else {
    signals.push({ icon: '📉', text: `TSI negative (${fmt(ind.tsi, 1)}) — momentum down`, color: 'text-red-600' });
  }

  // TSI extremes
  if (ind.tsi > 50) signals.push({ icon: '🔴', text: `TSI strongly overbought (${fmt(ind.tsi, 1)})`, color: 'text-red-600' });
  else if (ind.tsi < -50) signals.push({ icon: '🟢', text: `TSI strongly oversold (${fmt(ind.tsi, 1)})`, color: 'text-green-700' });

  // Near S/R levels
  const nearR1 = Math.abs(ind.price - ind.r1) / ind.price < 0.005;
  const nearS1 = Math.abs(ind.price - ind.s1) / ind.price < 0.005;
  if (nearR1) signals.push({ icon: '⚡', text: 'Price near R1 resistance', color: 'text-orange-600' });
  if (nearS1) signals.push({ icon: '⚡', text: 'Price near S1 support', color: 'text-orange-600' });

  // 52W proximity
  const pct52h = ((ind.price - ind.high52w) / ind.high52w) * 100;
  if (pct52h > -3) signals.push({ icon: '🏆', text: `Near 52W high (${fmt(pct52h, 1)}%)`, color: 'text-purple-700' });
  if (pct52h < -30) signals.push({ icon: '📦', text: `${fmt(Math.abs(pct52h), 0)}% off 52W high`, color: 'text-gray-500' });

  // Price vs PP
  if (ind.price > ind.pp) {
    signals.push({ icon: '🔼', text: `Above daily pivot (${fmt(ind.pp)})`, color: 'text-green-600' });
  } else {
    signals.push({ icon: '🔽', text: `Below daily pivot (${fmt(ind.pp)})`, color: 'text-red-500' });
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg shadow p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Signals</h3>
      <div className="space-y-2">
        {signals.map((s, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-sm leading-tight">{s.icon}</span>
            <p className={`text-xs leading-tight ${s.color}`}>{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Status bar (below ticker input)
───────────────────────────────────────────── */
function StatusBar({ symbol, ind }: { symbol: string; ind: Indicators }) {
  const up = ind.change >= 0;
  return (
    <div className="flex flex-wrap gap-4 items-center bg-gray-900 text-white rounded-lg px-4 py-2 text-xs font-mono">
      <span className="font-bold text-base text-white">{symbol}</span>
      <span className="text-lg font-bold">${fmt(ind.price)}</span>
      <span className={`font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
        {up ? '+' : ''}{fmt(ind.change)} ({up ? '+' : ''}{fmt(ind.changePct, 2)}%)
      </span>
      <span className="text-gray-400">|</span>
      <span>EMA9 <span className="text-yellow-300">${fmt(ind.ema9)}</span></span>
      <span>EMA21 <span className="text-orange-300">${fmt(ind.ema21)}</span></span>
      <span>EMA50 <span className="text-pink-300">${fmt(ind.ema50)}</span></span>
      <span>EMA200 <span className="text-purple-300">${fmt(ind.ema200)}</span></span>
      <span className="text-gray-400">|</span>
      <span>TSI <span className={ind.tsi > 25 ? 'text-green-400' : ind.tsi < -25 ? 'text-red-400' : 'text-yellow-300'}>{fmt(ind.tsi, 1)}</span></span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Timeframe button row
───────────────────────────────────────────── */
const INTERVALS: { label: string; value: string }[] = [
  { label: '1m',  value: '1'   },
  { label: '5m',  value: '5'   },
  { label: '15m', value: '15'  },
  { label: '1H',  value: '60'  },
  { label: '4H',  value: '240' },
  { label: '1D',  value: 'D'   },
  { label: '1W',  value: 'W'   },
];

const QUICK_TICKERS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'META', 'GOOGL', 'AMZN', 'SPY', 'QQQ'];

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */
export default function ChartPage() {
  const [input, setInput]       = useState('');
  const [symbol, setSymbol]     = useState('AAPL');
  const [interval, setInterval] = useState('1');
  const [candles, setCandles]   = useState<Candle[]>([]);
  const [chartEmaArrays, setChartEmaArrays] = useState<{ e9: number[]; e21: number[]; e50: number[]; e200: number[] } | null>(null);
  const [indicators, setIndicators] = useState<Indicators | null>(null);
  const [tsiSeries, setTsiSeries]   = useState<TSIPoint[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const fetchCandles = useCallback(async (sym: string, iv: string) => {
    setLoading(true);
    setError('');
    setIndicators(null);
    try {
      const res = await fetch(`/api/market/candles?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(iv)}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed to fetch data'); return; }
      setCandles(json.candles);
      setIndicators(computeIndicators(json.candles));
      setTsiSeries(calcTSIArr(json.candles));
      const cls: number[] = json.candles.map((c: Candle) => c.close);
      setChartEmaArrays({ e9: calcEMAFull(cls, 9), e21: calcEMAFull(cls, 21), e50: calcEMAFull(cls, 50), e200: calcEMAFull(cls, 200) });
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount and whenever interval changes
  useEffect(() => { fetchCandles(symbol, interval); }, [interval]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = () => {
    const sym = input.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
    if (!sym) return;
    setSymbol(sym);
    setInput('');
    fetchCandles(sym, interval);
  };

  return (
    <Layout>
      <div className="space-y-4">
        {/* ── Header ── */}
        <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-5 py-4">
          {/* Row 1: title + input + intervals */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h1 className="text-xl font-bold text-gray-900 shrink-0">Chart</h1>

            {/* Symbol input */}
            <div className="flex gap-2">
              <input
                className="px-3 py-1.5 border border-gray-300 dark:border-zinc-700 rounded text-sm font-mono uppercase bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 w-28"
                placeholder="Ticker…"
                value={input}
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
              <button
                onClick={handleSubmit}
                className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? '…' : 'Go'}
              </button>
            </div>

            {/* Interval buttons — pushed to the right */}
            <div className="flex gap-1 ml-auto">
              {INTERVALS.map((iv) => (
              <button
                key={iv.value}
                onClick={() => { setInterval(iv.value); fetchCandles(symbol, iv.value); }}
                className={`px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${interval === iv.value ? 'bg-gray-900 text-white border-gray-900' : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 border-gray-300 dark:border-zinc-700 hover:border-gray-600 dark:hover:border-zinc-500'}`}
              >
                {iv.label}
              </button>
            ))}
            </div>
          </div>

          {/* Row 2: Quick picks */}
          <div className="flex flex-wrap gap-1">
            {QUICK_TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => { setSymbol(t); setInput(''); fetchCandles(t, interval); }}
                className={`px-2.5 py-1 rounded text-xs font-mono font-semibold border transition-colors ${symbol === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-400 hover:bg-blue-50'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-300 text-red-700 rounded text-sm">{error}</div>
        )}

        {/* ── Status bar ── */}
        {indicators && <StatusBar symbol={symbol} ind={indicators} />}

        {/* ── Chart ── */}
        <div className="bg-white dark:bg-zinc-900 rounded-lg shadow overflow-hidden">
          <LWChart
            candles={candles}
            ema9={chartEmaArrays?.e9}
            ema21={chartEmaArrays?.e21}
            ema50={chartEmaArrays?.e50}
            ema200={chartEmaArrays?.e200}
            height={560}
            showVolume
          />
        </div>

        {/* ── TSI Chart ── */}
        {tsiSeries.length > 0 && <TSIChart data={tsiSeries} interval={interval} timeframeLabel={INTERVALS.find((iv) => iv.value === interval)?.label} />}
        {loading && tsiSeries.length === 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow p-4 animate-pulse">
            <div className="h-3 bg-gray-200 rounded w-48 mb-4" />
            <div className="h-[180px] bg-gray-100 rounded" />
          </div>
        )}

        {/* ── Indicator panels ── */}
        {indicators ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <PivotPanel  ind={indicators} />
            <MomentumPanel ind={indicators} />
            <EMAPanel    ind={indicators} />
            <SignalsPanel ind={indicators} />
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0,1,2,3].map((i) => (
              <div key={i} className="bg-white dark:bg-zinc-900 rounded-lg shadow p-4 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
                {[0,1,2,3,4].map((j) => <div key={j} className="h-2 bg-gray-100 rounded mb-2" />)}
              </div>
            ))}
          </div>
        ) : null}

        {/* ── Footer note ── */}
        <p className="text-xs text-gray-400 text-center">
          Indicators (EMA 9/21/50/200, TSI, Pivots) calculated from historical daily data.
          For informational purposes only — not financial advice.
        </p>
      </div>
    </Layout>
  );
}
