/**
 * /api/cron/refresh-ai-analyses
 *
 * Reads fresh market_data from Supabase, runs all 5 AI agents per symbol,
 * and upserts results into the `ai_analyses` table.
 *
 * Called by Netlify cron every 30 minutes (market hours only).
 * Also callable manually: POST with X-Cron-Secret header.
 * Optional body: { symbols: ['NVDA', 'AAPL'] } to refresh specific symbols only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseServiceRoleClient } from '@/lib/supabase';
import { getAIOrchestrator, resetOrchestratorInstance, FullSetupData } from '@/lib/agents/orchestrator';

const CRON_SECRET = process.env.CRON_SECRET;
// How old (minutes) an ai_analysis can be before we re-run it
const STALE_THRESHOLD_MINUTES = 25;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (CRON_SECRET) {
    const provided = req.headers['x-cron-secret'] ?? req.query.secret;
    if (provided !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase service role not configured' });
  }

  // Optional: refresh only specific symbols
  const requestedSymbols: string[] | undefined =
    req.body?.symbols?.map((s: string) => s.toUpperCase()) ?? undefined;

  // 1. Fetch market data from Supabase (fresh rows only — hv20 required to run greeks)
  let query = supabase
    .from('market_data')
    .select('*')
    .eq('fetch_error', false)
    .not('price', 'is', null)
    .not('hv20', 'is', null);

  if (requestedSymbols?.length) {
    query = query.in('symbol', requestedSymbols);
  }

  const { data: marketRows, error: fetchError } = await query;

  if (fetchError) {
    return res.status(500).json({ error: `Failed to fetch market_data: ${fetchError.message}` });
  }

  if (!marketRows || marketRows.length === 0) {
    return res.status(200).json({ message: 'No market data available — run refresh-market-data first', ok: 0, skipped: 0 });
  }

  // 2. Find which symbols have stale (or missing) ai_analyses
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000).toISOString();
  const { data: existingAnalyses } = await supabase
    .from('ai_analyses')
    .select('symbol, refreshed_at')
    .in('symbol', marketRows.map((r: any) => r.symbol));

  const freshSymbols = new Set(
    (existingAnalyses ?? [])
      .filter((a: any) => a.refreshed_at > staleThreshold)
      .map((a: any) => a.symbol)
  );

  const symbolsToRefresh = marketRows.filter((r: any) => !freshSymbols.has(r.symbol));

  if (symbolsToRefresh.length === 0) {
    return res.status(200).json({ message: 'All analyses are fresh', ok: 0, skipped: marketRows.length });
  }

  const results: { symbol: string; status: 'ok' | 'error' | 'skipped'; error?: string }[] = [];

  for (const row of symbolsToRefresh) {
    try {
      // Build FullSetupData from stored market row
      const setupData: FullSetupData = {
        symbol: row.symbol,
        setupType: 'LEAPS_CANDIDATE',
        currentPrice: row.price,
        detectedAt: new Date().toISOString(),
        hv20: row.hv20,
        rsi: row.rsi ?? undefined,
        ivRank: row.ivr ?? undefined,
        delta: row.best_delta ?? undefined,
        premium: row.best_premium ?? undefined,
        support: row.price ? row.price * 0.95 : undefined,
        resistance: row.price ? row.price * 1.05 : undefined,
        sector: row.sector,
      };

      // Determine agents to run
      const agents: string[] = ['technical', 'sentiment', 'strategy'];
      if (row.ivr != null && row.hv20 != null) agents.push('greeks', 'risk');

      // Reset singleton to avoid stale config bleed between symbols
      resetOrchestratorInstance();
      const orchestrator = getAIOrchestrator({ agents: agents as any });
      const analysis = await orchestrator.analyzeSetup(setupData, agents);

      await supabase.from('ai_analyses').upsert({
        symbol: row.symbol,
        setup_type: 'LEAPS_CANDIDATE',
        result: analysis,
        model: 'claude-sonnet-4-5',
        agents_ran: agents,
        consensus: analysis.consensusRecommendation.action,
        confidence: analysis.consensusRecommendation.confidence,
        refreshed_at: new Date().toISOString(),
      }, { onConflict: 'symbol,setup_type' });

      console.log(`[refresh-ai-analyses] ${row.symbol} → ${analysis.consensusRecommendation.action}`);
      results.push({ symbol: row.symbol, status: 'ok' });
    } catch (err: any) {
      console.error(`[refresh-ai-analyses] ${row.symbol} failed:`, err.message);
      results.push({ symbol: row.symbol, status: 'error', error: err.message });
    }

    // Delay between symbols to avoid rate-limiting Claude
    await new Promise((r) => setTimeout(r, 1000));
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  const failed = results.filter((r) => r.status === 'error').length;
  const skipped = freshSymbols.size;

  console.log(`[refresh-ai-analyses] Done: ${ok} ok, ${failed} failed, ${skipped} skipped (fresh)`);
  return res.status(200).json({ ok, failed, skipped, results });
}
