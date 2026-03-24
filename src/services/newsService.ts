/**
 * News Service - Aggregates financial news from multiple free sources
 */

export interface NewsItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  timestamp: string;
  symbols: string[];
}

/**
 * Fetch news from Yahoo Finance RSS feed (free)
 * Note: This would need to be proxied through the backend due to CORS
 */
export async function fetchYahooFinanceNews(symbol?: string): Promise<NewsItem[]> {
  try {
    // This is a placeholder - actual implementation would parse RSS
    // and would need to run on the backend to avoid CORS issues
    const response = await fetch(`/api/news/yahoo?symbol=${symbol || ''}`);
    if (!response.ok) throw new Error('Failed to fetch Yahoo Finance news');

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[Yahoo Finance News Error]', error);
    return [];
  }
}

/**
 * Fetch news from MSN Finance (free)
 */
export async function fetchMSNFinanceNews(symbol?: string): Promise<NewsItem[]> {
  try {
    const response = await fetch(`/api/news/msn?symbol=${symbol || ''}`);
    if (!response.ok) throw new Error('Failed to fetch MSN Finance news');

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[MSN Finance News Error]', error);
    return [];
  }
}

/**
 * Fetch news from Google Finance (limited, free)
 */
export async function fetchGoogleFinanceNews(symbol?: string): Promise<NewsItem[]> {
  try {
    const response = await fetch(`/api/news/google?symbol=${symbol || ''}`);
    if (!response.ok) throw new Error('Failed to fetch Google Finance news');

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[Google Finance News Error]', error);
    return [];
  }
}

/**
 * Get aggregated news from all sources
 */
export async function fetchAggregatedNews(symbol?: string): Promise<NewsItem[]> {
  try {
    const response = await fetch(`/api/news/aggregated?symbol=${symbol || ''}`);
    if (!response.ok) throw new Error('Failed to fetch aggregated news');

    const data = await response.json();
    // Sort by most recent first
    return data.sort(
      (a: NewsItem, b: NewsItem) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (error) {
    console.error('[Aggregated News Error]', error);
    return [];
  }
}

/**
 * Filter news by sentiment if available
 */
export function filterNewsBySentiment(
  news: NewsItem[],
  sentiment: 'positive' | 'negative' | 'neutral'
): NewsItem[] {
  // This would need sentiment analysis on the backend
  return news.filter((item) => {
    // Placeholder - would check item.sentiment or analyze title/summary
    return true;
  });
}

/**
 * Search news for specific keywords
 */
export function searchNews(news: NewsItem[], query: string): NewsItem[] {
  const lowerQuery = query.toLowerCase();
  return news.filter(
    (item) =>
      item.title.toLowerCase().includes(lowerQuery) ||
      item.summary.toLowerCase().includes(lowerQuery) ||
      item.symbols.some((s) => s.toLowerCase().includes(lowerQuery))
  );
}
