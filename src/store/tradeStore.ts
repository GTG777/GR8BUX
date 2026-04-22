import { create } from 'zustand';
import { Trade, TradeAnalytics } from '@/types';
import axios from 'axios';
import { getSupabaseClient } from '@/lib/supabase';

interface TradeFilter {
  symbol?: string;
  status?: 'open' | 'closed';
  type?: 'stock' | 'option';
}

interface TradeState {
  trades: Trade[];
  totalCount: number;
  analytics: TradeAnalytics | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchTrades: (filter?: TradeFilter, limit?: number, offset?: number) => Promise<void>;
  fetchAnalytics: () => Promise<void>;
  createTrade: (trade: Partial<Trade>) => Promise<Trade | null>;
  updateTrade: (id: string, updates: Partial<Trade>) => Promise<Trade | null>;
  deleteTrade: (id: string) => Promise<boolean>;
  clearError: () => void;
}

/** Returns the current session's Bearer token, or null if not signed in. */
async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

/** Returns axios headers with Authorization if a session exists. */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const useTradeStore = create<TradeState>((set, get) => ({
  trades: [],
  totalCount: 0,
  analytics: null,
  isLoading: false,
  error: null,

  fetchTrades: async (filter?: TradeFilter, limit = 50, offset = 0) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (filter?.symbol) params.append('symbol', filter.symbol);
      if (filter?.status) params.append('status', filter.status);
      if (filter?.type) params.append('type', filter.type);
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const response = await axios.get(`/api/trades?${params.toString()}`, {
        headers: await authHeaders(),
      });
      if (response.data.success) {
        set({ trades: response.data.data, totalCount: response.data.total ?? response.data.data.length, isLoading: false });
      } else {
        set({ error: response.data.error || 'Failed to fetch trades', isLoading: false });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch trades';
      set({ error: message, isLoading: false });
    }
  },

  fetchAnalytics: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.get('/api/trades/analytics', {
        headers: await authHeaders(),
      });
      if (response.data.success) {
        set({ analytics: response.data.data, isLoading: false });
      } else {
        set({ error: response.data.error || 'Failed to fetch analytics', isLoading: false });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch analytics';
      set({ error: message, isLoading: false });
    }
  },

  createTrade: async (trade: Partial<Trade>) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.post('/api/trades', trade, {
        headers: await authHeaders(),
      });
      if (response.data.success) {
        const newTrade = response.data.data;
        set((state) => ({
          trades: [newTrade, ...state.trades],
          isLoading: false,
        }));
        return newTrade;
      } else {
        set({ error: response.data.error || 'Failed to create trade', isLoading: false });
        return null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create trade';
      set({ error: message, isLoading: false });
      return null;
    }
  },

  updateTrade: async (id: string, updates: Partial<Trade>) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.put(`/api/trades/${id}`, updates, {
        headers: await authHeaders(),
      });
      if (response.data.success) {
        const updatedTrade = response.data.data;
        set((state) => ({
          trades: state.trades.map((t) => (t.id === id ? updatedTrade : t)),
          isLoading: false,
        }));
        return updatedTrade;
      } else {
        set({ error: response.data.error || 'Failed to update trade', isLoading: false });
        return null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update trade';
      set({ error: message, isLoading: false });
      return null;
    }
  },

  deleteTrade: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.delete(`/api/trades/${id}`, {
        headers: await authHeaders(),
      });
      if (response.data.success) {
        set((state) => ({
          trades: state.trades.filter((t) => t.id !== id),
          isLoading: false,
        }));
        return true;
      } else {
        set({ error: response.data.error || 'Failed to delete trade', isLoading: false });
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete trade';
      set({ error: message, isLoading: false });
      return false;
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
