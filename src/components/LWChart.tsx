'use client';

import React, { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type UTCTimestamp,
  type Time,
} from 'lightweight-charts';

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface LWChartProps {
  candles: Candle[];
  /** EMA-20 (blue-500) — daily use */
  ema20?: number[];
  /** EMA-50 (orange-500) — daily use */
  ema50?: number[];
  /** EMA-200 (red-500) — daily use */
  ema200?: number[];
  /** EMA-9  (sky-400)    — intraday use */
  ema9?: number[];
  /** EMA-21 (purple-400) — intraday use */
  ema21?: number[];
  height?: number;
  showVolume?: boolean;
}

/* ── theme helpers ─────────────────────────────────────────────── */
function isDark() {
  return typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');
}

function theme(dark: boolean) {
  return dark
    ? { bg: '#18181b', text: '#a1a1aa', grid: '#27272a', border: '#3f3f46', cross: '#71717a' }
    : { bg: '#ffffff',  text: '#374151', grid: '#f3f4f6', border: '#e5e7eb', cross: '#9ca3af' };
}

/* ── time conversion ────────────────────────────────────────────── */
function toTime(date: string): Time {
  if (date.length > 10) {
    return Math.floor(new Date(date).getTime() / 1000) as UTCTimestamp;
  }
  return date.slice(0, 10) as Time;
}

/* ── component ──────────────────────────────────────────────────── */
export default function LWChart({
  candles,
  ema20,
  ema50,
  ema200,
  ema9,
  ema21,
  height = 320,
  showVolume = true,
}: LWChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const dark = isDark();
    const t = theme(dark);
    const intraday = candles.length > 0 && candles[0].date.length > 10;

    const chart: IChartApi = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: t.bg },
        textColor: t.text,
      },
      grid: {
        vertLines: { color: t.grid },
        horzLines: { color: t.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: t.cross, labelBackgroundColor: t.bg },
        horzLine: { color: t.cross, labelBackgroundColor: t.bg },
      },
      rightPriceScale: { borderColor: t.border },
      timeScale: {
        borderColor: t.border,
        timeVisible: intraday,
        secondsVisible: false,
      },
    });

    /* ── Candlestick series ───────────────────────────────────── */
    const candleSeries = chart.addCandlestickSeries({
      upColor:        '#22c55e',
      downColor:      '#ef4444',
      borderUpColor:  '#22c55e',
      borderDownColor:'#ef4444',
      wickUpColor:    '#22c55e',
      wickDownColor:  '#ef4444',
    });
    candleSeries.setData(
      candles.map(c => ({
        time:  toTime(c.date),
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
      })),
    );

    /* ── EMA overlays ─────────────────────────────────────────── */
    const addEMA = (values: number[] | undefined, color: string) => {
      if (!values || values.length === 0) return;
      const offset = candles.length - values.length;
      const series = chart.addLineSeries({
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      series.setData(
        values
          .map((v, i) => {
            const candle = candles[offset + i];
            return candle ? { time: toTime(candle.date), value: v } : null;
          })
          .filter(Boolean) as { time: Time; value: number }[],
      );
    };

    addEMA(ema9,   '#38bdf8'); // sky-400
    addEMA(ema21,  '#c084fc'); // purple-400
    addEMA(ema20,  '#3b82f6'); // blue-500
    addEMA(ema50,  '#f97316'); // orange-500
    addEMA(ema200, '#ef4444'); // red-500

    /* ── Volume histogram (separate price scale) ──────────────── */
    if (showVolume) {
      const volSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
        borderVisible: false,
      });
      volSeries.setData(
        candles.map(c => ({
          time:  toTime(c.date),
          value: c.volume,
          color: c.close >= c.open ? '#22c55e33' : '#ef444433',
        })),
      );
    }

    chart.timeScale().fitContent();

    /* ── Responsive width ─────────────────────────────────────── */
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) chart.applyOptions({ width: w });
    });
    ro.observe(containerRef.current);

    /* ── Dark-mode watcher ────────────────────────────────────── */
    const mo = new MutationObserver(() => {
      const d = isDark();
      const th = theme(d);
      chart.applyOptions({
        layout: { background: { type: ColorType.Solid, color: th.bg }, textColor: th.text },
        grid:   { vertLines: { color: th.grid }, horzLines: { color: th.grid } },
        rightPriceScale: { borderColor: th.border },
        timeScale:       { borderColor: th.border },
        crosshair: {
          vertLine: { color: th.cross, labelBackgroundColor: th.bg },
          horzLine: { color: th.cross, labelBackgroundColor: th.bg },
        },
      });
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      ro.disconnect();
      mo.disconnect();
      chart.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, ema9, ema21, ema20, ema50, ema200, height, showVolume]);

  /* ── Loading state ──────────────────────────────────────────── */
  if (candles.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-white dark:bg-zinc-900"
      >
        <span className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
