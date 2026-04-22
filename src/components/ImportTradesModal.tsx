/**
 * ImportTradesModal
 *
 * 3-step modal for importing Schwab/ThinkorSwim CSV exports:
 *   Step 1 — Upload: drag-and-drop or file picker
 *   Step 2 — Preview: parsed trade table with skip reasons
 *   Step 3 — Result: import summary
 */

import React, { useState, useRef, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { parseSchwabCSV } from '@/lib/importParsers/schwab';
import type { ParsedTrade, ParseResult } from '@/lib/importParsers/schwab';

interface ImportTradesModalProps {
  onClose: () => void;
  onImported: () => void; // called after successful import to refresh trade list
}

type Step = 'upload' | 'preview' | 'importing' | 'result';

interface ImportResult {
  imported: number;
  duplicate: number;
  failed: number;
  errors: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPnl(pnl?: number) {
  if (pnl == null) return '—';
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}$${Math.abs(pnl).toFixed(2)}`;
}

function pnlColor(pnl?: number) {
  if (pnl == null) return 'text-muted-foreground';
  return pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportTradesModal({ onClose, onImported }: ImportTradesModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState('');
  const [importError, setImportError] = useState('');
  const [showSkipped, setShowSkipped] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Parse CSV in browser ──────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    setParseError('');
    if (!file.name.endsWith('.csv')) {
      setParseError('Please upload a .csv file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const result = parseSchwabCSV(text);
        if (result.trades.length === 0 && result.skippedRows.length === 0) {
          setParseError('No trades found. Make sure this is a supported broker CSV (Schwab, ThinkorSwim).');
          return;
        }
        setParseResult(result);
        setStep('preview');
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse CSV');
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // ── Import ────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!parseResult) return;
    setStep('importing');
    setImportError('');

    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Database not configured');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/import/schwab-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trades: parseResult.trades }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');

      setImportResult(json.data);
      setStep('result');
      if (json.data.imported > 0) onImported();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-3xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-bold text-foreground">Import Trades</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload your broker&apos;s transaction history CSV
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border shrink-0 text-xs">
          {(['upload', 'preview', 'result'] as const).map((s, i) => (
            <React.Fragment key={s}>
              <span className={`font-medium ${step === s || (step === 'importing' && s === 'preview') ? 'text-blue-500' : step === 'result' && s !== 'result' ? 'text-green-500' : 'text-muted-foreground'}`}>
                {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
              {i < 2 && <span className="text-muted-foreground">→</span>}
            </React.Fragment>
          ))}
        </div>

        {/* Body — min-h-0 is required so flexbox allows this item to shrink
             below its content height, enabling overflow-y-auto to activate */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6">

          {/* ── Step 1: Upload ────────────────────────────────────────────── */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                    : 'border-border hover:border-blue-400 hover:bg-muted/30'
                }`}
              >
                <div className="text-4xl mb-3">📂</div>
                <p className="text-sm font-medium text-foreground">Drag &amp; drop your broker CSV here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {parseError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  {parseError}
                </div>
              )}

              <div className="rounded-lg bg-muted/50 border border-border p-4 text-xs text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">Supported brokers</p>
                <p>Schwab &amp; ThinkorSwim CSV exports are fully supported.</p>
                <details className="group">
                  <summary className="cursor-pointer text-blue-500 hover:text-blue-400 list-none flex items-center gap-1">
                    <span className="group-open:hidden">▶</span>
                    <span className="hidden group-open:inline">▼</span>
                    How to export from Schwab
                  </summary>
                  <div className="mt-2 space-y-1 pl-3 border-l border-border">
                    <p>1. Log in to schwab.com → <strong>Accounts</strong> → select your account</p>
                    <p>2. Click <strong>History</strong> → set your date range → <strong>Export</strong></p>
                    <p>3. Choose <strong>CSV</strong> format and download</p>
                  </div>
                </details>
              </div>
            </div>
          )}

          {/* ── Step 2: Preview ───────────────────────────────────────────── */}
          {(step === 'preview' || step === 'importing') && parseResult && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 px-3 py-1 rounded-full font-medium">
                  ✓ {parseResult.trades.length} trades to import
                </span>
                {parseResult.skippedRows.length > 0 && (
                  <span className="bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full font-medium">
                    ⚠ {parseResult.skippedRows.length} rows skipped
                  </span>
                )}
                <span className="text-muted-foreground self-center text-xs">
                  ({parseResult.totalRows} total rows in file)
                </span>
              </div>

              {importError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  {importError}
                </div>
              )}

              {/* Trade preview table */}
              {parseResult.trades.length > 0 && (
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[640px]">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Symbol</th>
                          <th className="px-3 py-2 text-left">Type</th>
                          <th className="px-3 py-2 text-left">Entry</th>
                          <th className="px-3 py-2 text-left">Exit</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Entry $</th>
                          <th className="px-3 py-2 text-right">Exit $</th>
                          <th className="px-3 py-2 text-right">P&L</th>
                          <th className="px-3 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {parseResult.trades.map((t, i) => (
                          <tr key={i} className="hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2 font-bold text-foreground">{t.symbol}</td>
                            <td className="px-3 py-2 text-muted-foreground capitalize">{t.type}</td>
                            <td className="px-3 py-2 text-muted-foreground">{t.entryDate.slice(0, 10)}</td>
                            <td className="px-3 py-2 text-muted-foreground">{t.exitDate?.slice(0, 10) ?? '—'}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {t.type === 'stock' ? t.stockData?.quantity : t.optionData?.legs[0]?.quantity}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              ${t.type === 'stock' ? t.stockData?.entryPrice?.toFixed(2) : t.optionData?.legs[0]?.entryPrice?.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {t.type === 'stock' && t.stockData?.exitPrice
                                ? `$${t.stockData.exitPrice.toFixed(2)}`
                                : t.type === 'option' && t.optionData?.legs[0]?.exitPrice
                                ? `$${t.optionData.legs[0].exitPrice.toFixed(2)}`
                                : '—'}
                            </td>
                            <td className={`px-3 py-2 text-right font-medium ${pnlColor(t.pnl)}`}>
                              {fmtPnl(t.pnl)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                t.status === 'closed'
                                  ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400'
                                  : 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
                              }`}>
                                {t.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Skipped rows (collapsible) */}
              {parseResult.skippedRows.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowSkipped((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    {showSkipped ? '▼' : '▶'} {showSkipped ? 'Hide' : 'Show'} skipped rows ({parseResult.skippedRows.length})
                  </button>
                  {showSkipped && (
                    <div className="mt-2 rounded-lg border border-border divide-y divide-border text-xs max-h-40 overflow-y-auto">
                      {parseResult.skippedRows.map((s, i) => (
                        <div key={i} className="px-3 py-2 flex gap-3">
                          <span className="text-amber-600 shrink-0">Row {s.row > 0 ? s.row : '—'}</span>
                          <span className="text-muted-foreground">{s.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Step: Importing (spinner) ──────────────────────────────────── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-500 animate-spin" />
              <p className="text-sm text-muted-foreground">Importing trades…</p>
            </div>
          )}

          {/* ── Step 3: Result ────────────────────────────────────────────── */}
          {step === 'result' && importResult && (
            <div className="space-y-6">
              <div className="text-center py-4">
                <div className="text-5xl mb-4">
                  {importResult.failed === 0 ? '✅' : '⚠️'}
                </div>
                <h3 className="text-xl font-bold text-foreground mb-1">Import complete</h3>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{importResult.imported}</p>
                  <p className="text-xs text-muted-foreground mt-1">Imported</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{importResult.duplicate}</p>
                  <p className="text-xs text-muted-foreground mt-1">Duplicates skipped</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <p className={`text-2xl font-bold ${importResult.failed > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {importResult.failed}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Failed</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-400 space-y-1 max-h-32 overflow-y-auto">
                  {importResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}

              {importResult.imported > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  Closed trades are being embedded for the Trade Coach in the background.
                  Visit <strong>Trade Coach → Sync trade history</strong> if you want to re-sync.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-card">
          <button
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {step === 'result' ? 'Close' : 'Cancel'}
          </button>

          {step === 'preview' && parseResult && parseResult.trades.length > 0 && (
            <button
              onClick={handleImport}
              className="px-5 py-2 bg-gradient-brand text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Import {parseResult.trades.length} trade{parseResult.trades.length !== 1 ? 's' : ''}
            </button>
          )}

          {step === 'result' && (
            <button
              onClick={() => {
                setStep('upload');
                setParseResult(null);
                setImportResult(null);
                setParseError('');
                setImportError('');
                setShowSkipped(false);
              }}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Import another file
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
