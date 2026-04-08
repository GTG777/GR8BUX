import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Dashboard as TradeAnalytics } from '@/components/Dashboard';
import { Skeleton } from '@/components/Skeleton';
import type { MacroData } from '@/pages/api/market/macro';
import type { SectorData } from '@/pages/api/market/sectors';
import type { CryptoOverview } from '@/pages/api/crypto/overview';

/* ── Regime pill ────────────────────────────────────────────────── */
function RegimePill({ label, variant }: { label: string; variant: 'green' | 'red' | 'amber' | 'gray' }) {
  const cls = {
    green: 'bg-green-100 text-green-800 border-green-200',
    red:   'bg-red-100   text-red-700   border-red-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    gray:  'bg-gray-100  text-gray-600  border-gray-200',
  }[variant];
  return <span className={`px-2 py-0.5 rounded border text-xs font-bold ${cls}`}>{label}</span>;
}

/* ── Stat tile ──────────────────────────────────────────────────── */
function StatTile({
  label, value, sub, accent,
}: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className={`rounded-xl border bg-white shadow-sm p-4 ${accent ?? 'border-gray-200'}`}>
      <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-800 leading-tight">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Market signal card ─────────────────────────────────────────── */
function MarketSignalCard({
  icon, title, badge, badgeVariant, detail,
}: {
  icon: string;
  title: string;
  badge: string;
  badgeVariant: 'green' | 'red' | 'amber' | 'gray';
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{title}</p>
        <RegimePill label={badge} variant={badgeVariant} />
      </div>
      {detail
        ? <p className="text-xs text-gray-600 leading-relaxed">{detail}</p>
        : <Skeleton className="h-3 w-full" />
      }
    </div>
  );
}

/* ── Quick nav button ───────────────────────────────────────────── */
function QuickNav({ href, emoji, label }: { href: string; emoji: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <span className="text-xl">{emoji}</span>
      <span className="text-[11px] font-medium text-gray-600">{label}</span>
    </Link>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export default function Dashboard() {
  const [macro,   setMacro]   = useState<MacroData | null>(null);
  const [sectors, setSectors] = useState<SectorData | null>(null);
  const [crypto,  setCrypto]  = useState<CryptoOverview | null>(null);
  const [now,     setNow]     = useState('');

  const fetchMarket = useCallback(async () => {
    const [macroRes, sectorRes, cryptoRes] = await Promise.allSettled([
      fetch('/api/market/macro'),
      fetch('/api/market/sectors'),
      fetch('/api/crypto/overview'),
    ]);
    if (macroRes.status  === 'fulfilled' && macroRes.value.ok)   setMacro(await macroRes.value.json());
    if (sectorRes.status === 'fulfilled' && sectorRes.value.ok)  setSectors(await sectorRes.value.json());
    if (cryptoRes.status === 'fulfilled' && cryptoRes.value.ok)  setCrypto(await cryptoRes.value.json());
  }, []);

  useEffect(() => {
    fetchMarket();
    setNow(new Date().toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
    const interval = setInterval(fetchMarket, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMarket]);

  /* ── Computed values ── */
  const macroVariant = (macro?.riskRegime === 'risk-on' ? 'green' : macro?.riskRegime === 'risk-off' ? 'red' : 'gray') as 'green' | 'red' | 'gray';
  const vixVariant   = (macro?.vixRegime === 'low' ? 'green' : macro?.vixRegime === 'extreme' ? 'red' : macro?.vixRegime === 'elevated' ? 'amber' : 'gray') as 'green' | 'red' | 'amber' | 'gray';
  const cryptoVariant = (crypto?.marketSignal === 'risk-on' ? 'green' : crypto?.marketSignal === 'risk-off' ? 'red' : 'gray') as 'green' | 'red' | 'gray';
  const sectorVariant = (sectors?.rotationRegime === 'risk-on' ? 'green' : sectors?.rotationRegime === 'risk-off' ? 'red' : sectors?.rotationRegime === 'rotation' ? 'amber' : 'gray') as 'green' | 'red' | 'amber' | 'gray';

  const macroLabel   = macro  ? (macro.riskRegime  === 'risk-on' ? '▲ Risk-On' : macro.riskRegime  === 'risk-off' ? '▼ Risk-Off' : '◆ Neutral') : '…';
  const cryptoLabel  = crypto ? (crypto.marketSignal === 'risk-on' ? '▲ Risk-On' : crypto.marketSignal === 'risk-off' ? '▼ Risk-Off' : '◆ Neutral') : '…';
  const sectorLabel  = sectors?.rotationRegime
    ? sectors.rotationRegime.charAt(0).toUpperCase() + sectors.rotationRegime.slice(1).replace('-', ' ')
    : '…';
  const vixLabel     = macro?.vixRegime
    ? macro.vixRegime.charAt(0).toUpperCase() + macro.vixRegime.slice(1)
    : '…';

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Morning Briefing</h1>
          <p className="text-sm text-gray-400 mt-0.5">{now}</p>
        </div>
        <button
          onClick={fetchMarket}
          className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
        >
          ↺ Refresh market data
        </button>
      </div>

      {/* ── Market signal cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MarketSignalCard
          icon="📊"
          title="Macro Regime"
          badge={macroLabel}
          badgeVariant={macroVariant}
          detail={macro
            ? `SPY ${macro.spy.changePct > 0 ? '+' : ''}${macro.spy.changePct.toFixed(2)}% · VIX ${macro.vix.price.toFixed(1)} · Yield spread ${macro.yieldSpread > 0 ? '+' : ''}${macro.yieldSpread.toFixed(0)} bps · ${macro.yieldCurveRegime} curve`
            : undefined}
        />
        <MarketSignalCard
          icon="🌡️"
          title="Volatility"
          badge={`VIX ${vixLabel}`}
          badgeVariant={vixVariant}
          detail={macro
            ? `VIX ${macro.vix.price.toFixed(1)} (${macro.vix.changePct > 0 ? '+' : ''}${macro.vix.changePct.toFixed(2)}%) · Gold ${macro.gold.changePct > 0 ? '+' : ''}${macro.gold.changePct.toFixed(2)}% · USD ${macro.dollar.changePct > 0 ? '+' : ''}${macro.dollar.changePct.toFixed(2)}%`
            : undefined}
        />
        <MarketSignalCard
          icon="🔄"
          title="Sector Rotation"
          badge={sectorLabel}
          badgeVariant={sectorVariant}
          detail={sectors
            ? `Leading: ${sectors.leaders.slice(0, 2).join(', ')} · Lagging: ${sectors.laggards.slice(0, 2).join(', ')}`
            : undefined}
        />
        <MarketSignalCard
          icon="₿"
          title="Crypto Signal"
          badge={cryptoLabel}
          badgeVariant={cryptoVariant}
          detail={crypto
            ? `F&G ${crypto.fearGreed.value} (${crypto.fearGreed.label}) · BTC dom ${crypto.btcDominance?.toFixed(1) ?? '—'}% · ${crypto.tickers.find(t => t.symbol === 'BTC')?.trendLabel ?? '…'}`
            : undefined}
        />
      </div>

      {/* ── Market stat tiles ── */}
      {macro ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatTile label="SPY" value={`$${macro.spy.price.toFixed(2)}`} sub={`${macro.spy.changePct > 0 ? '+' : ''}${macro.spy.changePct.toFixed(2)}%`} accent={macro.spy.changePct >= 0 ? 'border-green-200' : 'border-red-200'} />
          <StatTile label="VIX" value={macro.vix.price.toFixed(1)} sub={`${macro.vix.changePct > 0 ? '+' : ''}${macro.vix.changePct.toFixed(2)}%`} accent={macro.vix.price > 25 ? 'border-red-200' : 'border-gray-200'} />
          <StatTile label="10Y Yield" value={`${macro.t10y.price.toFixed(3)}%`} sub={`${macro.t10y.changePct > 0 ? '+' : ''}${macro.t10y.changePct.toFixed(2)}%`} />
          <StatTile label="Gold" value={`$${macro.gold.price.toFixed(0)}`} sub={`${macro.gold.changePct > 0 ? '+' : ''}${macro.gold.changePct.toFixed(2)}%`} accent={macro.gold.changePct >= 0 ? 'border-yellow-200' : 'border-gray-200'} />
          <StatTile label="Oil (WTI)" value={`$${macro.oil.price.toFixed(2)}`} sub={`${macro.oil.changePct > 0 ? '+' : ''}${macro.oil.changePct.toFixed(2)}%`} />
          <StatTile label="USD Index" value={macro.dollar.price.toFixed(2)} sub={`${macro.dollar.changePct > 0 ? '+' : ''}${macro.dollar.changePct.toFixed(2)}%`} />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {['SPY', 'VIX', '10Y Yield', 'Gold', 'Oil (WTI)', 'USD Index'].map(label => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
              <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{label}</p>
              <Skeleton className="h-7 w-20 mb-1" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      )}

      {/* ── Quick navigation ── */}
      <div>
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Quick Access</p>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          <QuickNav href="/stocks"    emoji="🔍" label="Stock Scanner" />
          <QuickNav href="/scanner"   emoji="⚙️" label="Options Screener" />
          <QuickNav href="/trades"    emoji="📋" label="Trades" />
          <QuickNav href="/market"    emoji="📈" label="Market" />
          <QuickNav href="/options"   emoji="🎯" label="Options" />
          <QuickNav href="/news"      emoji="📰" label="News" />
          <QuickNav href="/crypto"    emoji="₿"  label="Crypto" />
          <QuickNav href="/watchlist" emoji="⭐" label="Watchlist" />
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-gray-200 pt-2">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Trade Analytics</p>
      </div>

      {/* ── Existing trade analytics ── */}
      <TradeAnalytics />
    </div>
  );
}
