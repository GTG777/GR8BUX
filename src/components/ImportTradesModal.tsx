/**
 * ImportTradesModal
 *
 * 3-step modal for importing Schwab/ThinkorSwim CSV exports:
 *   Step 1 — Upload: drag-and-drop or file picker → shows filename + Next button
 *   Step 2 — Preview: paginated trade table with skipped rows toggle
 *   Step 3 — Result: import summary
 */

import React, { useState, useRef, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { parseSchwabCSV } from '@/lib/importParsers/schwab';
import type { ParseResult } from '@/lib/importParsers/schwab';

interface ImportTradesModalProps {
  onClose: () => void;
  onImported: () => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'result';

interface ImportResult {
  imported: number;
  duplicate: number;
  failed: number;
  errors: string[];
}

const PREVIEW_LIMIT = 20;

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
  const [fileName, setFileName] = useState('');
  const [previewPage, setPreviewPage] = useState(0);
  const [showClearSection, setShowClearSection] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<{ deleted: number } | null>(null);
  const [clearError, setClearError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Parse CSV in browser — stay on upload step, show filename ────────────

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
        setFileName(file.name);
        setPreviewPage(0);
        // Stay on upload step — user clicks Next to proceed
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

  const handleReset = () => {
    setStep('upload');
    setParseResult(null);
    setImportResult(null);
    setParseError('');
    setImportError('');
    setShowSkipped(false);
    setFileName('');
    setPreviewPage(0);
    setShowClearSection(false);
    setClearConfirm(false);
    setClearResult(null);
    setClearError('');
  };

  // ── Clear all trades ──────────────────────────────────────────────────────

  const handleClearAll = async () => {
    if (!clearConfirm) return;
    setClearing(true);
    setClearError('');
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Database not configured');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch('/api/trades/delete-all', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      setClearResult(json.data);
      setClearConfirm(false);
      onImported(); // refresh trade list in background
    } catch (err) {
      setClearError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setClearing(false);
    }
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

  const totalPreviewPages = parseResult ? Math.ceil(parseResult.trades.length / PREVIEW_LIMIT) : 0;
  const pagedTrades = parseResult
    ? parseResult.trades.slice(previewPage * PREVIEW_LIMIT, (previewPage + 1) * PREVIEW_LIMIT)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal — fixed height so footer is always visible */}
      <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-3xl h-[90vh] flex flex-col">

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
              <span className={`font-medium ${
                step === s || (step === 'importing' && s === 'preview')
                  ? 'text-blue-500'
                  : step === 'result' && s !== 'result'
                  ? 'text-green-500'
                  : 'text-muted-foreground'
              }`}>
                {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
              {i < 2 && <span className="text-muted-foreground">→</span>}
            </React.Fragment>
          ))}
        </div>

        {/* ── STEP 1: Upload ──────────────────────────────────────────────────── */}
        {step === 'upload' && (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-6">
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                    : fileName
                    ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                    : 'border-border hover:border-blue-400 hover:bg-muted/30'
                }`}
              >
                <div className="text-4xl mb-3">{fileName ? '✅' : '📂'}</div>
                <p className="text-sm font-medium text-foreground">
                  {fileName ? 'File ready — click Next to preview' : 'Drag & drop your broker CSV here'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {fileName ? '' : 'or click to browse'}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {/* Filename confirmation */}
              {fileName && parseResult && (
                <div className="flex items-center gap-3 rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 px-4 py-3">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-green-800 dark:text-green-300 truncate">{fileName}</p>
                    <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                      {parseResult.trades.length} trade{parseResult.trades.length !== 1 ? 's' : ''} found
                      {parseResult.skippedRows.length > 0 && ` · ${parseResult.skippedRows.length} rows skipped`}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReset(); }}
                    className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
                  >
                    Change
                  </button>
                </div>
              )}

              {parseError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  {parseError}
                </div>
              )}

              {/* ── Clear all trades section ── */}
              <div className="rounded-lg border border-red-200 dark:border-red-800/50 overflow-hidden">
                <button
                  onClick={() => { setShowClearSection(v => !v); setClearResult(null); setClearError(''); setClearConfirm(false); }}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear all existing trades first
                  </span>
                  <span className="text-xs">{showClearSection ? '▲' : '▼'}</span>
                </button>

                {showClearSection && (
                  <div className="px-4 py-4 space-y-3 bg-background">
                    {clearResult ? (
                      <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {clearResult.deleted} trade{clearResult.deleted !== 1 ? 's' : ''} deleted. You can now upload your CSV to re-import cleanly.
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          This will permanently delete <strong className="text-foreground">all of your trades</strong> from the database. Use this before re-importing to fix incorrectly parsed trades.
                        </p>
                        {clearError && (
                          <p className="text-xs text-red-600 dark:text-red-400">{clearError}</p>
                        )}
                        <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={clearConfirm}
                            onChange={(e) => setClearConfirm(e.target.checked)}
                            className="w-3.5 h-3.5 accent-red-600"
                          />
                          <span className="text-foreground">I understand this cannot be undone</span>
                        </label>
                        <button
                          onClick={handleClearAll}
                          disabled={!clearConfirm || clearing}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                        >
                          {clearing ? (
                            <><div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Deleting…</>
                          ) : (
                            '🗑 Delete all trades'
                          )}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

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

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-card">
              <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              {fileName && parseResult && parseResult.trades.length > 0 && (
                <button
                  onClick={() => setStep('preview')}
                  className="px-5 py-2 bg-gradient-brand text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity flex items-center gap-2"
                >
                  Next — Preview {parseResult.trades.length} trade{parseResult.trades.length !== 1 ? 's' : ''}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          </>
        )}

        {/* ── STEP 2: Preview — self-contained scroll + pagination ─────────────── */}
        {(step === 'preview' || step === 'importing') && parseResult && (
          <>
            {/* Summary bar */}
            <div className="flex flex-wrap gap-3 items-center px-6 py-3 border-b border-border shrink-0 text-sm">
              <span className="bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 px-3 py-1 rounded-full font-medium text-xs">
                ✓ {parseResult.trades.length} trades to import
              </span>
              {parseResult.skippedRows.length > 0 && (
                <button
                  onClick={() => setShowSkipped((v) => !v)}
                  className="bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-3 py-1 rounded-full font-medium text-xs hover:opacity-80"
                >
                  ⚠ {parseResult.skippedRows.length} rows skipped {showSkipped ? '▲' : '▼'}
                </button>
              )}
              <span className="text-muted-foreground text-xs ml-auto">
                {parseResult.totalRows} total rows in file
              </span>
            </div>

            {/* Skipped rows panel (collapsible, fixed height) */}
            {showSkipped && parseResult.skippedRows.length > 0 && (
              <div className="border-b border-border shrink-0 max-h-32 overflow-y-auto">
                {parseResult.skippedRows.map((s, i) => (
                  <div key={i} className="px-6 py-1.5 flex gap-3 text-xs border-b border-border/50 last:border-0">
                    <span className="text-amber-600 shrink-0">Row {s.row > 0 ? s.row : '—'}</span>
                    <span className="text-muted-foreground">{s.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {importError && (
              <div className="px-6 py-3 shrink-0">
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  {importError}
                </div>
              </div>
            )}

            {/* Table — flex-1, scrolls independently */}
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead className="bg-muted/60 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold text-foreground/80 border-b border-border">Symbol</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-foreground/80 border-b border-border">Type</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-foreground/80 border-b border-border">Entry Date</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-foreground/80 border-b border-border">Exit Date</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-foreground/80 border-b border-border">Qty</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-foreground/80 border-b border-border">Entry $</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-foreground/80 border-b border-border">Exit $</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-foreground/80 border-b border-border">P&amp;L</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-foreground/80 border-b border-border">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagedTrades.map((t, i) => (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-bold text-foreground">{t.symbol}</td>
                      <td className="px-3 py-2 text-muted-foreground capitalize">{t.type}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{t.entryDate.slice(0, 10)}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{t.exitDate?.slice(0, 10) ?? '—'}</td>
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
                      <td className={`px-3 py-2 text-right font-medium ${pnlColor(t.pnl)}`}>{fmtPnl(t.pnl)}</td>
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

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-border shrink-0 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Showing {previewPage * PREVIEW_LIMIT + 1}–{Math.min((previewPage + 1) * PREVIEW_LIMIT, parseResult.trades.length)} of {parseResult.trades.length} trades
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                  disabled={previewPage === 0}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <span className="text-xs text-muted-foreground">
                  Page {previewPage + 1} / {totalPreviewPages}
                </span>
                <button
                  onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages - 1, p + 1))}
                  disabled={previewPage >= totalPreviewPages - 1}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-card">
              <button
                onClick={() => { setStep('upload'); setImportError(''); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                ← Back
              </button>
              <button
                onClick={handleImport}
                disabled={step === 'importing'}
                className="px-5 py-2 bg-gradient-brand text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2"
              >
                {step === 'importing' ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Importing…
                  </>
                ) : (
                  `Import ${parseResult.trades.length} trade${parseResult.trades.length !== 1 ? 's' : ''}`
                )}
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: Result ──────────────────────────────────────────────────── */}
        {step === 'result' && importResult && (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-6">
              <div className="text-center py-4">
                <div className="text-5xl mb-4">{importResult.failed === 0 ? '✅' : '⚠️'}</div>
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

            <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-card">
              <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Close
              </button>
              <button onClick={handleReset} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                Import another file
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
