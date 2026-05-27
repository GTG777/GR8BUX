export interface KronosHistoryRow {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  amount?: number;
}

export interface KronosForecastRequest {
  symbol?: string;
  history: KronosHistoryRow[];
  pred_len: number;
  T?: number;
  top_p?: number;
  top_k?: number;
  sample_count?: number;
  future_timestamps?: string[];
}

export interface KronosForecastPoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

export interface KronosForecastResponse {
  success: boolean;
  model: string;
  device: string;
  input_length: number;
  pred_len: number;
  forecast: KronosForecastPoint[];
}
