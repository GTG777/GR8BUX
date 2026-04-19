import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { useRouter } from 'next/router';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/Skeleton';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SymbolData {
  tsi: number | null;
  price: number | null;
  change: number | null;
  changePercent: string | null;
  isCoiling: boolean | null;
  coilingStrength: number | null;
  sparkline: { v: number }[];
  volumeRatio: number | null;
  marketOpen: boolean;
  loading: boolean;
  error: string | null;
}

interface WatchlistDef {
  id: string;
  name: string;
  symbols: string[];
}

const emptySymbol = (): SymbolData => ({
  tsi: null, price: null, change: null, changePercent: null,
  isCoiling: null, coilingStrength: null, sparkline: [],
  volumeRatio: null, marketOpen: true, loading: true, error: null,
});

// ── Local-storage fallback (guests / unauthenticated) ─────────────────────────

const LOCAL_KEY = 'gr8bux_watchlists_v2';

function localLoad(): WatchlistDef[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WatchlistDef[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  // Migrate very old single-list key
  try {
    const old = localStorage.getItem('advancedWatchlist');
    if (old) {
      const syms = JSON.parse(old) as string[];
      if (Array.isArray(syms) && syms.length > 0)
        return [{ id: crypto.randomUUID(), name: 'My Watchlist', symbols: syms }];
    }
  } catch { /* ignore */ }
  return [{ id: crypto.randomUUID(), name: 'My Watchlist', symbols: ['AAPL', 'MSFT', 'GOOGL'] }];
}

function localSave(lists: WatchlistDef[]) {
  if (typeof window !== 'undefined') localStorage.setItem(LOCAL_KEY, JSON.stringify(lists));
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function dbLoad(userId: string): Promise<WatchlistDef[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from('watchlists')
    .select('id, name, symbols')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) { console.error('[watchlist] load error', error); return []; }
  return (data ?? []) as WatchlistDef[];
}

async function dbCreate(userId: string, name: string): Promise<WatchlistDef | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from('watchlists')
    .insert({ user_id: userId, name, symbols: [] })
    .select('id, name, symbols')
    .single();
  if (error) { console.error('[watchlist] create error', error); return null; }
  return data as WatchlistDef;
}

async function dbUpdate(id: string, patch: Partial<Pick<WatchlistDef, 'name' | 'symbols'>>) {
  const sb = getSupabaseClient();
  if (!sb) return;
  const { error } = await sb.from('watchlists').update(patch).eq('id', id);
  if (error) console.error('[watchlist] update error', error);
}

async function dbDelete(id: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  const { error } = await sb.from('watchlists').delete().eq('id', id);
  if (error) console.error('[watchlist] delete error', error);
}

// ── SortCol type ──────────────────────────────────────────────────────────────

type SortCol = keyof SymbolData | 'symbol';

// ── Th helper ─────────────────────────────────────────────────────────────────

function Th({
  listId, col, label, align, sortState, onSort,
}: {
  listId: string; col: SortCol; label: string; align: 'left' | 'right' | 'center';
  sortState: Record<string, { col: SortCol; dir: 'asc' | 'desc' }>;
  onSort: (listId: string, col: SortCol) => void;
}) {
  const sort = sortState[listId];
  const icon = sort?.col === col ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ' ⇅';
  return (
    <th
      className={`px-4 py-3 text-${align} text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-700/40 transition-colors`}
      onClick={() => onSort(listId, col)}
    >
      {label}<span className="opacity-60 text-[10px]">{icon}</span>
    </th>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const WatchlistPage: React.FC = () => {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  const [watchlists, setWatchlists] = useState<WatchlistDef[]>([]);
  const watchlistsRef = useRef<WatchlistDef[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const expandedRef = useRef<Set<string>>(new Set());
  const [symbolData, setSymbolData] = useState<Record<string, SymbolData>>({});
  const symbolDataRef = useRef<Record<string, SymbolData>>({});

  const [addInputs, setAddInputs] = useState<Record<string, string>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newListName, setNewListName] = useState('');
  const [showNewListInput, setShowNewListInput] = useState(false);
  const [sortState, setSortState] = useState<Record<string, { col: SortCol; dir: 'asc' | 'desc' }>>({});

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync with state so interval always sees latest values
  const setWatchlistsSynced = useCallback((lists: WatchlistDef[]) => {
    watchlistsRef.current = lists;
    setWatchlists(lists);
  }, []);

  const setExpandedSynced = useCallback((next: Set<string>) => {
    expandedRef.current = next;
    setExpanded(next);
  }, []);

  // ── Symbol data helpers ────────────────────────────────────────────────────

  const updateSymbolData = useCallback((symbol: string, patch: Partial<SymbolData>) => {
    setSymbolData(prev => {
      const next = { ...prev, [symbol]: { ...(prev[symbol] ?? emptySymbol()), ...patch } };
      symbolDataRef.current = next;
      return next;
    });
  }, []);

  const fetchSymbol = useCallback(async (symbol: string) => {
    updateSymbolData(symbol, { loading: true, error: null });
    try {
      const [quoteRes, candleRes] = await Promise.all([
        fetch(`/api/market/quote?symbol=${encodeURIComponent(symbol)}`),
        fetch(`/api/market/candles?symbol=${encodeURIComponent(symbol)}&range=compact`),
      ]);
      if (!quoteRes.ok) throw new Error('Failed to fetch quote');
      if (!candleRes.ok) throw new Error('Failed to fetch candles');
      const [quoteData, candleData] = await Promise.all([quoteRes.json(), candleRes.json()]);

      const recentCandles: { close: number; volume: number }[] = candleData.candles.slice(-20);
      const sparkline = recentCandles.map(c => ({ v: c.close }));
      const vols = recentCandles.map(c => c.volume);
      const avgVol = vols.length > 1 ? vols.slice(0, -1).reduce((a, b) => a + b, 0) / (vols.length - 1) : 0;
      const volumeRatio = avgVol > 0 ? (vols[vols.length - 1] ?? 0) / avgVol : null;

      const closes = candleData.candles.map((c: { close: number }) => c.close);
      const [tsiRes, coilingRes] = await Promise.all([
        fetch('/api/technical/tsi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ closes }) }),
        fetch('/api/technical/coiling', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candles: candleData.candles }) }),
      ]);
      const tsiData = tsiRes.ok ? await tsiRes.json() : { tsi: null };
      const coilingData = coilingRes.ok ? await coilingRes.json() : { isCoiling: null };

      updateSymbolData(symbol, {
        price: quoteData.price, change: quoteData.change, changePercent: quoteData.changePercent,
        marketOpen: quoteData.marketOpen ?? true,
        tsi: tsiData.tsi, isCoiling: coilingData.isCoiling,
        coilingStrength: coilingData.strength ?? null, sparkline, volumeRatio,
        loading: false, error: null,
      });
    } catch (err) {
      updateSymbolData(symbol, { loading: false, error: err instanceof Error ? err.message : 'Error' });
    }
  }, [updateSymbolData]);

  const fetchForLists = useCallback((lists: WatchlistDef[], expandedIds: Set<string>) => {
    const seen = new Set<string>();
    for (const list of lists) {
      if (!expandedIds.has(list.id)) continue;
      for (const sym of list.symbols) {
        if (!seen.has(sym)) { seen.add(sym); fetchSymbol(sym); }
      }
    }
  }, [fetchSymbol]);

  // ── Init: load from DB or localStorage ────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setListsLoading(true);
      let lists: WatchlistDef[];

      if (isAuthenticated && user?.id) {
        lists = await dbLoad(user.id);
        // If brand new user with no DB watchlists, seed one default
        if (lists.length === 0) {
          const created = await dbCreate(user.id, 'My Watchlist');
          lists = created ? [created] : [];
        }
      } else {
        lists = localLoad();
      }

      if (cancelled) return;
      setWatchlistsSynced(lists);
      setListsLoading(false);

      const firstExpanded = new Set<string>(lists.slice(0, 1).map(l => l.id));
      setExpandedSynced(firstExpanded);
      fetchForLists(lists, firstExpanded);
    }

    init();

    // Use refs directly — no nested setState, no risk of refreshing collapsed lists
    refreshTimerRef.current = setInterval(() => {
      fetchForLists(watchlistsRef.current, expandedRef.current);
    }, 60_000);

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  // ── Persist helper ─────────────────────────────────────────────────────────

  const persist = useCallback((lists: WatchlistDef[]) => {
    if (!isAuthenticated) localSave(lists);
    // DB updates happen inline at each mutation
  }, [isAuthenticated]);

  // ── Expand/collapse ────────────────────────────────────────────────────────

  const toggleExpand = (id: string) => {
    const next = new Set(expandedRef.current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      const list = watchlistsRef.current.find(l => l.id === id);
      list?.symbols.forEach(sym => {
        if (!symbolDataRef.current[sym] || symbolDataRef.current[sym].error) fetchSymbol(sym);
      });
    }
    setExpandedSynced(next);
  };

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const createWatchlist = async () => {
    const name = newListName.trim() || `Watchlist ${watchlistsRef.current.length + 1}`;
    let newList: WatchlistDef;

    if (isAuthenticated && user?.id) {
      const created = await dbCreate(user.id, name);
      if (!created) return;
      newList = created;
    } else {
      newList = { id: crypto.randomUUID(), name, symbols: [] };
    }

    const next = [...watchlistsRef.current, newList];
    setWatchlistsSynced(next);
    persist(next);
    setExpandedSynced(new Set([...expandedRef.current, newList.id]));
    setNewListName('');
    setShowNewListInput(false);
  };

  const deleteWatchlist = async (id: string) => {
    if (isAuthenticated) await dbDelete(id);
    const next = watchlistsRef.current.filter(l => l.id !== id);
    setWatchlistsSynced(next);
    persist(next);
    const s = new Set(expandedRef.current); s.delete(id);
    setExpandedSynced(s);
  };

  const startRename = (list: WatchlistDef) => { setRenamingId(list.id); setRenameValue(list.name); };
  const commitRename = async () => {
    if (!renamingId) return;
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    if (isAuthenticated) await dbUpdate(renamingId, { name });
    const next = watchlistsRef.current.map(l => l.id === renamingId ? { ...l, name } : l);
    setWatchlistsSynced(next);
    persist(next);
    setRenamingId(null);
  };

  const addSymbol = async (listId: string) => {
    const sym = (addInputs[listId] ?? '').toUpperCase().trim();
    if (!sym || !/^[A-Z]{1,10}$/.test(sym)) return;
    const list = watchlistsRef.current.find(l => l.id === listId);
    if (!list || list.symbols.includes(sym)) return;
    const symbols = [...list.symbols, sym];
    if (isAuthenticated) await dbUpdate(listId, { symbols });
    const next = watchlistsRef.current.map(l => l.id === listId ? { ...l, symbols } : l);
    setWatchlistsSynced(next);
    persist(next);
    setAddInputs(prev => ({ ...prev, [listId]: '' }));
    fetchSymbol(sym);
  };

  const removeSymbol = async (listId: string, sym: string) => {
    const list = watchlistsRef.current.find(l => l.id === listId);
    if (!list) return;
    const symbols = list.symbols.filter(s => s !== sym);
    if (isAuthenticated) await dbUpdate(listId, { symbols });
    const next = watchlistsRef.current.map(l => l.id === listId ? { ...l, symbols } : l);
    setWatchlistsSynced(next);
    persist(next);
  };

  const refreshList = (listId: string) => {
    watchlistsRef.current.find(l => l.id === listId)?.symbols.forEach(sym => fetchSymbol(sym));
  };

  // ── Sorting ────────────────────────────────────────────────────────────────

  const handleSort = (listId: string, col: SortCol) => {
    setSortState(prev => {
      const cur = prev[listId];
      return { ...prev, [listId]: { col, dir: cur?.col === col ? (cur.dir === 'asc' ? 'desc' : 'asc') : 'asc' } };
    });
  };

  const sortedSymbols = (list: WatchlistDef): string[] => {
    const sort = sortState[list.id];
    if (!sort) return list.symbols;
    return [...list.symbols].sort((a, b) => {
      if (sort.col === 'symbol') return sort.dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
      const av = symbolData[a]?.[sort.col as keyof SymbolData] ?? null;
      const bv = symbolData[b]?.[sort.col as keyof SymbolData] ?? null;
      if (av === null && bv === null) return 0;
      if (av === null) return sort.dir === 'asc' ? 1 : -1;
      if (bv === null) return sort.dir === 'asc' ? -1 : 1;
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else if (typeof av === 'string' && typeof bv === 'string') cmp = av.localeCompare(bv);
      else if (typeof av === 'boolean' && typeof bv === 'boolean') cmp = Number(av) - Number(bv);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout title="Watchlists">
      <div className="space-y-4">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Watchlists</h1>
            {!isAuthenticated && (
              <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700/50 px-2 py-0.5 rounded-full">
                Sign in to save across devices
              </span>
            )}
          </div>
          {!showNewListInput ? (
            <button
              onClick={() => setShowNewListInput(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-green text-white rounded-lg hover:opacity-90 font-medium text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              New Watchlist
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                autoFocus type="text" value={newListName}
                onChange={e => setNewListName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createWatchlist(); if (e.key === 'Escape') { setShowNewListInput(false); setNewListName(''); } }}
                placeholder="Watchlist name…"
                className="px-3 py-2 border border-gray-300 dark:border-zinc-600 rounded-lg text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green"
              />
              <button onClick={createWatchlist} className="px-4 py-2 bg-brand-green text-white rounded-lg text-sm font-medium hover:opacity-90">Create</button>
              <button onClick={() => { setShowNewListInput(false); setNewListName(''); }} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-white">Cancel</button>
            </div>
          )}
        </div>

        {/* Loading state */}
        {listsLoading && (
          <div className="space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        )}

        {/* Accordion watchlists */}
        {!listsLoading && watchlists.map(list => {
          const isOpen = expanded.has(list.id);
          const symbols = sortedSymbols(list);
          const isRenaming = renamingId === list.id;

          return (
            <div key={list.id} className="bg-white dark:bg-zinc-900 rounded-xl shadow border border-gray-200 dark:border-zinc-700/50 overflow-hidden">

              {/* Header */}
              <div
                className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
                onClick={() => !isRenaming && toggleExpand(list.id)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>

                {isRenaming ? (
                  <input
                    autoFocus value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
                    onBlur={commitRename}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 px-2 py-1 border border-brand-green rounded text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:outline-none"
                  />
                ) : (
                  <span
                    className="flex-1 font-semibold text-gray-900 dark:text-white text-base"
                    onDoubleClick={e => { e.stopPropagation(); startRename(list); }}
                    title="Double-click to rename"
                  >
                    {list.name}
                  </span>
                )}

                <span className="text-xs bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-300 px-2 py-0.5 rounded-full font-medium">
                  {list.symbols.length} symbol{list.symbols.length !== 1 ? 's' : ''}
                </span>

                {!isRenaming && (
                  <button onClick={e => { e.stopPropagation(); startRename(list); }} className="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors" title="Rename">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                )}

                <button onClick={e => { e.stopPropagation(); refreshList(list.id); }} className="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors" title="Refresh all">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>

                <button onClick={e => { e.stopPropagation(); if (window.confirm(`Delete "${list.name}"?`)) deleteWatchlist(list.id); }} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/20 transition-colors" title="Delete watchlist">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>

              {/* Body */}
              {isOpen && (
                <div>
                  <div className="flex items-center gap-2 px-5 pb-4">
                    <input
                      type="text" value={addInputs[list.id] ?? ''}
                      onChange={e => setAddInputs(prev => ({ ...prev, [list.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addSymbol(list.id)}
                      placeholder="Add symbol (e.g., AAPL)"
                      maxLength={10}
                      className="flex-1 max-w-xs px-3 py-1.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand-green"
                    />
                    <button onClick={() => addSymbol(list.id)} className="px-4 py-1.5 bg-brand-blue text-white rounded-lg hover:opacity-90 font-medium text-sm">Add</button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-zinc-800/60 border-t border-b border-gray-200 dark:border-zinc-700/50">
                        <tr>
                          <Th listId={list.id} col="symbol" label="Ticker" align="left" sortState={sortState} onSort={handleSort} />
                          <Th listId={list.id} col="price" label="Price" align="right" sortState={sortState} onSort={handleSort} />
                          <Th listId={list.id} col="change" label="Day Change" align="right" sortState={sortState} onSort={handleSort} />
                          <Th listId={list.id} col="tsi" label="TSI" align="center" sortState={sortState} onSort={handleSort} />
                          <Th listId={list.id} col="isCoiling" label="Coiling" align="center" sortState={sortState} onSort={handleSort} />
                          <Th listId={list.id} col="coilingStrength" label="Coiling Strength" align="center" sortState={sortState} onSort={handleSort} />
                          <Th listId={list.id} col="volumeRatio" label="Vol Ratio" align="center" sortState={sortState} onSort={handleSort} />
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">5D Chart</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {symbols.length === 0 && (
                          <tr><td colSpan={9} className="px-6 py-8 text-center text-sm text-gray-400 dark:text-zinc-500">No symbols yet — add one above.</td></tr>
                        )}
                        {symbols.map(sym => {
                          const d = symbolData[sym];
                          const loading = !d || d.loading;
                          return (
                            <tr key={sym} className="border-t border-gray-100 dark:border-zinc-700/30 hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors">
                              <td className="px-4 py-3 text-sm">
                                <button onClick={() => router.push(`/stocks?symbol=${sym}`)} className="font-bold text-brand-blue hover:underline">{sym}</button>
                              </td>
                              <td className="px-4 py-3 text-right text-sm">
                                {loading ? <Skeleton className="h-4 w-16 ml-auto" /> : d.error ? (
                                  <span className="text-red-500 text-xs">{d.error}</span>
                                ) : (
                                  <span className="text-gray-900 dark:text-white font-medium">
                                    ${d.price?.toFixed(2)}
                                    {d.marketOpen === false && <span className="ml-1 text-[10px] text-gray-400">(prev close)</span>}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-sm">
                                {loading ? <Skeleton className="h-4 w-20 ml-auto" /> : d?.change !== null && d?.change !== undefined ? (
                                  <span className={d.change >= 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                                    {d.change >= 0 ? '+' : ''}{d.change.toFixed(2)} ({d.changePercent})
                                  </span>
                                ) : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3 text-center text-sm">
                                {loading ? <Skeleton className="h-4 w-12 mx-auto" /> : d?.tsi !== null && d?.tsi !== undefined ? (
                                  <span className={d.tsi > 0 ? 'font-semibold text-green-600' : 'font-semibold text-red-500'}>{d.tsi.toFixed(1)}</span>
                                ) : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3 text-center text-sm">
                                {loading ? <Skeleton className="h-4 w-10 mx-auto" /> : d?.isCoiling ? (
                                  <span className="inline-block px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded text-xs font-semibold">Yes 🌀</span>
                                ) : <span className="text-gray-400 text-xs">No</span>}
                              </td>
                              <td className="px-4 py-3 text-center text-sm">
                                {loading ? <Skeleton className="h-4 w-14 mx-auto" /> : d?.coilingStrength !== null && d?.coilingStrength !== undefined ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <div className="w-12 bg-gray-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                                      <div className={`h-full ${d.coilingStrength > 0.7 ? 'bg-red-500' : d.coilingStrength > 0.4 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${d.coilingStrength * 100}%` }} />
                                    </div>
                                    <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">{(d.coilingStrength * 100).toFixed(0)}%</span>
                                  </div>
                                ) : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3 text-center text-sm">
                                {loading ? <span className="text-gray-400">—</span> : d?.volumeRatio !== null && d?.volumeRatio !== undefined ? (
                                  <span className={`font-semibold ${d.volumeRatio >= 2 ? 'text-red-600' : d.volumeRatio >= 1.5 ? 'text-orange-500' : d.volumeRatio >= 1 ? 'text-green-600' : 'text-gray-500'}`}>
                                    {d.volumeRatio.toFixed(2)}x
                                  </span>
                                ) : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {loading ? <Skeleton className="h-8 w-20 mx-auto" /> : d?.sparkline && d.sparkline.length > 1 ? (
                                  <div className="w-20 h-8 inline-block">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart data={d.sparkline}>
                                        <Line type="monotone" dataKey="v" dot={false} strokeWidth={1.5} stroke={(d.change ?? 0) >= 0 ? '#16a34a' : '#dc2626'} />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                ) : <span className="text-gray-400 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button onClick={() => removeSymbol(list.id, sym)} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!listsLoading && watchlists.length === 0 && (
          <div className="text-center py-16 text-gray-400 dark:text-zinc-500">
            No watchlists yet — click <strong>New Watchlist</strong> to get started.
          </div>
        )}

        {/* Legend */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/40 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-1 text-sm">True Strength Index (TSI)</h3>
            <p className="text-xs text-blue-700 dark:text-blue-400">Momentum oscillator (-100 to +100). Positive = uptrend, Negative = downtrend.</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700/40 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900 dark:text-purple-300 mb-1 text-sm">Day Change</h3>
            <p className="text-xs text-purple-700 dark:text-purple-400">Dollar and percentage change from previous close. Green = gain, Red = loss.</p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/40 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-300 mb-1 text-sm">Coiling 🌀</h3>
            <p className="text-xs text-yellow-700 dark:text-yellow-400">Tight consolidation with decreasing volatility. Often precedes significant breakout moves.</p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default WatchlistPage;
