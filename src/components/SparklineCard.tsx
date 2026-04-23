import React, { useEffect, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

interface SparklineCardProps {
  symbol: string;
  title: string;
}

interface QuoteSummary {
  price: number;
  changePct: number;
  isUp: boolean;
}

export default function SparklineCard({ symbol, title }: SparklineCardProps) {
  const [quote, setQuote] = useState<QuoteSummary | null>(null);
  const [sparkData, setSparkData] = useState<{ v: number }[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [quoteRes, candlesRes] = await Promise.all([
          fetch(`/api/market/quote?symbol=${encodeURIComponent(symbol)}`),
          fetch(`/api/market/candles?symbol=${encodeURIComponent(symbol)}&range=compact`),
        ]);

        if (!cancelled && quoteRes.ok) {
          const d = await quoteRes.json();
          const price: number = d.price ?? 0;
          const changePct: number = parseFloat((d.changePercent ?? '0').toString().replace('%', ''));
          setQuote({ price, changePct, isUp: changePct >= 0 });
        }

        if (!cancelled && candlesRes.ok) {
          const cd = await candlesRes.json();
          // Use last 20 closes for a compact sparkline
          const closes: number[] = (cd.candles ?? [])
            .slice(-20)
            .map((c: { close: number }) => c.close);
          setSparkData(closes.map((v) => ({ v })));
        }
      } catch {
        // silently fail
      }
    }

    load();
    return () => { cancelled = true; };
  }, [symbol]);

  const color = quote?.isUp !== false ? '#22c55e' : '#ef4444';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-0.5">
            {title}
          </p>
          <p className="text-xs font-bold text-gray-500 dark:text-zinc-400">{symbol}</p>
        </div>
        {quote ? (
          <div className="text-right">
            <p className="text-base font-bold text-gray-900 dark:text-white tabular-nums leading-none">
              {quote.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p
              className={`text-xs font-semibold tabular-nums mt-0.5 ${
                quote.isUp ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {quote.changePct >= 0 ? '+' : ''}{quote.changePct.toFixed(2)}%
            </p>
          </div>
        ) : (
          <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {sparkData.length > 0 ? (
        <div style={{ height: 60 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#grad-${symbol})`}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              <Tooltip
                content={() => null}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[60px] rounded bg-gray-100 dark:bg-zinc-800 animate-pulse" />
      )}
    </div>
  );
}
