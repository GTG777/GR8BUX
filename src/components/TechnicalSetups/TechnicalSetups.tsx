import React, { useEffect, useState } from 'react';
import { SMCAnalysis } from '@/types';

interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Setup {
  setupType: string;
  confidence: number;
  description: string;
  formation: string[];
  entryPrice: string;
  stopLoss: string;
  targetPrice: string;
  riskReward: string | null;
}

interface SetupsResponse {
  symbol: string;
  rsi: string;
  rsiStatus: string;
  setupCount: number;
  setups: Setup[];
}

interface Props {
  symbol: string;
  priceData: PriceData[];
}

const SETUP_COLORS: Record<string, string> = {
  coiling: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  consolidation: 'bg-blue-100 text-blue-800 border-blue-300',
  breakout: 'bg-green-100 text-green-800 border-green-300',
  support_resistance: 'bg-purple-100 text-purple-800 border-purple-300',
  trend: 'bg-indigo-100 text-indigo-800 border-indigo-300',
};

const TREND_BADGE: Record<string, string> = {
  bullish: 'bg-green-100 text-green-800',
  bearish: 'bg-red-100 text-red-800',
  ranging: 'bg-gray-100 text-gray-700',
};

const PD_BADGE: Record<string, string> = {
  premium: 'bg-red-100 text-red-800',
  discount: 'bg-green-100 text-green-800',
  equilibrium: 'bg-yellow-100 text-yellow-800',
};

export default function TechnicalSetups({ symbol, priceData }: Props) {
  const [setups, setSetups] = useState<SetupsResponse | null>(null);
  const [smc, setSmc] = useState<SMCAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [smcLoading, setSmcLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smcError, setSmcError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol || priceData.length < 20) return;

    // Fetch classic technical setups
    setLoading(true);
    setError(null);
    fetch('/api/technical/setups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, prices: priceData }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setSetups(json.data);
        else setError(json.error || 'Failed to load setups');
      })
      .catch(() => setError('Failed to load setups'))
      .finally(() => setLoading(false));

    // Fetch SMC analysis
    setSmcLoading(true);
    setSmcError(null);
    fetch('/api/technical/smc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, prices: priceData }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setSmc(json.data);
        else setSmcError(json.error || 'Failed to load SMC analysis');
      })
      .catch(() => setSmcError('Failed to load SMC analysis'))
      .finally(() => setSmcLoading(false));
  }, [symbol, priceData]);

  return (
    <div className="space-y-8">
      {/* ── Classic Technical Setups ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Technical Setups — {symbol}</h2>
          {setups && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-500">RSI: <strong>{setups.rsi}</strong></span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                setups.rsiStatus === 'Overbought' ? 'bg-red-100 text-red-700' :
                setups.rsiStatus === 'Oversold' ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-700'
              }`}>{setups.rsiStatus}</span>
            </div>
          )}
        </div>

        {loading && <p className="text-sm text-gray-500">Detecting patterns…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {setups && setups.setups.length === 0 && (
          <p className="text-sm text-gray-500">No classic patterns detected for {symbol}.</p>
        )}

        {setups && setups.setups.length > 0 && (
          <div className="space-y-3">
            {setups.setups.map((s, i) => (
              <div key={i} className={`border rounded-lg p-4 ${SETUP_COLORS[s.setupType] ?? 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold capitalize">{s.setupType.replace('_', ' ')}</span>
                  <span className="text-xs font-medium">{s.confidence}% confidence</span>
                </div>
                <p className="text-xs mb-3">{s.description}</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-gray-500 block">Entry</span><strong>${s.entryPrice}</strong></div>
                  <div><span className="text-gray-500 block">Stop</span><strong>${s.stopLoss}</strong></div>
                  <div><span className="text-gray-500 block">Target</span><strong>${s.targetPrice}</strong></div>
                </div>
                {s.riskReward && (
                  <p className="text-xs mt-2">R:R <strong>{s.riskReward}</strong></p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Smart Money Concepts ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Smart Money Concepts — {symbol}</h2>
          {smc && (
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded font-medium capitalize ${TREND_BADGE[smc.trend]}`}>
                {smc.trend === 'bullish' ? '↑ Bullish' : smc.trend === 'bearish' ? '↓ Bearish' : '↔ Ranging'}
              </span>
              <span className={`px-2 py-0.5 rounded font-medium capitalize ${PD_BADGE[smc.premiumDiscount]}`}>
                {smc.premiumDiscount}
              </span>
            </div>
          )}
        </div>

        {smcLoading && <p className="text-sm text-gray-500">Analyzing smart money structure…</p>}
        {smcError && <p className="text-sm text-red-600">{smcError}</p>}

        {smc && (
          <div className="space-y-4">
            {/* Market overview strip */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Current', value: `$${smc.currentPrice.toFixed(2)}` },
                { label: 'Equilibrium', value: `$${smc.equilibrium.toFixed(2)}` },
                { label: 'Range High', value: `$${smc.rangeHigh.toFixed(2)}` },
                { label: 'Range Low', value: `$${smc.rangeLow.toFixed(2)}` },
              ].map((item) => (
                <div key={item.label} className="bg-gray-50 border border-gray-200 rounded p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                  <p className="text-sm font-semibold">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Order Blocks */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>
                  Order Blocks ({smc.orderBlocks.length})
                </h3>
                {smc.orderBlocks.length === 0 ? (
                  <p className="text-xs text-gray-400">None detected</p>
                ) : (
                  <div className="space-y-2">
                    {smc.orderBlocks.map((ob, i) => (
                      <div key={i} className={`text-xs rounded px-3 py-2 flex items-center justify-between ${
                        ob.type === 'bullish' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                      }`}>
                        <span className={`font-medium ${ob.type === 'bullish' ? 'text-green-700' : 'text-red-700'}`}>
                          {ob.type === 'bullish' ? '▲' : '▼'} {ob.type}
                        </span>
                        <span className="text-gray-600">${ob.low.toFixed(2)} – ${ob.high.toFixed(2)}</span>
                        <span className="text-gray-400">{ob.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Fair Value Gaps */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>
                  Fair Value Gaps ({smc.fairValueGaps.length})
                </h3>
                {smc.fairValueGaps.length === 0 ? (
                  <p className="text-xs text-gray-400">None detected</p>
                ) : (
                  <div className="space-y-2">
                    {smc.fairValueGaps.map((fvg, i) => (
                      <div key={i} className={`text-xs rounded px-3 py-2 flex items-center justify-between ${
                        fvg.direction === 'bullish' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                      }`}>
                        <span className={`font-medium ${fvg.direction === 'bullish' ? 'text-green-700' : 'text-red-700'}`}>
                          {fvg.direction === 'bullish' ? '▲' : '▼'} FVG
                        </span>
                        <span className="text-gray-600">${fvg.bottom.toFixed(2)} – ${fvg.top.toFixed(2)}</span>
                        <span className="text-gray-400">{fvg.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Structure Breaks */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400 inline-block"></span>
                  Structure Breaks ({smc.structureBreaks.length})
                </h3>
                {smc.structureBreaks.length === 0 ? (
                  <p className="text-xs text-gray-400">None detected</p>
                ) : (
                  <div className="space-y-2">
                    {smc.structureBreaks.map((sb, i) => (
                      <div key={i} className={`text-xs rounded px-3 py-2 flex items-center justify-between ${
                        sb.type === 'BOS'
                          ? sb.direction === 'bullish' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                          : 'bg-purple-50 border border-purple-200'
                      }`}>
                        <span className={`font-semibold ${
                          sb.type === 'CHoCH' ? 'text-purple-700' : sb.direction === 'bullish' ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {sb.type}
                        </span>
                        <span className="text-gray-600 capitalize">{sb.direction}</span>
                        <span className="text-gray-600">${sb.price.toFixed(2)}</span>
                        <span className="text-gray-400">{sb.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Liquidity Levels */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"></span>
                  Liquidity Levels ({smc.liquidityLevels.length})
                </h3>
                {smc.liquidityLevels.length === 0 ? (
                  <p className="text-xs text-gray-400">None detected</p>
                ) : (
                  <div className="space-y-2">
                    {smc.liquidityLevels
                      .sort((a, b) => b.price - a.price)
                      .map((ll, i) => (
                        <div key={i} className={`text-xs rounded px-3 py-2 flex items-center justify-between ${
                          ll.type === 'buy-side' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                        }`}>
                          <span className={`font-medium ${ll.type === 'buy-side' ? 'text-green-700' : 'text-red-700'}`}>
                            {ll.type === 'buy-side' ? '↑ Buy-side' : '↓ Sell-side'}
                          </span>
                          <span className="text-gray-600">${ll.price.toFixed(2)}</span>
                          <span className="text-gray-400">{ll.date}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Options Strike Guidance */}
            {(smc.orderBlocks.length > 0 || smc.liquidityLevels.length > 0) && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-indigo-900 mb-2">Options Strike Guidance</h3>
                <ul className="text-xs text-indigo-800 space-y-1">
                  {smc.orderBlocks.filter((ob) => ob.type === 'bearish').slice(0, 1).map((ob, i) => (
                    <li key={i}>• <strong>Short call strike</strong> near bearish OB: ${ob.low.toFixed(2)}–${ob.high.toFixed(2)}</li>
                  ))}
                  {smc.orderBlocks.filter((ob) => ob.type === 'bullish').slice(0, 1).map((ob, i) => (
                    <li key={i}>• <strong>Short put strike</strong> near bullish OB: ${ob.low.toFixed(2)}–${ob.high.toFixed(2)}</li>
                  ))}
                  {smc.liquidityLevels.filter((l) => l.type === 'buy-side').slice(0, 1).map((l, i) => (
                    <li key={i}>• <strong>Buy-side liquidity</strong> above ${l.price.toFixed(2)} — potential magnet for call side</li>
                  ))}
                  {smc.liquidityLevels.filter((l) => l.type === 'sell-side').slice(0, 1).map((l, i) => (
                    <li key={i}>• <strong>Sell-side liquidity</strong> below ${l.price.toFixed(2)} — potential magnet for put side</li>
                  ))}
                  <li>• Premium/Discount: <strong className="capitalize">{smc.premiumDiscount}</strong> — {
                    smc.premiumDiscount === 'premium'
                      ? 'price elevated, favor selling calls or buying puts'
                      : smc.premiumDiscount === 'discount'
                      ? 'price depressed, favor selling puts or buying calls'
                      : 'price at equilibrium, iron condors preferred'
                  }</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
