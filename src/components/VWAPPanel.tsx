import React from 'react';
import type { VWAPData } from '@/pages/api/market/vwap';

const LOCATION_LABELS: Record<VWAPData['location'], string> = {
  above2: 'Overbought >2σ',
  above1: 'Extended Bullish',
  near:   'At VWAP',
  below1: 'Extended Bearish',
  below2: 'Oversold <−2σ',
};

const LOCATION_BADGE: Record<VWAPData['location'], string> = {
  above2: 'bg-orange-100 text-orange-700 border-orange-200',
  above1: 'bg-green-100  text-green-700  border-green-200',
  near:   'bg-gray-100   text-gray-600   border-gray-200',
  below1: 'bg-red-100    text-red-600    border-red-100',
  below2: 'bg-red-200    text-red-800    border-red-300',
};

const LOCATION_CARD: Record<VWAPData['location'], string> = {
  above2: 'border-orange-200 bg-orange-50',
  above1: 'border-green-200  bg-green-50',
  near:   'border-gray-200   bg-white',
  below1: 'border-red-100    bg-red-50',
  below2: 'border-red-200    bg-red-50',
};

export default function VWAPPanel({
  data,
  symbol,
}: {
  data: VWAPData;
  symbol?: string;
}) {
  const distColor =
    data.distancePct > 1  ? 'text-green-600' :
    data.distancePct < -1 ? 'text-red-500'   : 'text-gray-700';
  const distSign = data.distancePct >= 0 ? '+' : '';

  return (
    <div className={`rounded-xl border shadow-sm p-4 ${LOCATION_CARD[data.location]}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h3 className="text-sm font-semibold text-gray-800">
          VWAP{symbol ? ` — ${symbol}` : ''} <span className="text-gray-400 font-normal">(intraday · 5-min bars)</span>
        </h3>
        <span className={`px-2.5 py-0.5 rounded border text-xs font-bold ${LOCATION_BADGE[data.location]}`}>
          {data.bias === 'bullish' ? '▲' : data.bias === 'bearish' ? '▼' : '◆'}{' '}
          {LOCATION_LABELS[data.location]}
        </span>
        <span className="ml-auto text-xs text-gray-400">{data.bars} bars today</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">VWAP</p>
          <p className="text-2xl font-bold text-gray-800">${data.vwap.toFixed(2)}</p>
          <p className="text-xs text-gray-400">Volume-weighted avg price</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Distance</p>
          <p className={`text-2xl font-bold ${distColor}`}>
            {distSign}{data.distancePct}%
          </p>
          <p className="text-xs text-gray-400">${data.currentPrice.toFixed(2)} current price</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">1σ Band</p>
          <p className="text-sm font-mono font-semibold text-gray-700">
            ${data.band1Lower.toFixed(2)} – ${data.band1Upper.toFixed(2)}
          </p>
          <p className="text-xs text-gray-400">68% probability range</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">2σ Band</p>
          <p className="text-sm font-mono font-semibold text-gray-700">
            ${data.band2Lower.toFixed(2)} – ${data.band2Upper.toFixed(2)}
          </p>
          <p className="text-xs text-gray-400">95% probability range</p>
        </div>
      </div>

      {/* Visual band bar */}
      <VWAPBandBar data={data} />

      {/* Narrative */}
      <p className="text-xs text-gray-500 mt-3 border-t pt-2">{data.narrative}</p>

      {/* Interpretation guide */}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
        <span>📌 <strong>At VWAP</strong> = institutional fair value — key decision point</span>
        <span>⬆️ <strong>Above VWAP</strong> = buyers in control intraday</span>
        <span>⬇️ <strong>Below VWAP</strong> = sellers in control intraday</span>
        <span>🔁 <strong>VWAP reclaim</strong> = intraday trend reversal signal</span>
      </div>
    </div>
  );
}

/* ── Visual band bar — shows price position within SD bands ─────── */
function VWAPBandBar({ data }: { data: VWAPData }) {
  // Map price to a 0–100 position across the 2σ range
  const range = data.band2Upper - data.band2Lower;
  if (range <= 0) return null;

  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const pct = (v: number) => clamp(((v - data.band2Lower) / range) * 100);

  const vwapPct     = pct(data.vwap);
  const pricePct    = pct(data.currentPrice);
  const sd1UpPct    = pct(data.band1Upper);
  const sd1LoPct    = pct(data.band1Lower);

  const priceColor =
    data.location === 'above2' ? '#f97316' :
    data.location === 'above1' ? '#16a34a' :
    data.location === 'near'   ? '#6366f1' :
    data.location === 'below1' ? '#ef4444' : '#b91c1c';

  return (
    <div className="relative mt-2">
      {/* Zone labels */}
      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
        <span>−2σ ${data.band2Lower.toFixed(2)}</span>
        <span>VWAP ${data.vwap.toFixed(2)}</span>
        <span>+2σ ${data.band2Upper.toFixed(2)}</span>
      </div>

      {/* Track */}
      <div className="relative h-5 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
        {/* Red zone: below -2σ (leftmost) to -1σ */}
        <div className="absolute h-full bg-red-100 rounded-l-full" style={{ left: '0%', width: `${sd1LoPct}%` }} />
        {/* Green zone: +1σ to +2σ */}
        <div className="absolute h-full bg-green-100 rounded-r-full" style={{ left: `${sd1UpPct}%`, right: '0%' }} />
        {/* 1σ band: light indigo between -1σ and +1σ */}
        <div className="absolute h-full bg-indigo-50" style={{ left: `${sd1LoPct}%`, width: `${sd1UpPct - sd1LoPct}%` }} />

        {/* VWAP line */}
        <div
          className="absolute h-full w-0.5 bg-indigo-400 opacity-80"
          style={{ left: `${vwapPct}%` }}
        />

        {/* Price dot */}
        <div
          className="absolute top-0.5 bottom-0.5 w-3 rounded-full transition-all"
          style={{
            left: `calc(${pricePct}% - 6px)`,
            background: priceColor,
          }}
        />
      </div>

      {/* -1σ / +1σ tick marks */}
      <div className="relative h-2">
        <span className="absolute text-[9px] text-gray-400 -translate-x-1/2" style={{ left: `${sd1LoPct}%` }}>−1σ</span>
        <span className="absolute text-[9px] text-gray-400 -translate-x-1/2" style={{ left: `${sd1UpPct}%` }}>+1σ</span>
      </div>
    </div>
  );
}
