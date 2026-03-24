'use client';

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  symbols: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
}

interface Sector {
  name: string;
  etf: string;
  icon: string;
  color: string;
}

const SECTORS: Sector[] = [
  { name: 'Energy',                  etf: 'XLE',  icon: '⚡', color: 'amber' },
  { name: 'Materials',               etf: 'XLB',  icon: '⛏️', color: 'stone' },
  { name: 'Industrials',             etf: 'XLI',  icon: '🏭', color: 'slate' },
  { name: 'Consumer Discretionary',  etf: 'XLY',  icon: '🛍️', color: 'pink' },
  { name: 'Consumer Staples',        etf: 'XLP',  icon: '🛒', color: 'green' },
  { name: 'Health Care',             etf: 'XLV',  icon: '🏥', color: 'red' },
  { name: 'Financials',              etf: 'XLF',  icon: '🏦', color: 'blue' },
  { name: 'Information Technology',  etf: 'XLK',  icon: '💻', color: 'violet' },
  { name: 'Communication Services',  etf: 'XLC',  icon: '📡', color: 'cyan' },
  { name: 'Utilities',               etf: 'XLU',  icon: '💡', color: 'yellow' },
  { name: 'Real Estate',             etf: 'XLRE', icon: '🏠', color: 'orange' },
];

function computeSectorSentiment(articles: NewsArticle[]): 'positive' | 'negative' | 'neutral' {
  if (articles.length === 0) return 'neutral';
  const pos = articles.filter((a) => a.sentiment === 'positive').length;
  const neg = articles.filter((a) => a.sentiment === 'negative').length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Sentiment styles
const sentimentBorder: Record<string, string> = {
  positive: 'border-l-4 border-green-500',
  negative: 'border-l-4 border-red-500',
  neutral:  'border-l-4 border-gray-300',
};
const sentimentBadge: Record<string, string> = {
  positive: 'bg-green-100 text-green-800',
  negative: 'bg-red-100 text-red-800',
  neutral:  'bg-gray-100 text-gray-600',
};
const sentimentLabel: Record<string, string> = {
  positive: '📈 Bullish',
  negative: '📉 Bearish',
  neutral:  '➡️ Neutral',
};

interface SectorCardProps {
  sector: Sector;
}

const SectorCard: React.FC<SectorCardProps> = ({ sector }) => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchSectorNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/news/aggregated', {
        params: { symbols: sector.etf },
      });
      if (res.data.success) {
        setArticles(res.data.data.articles.slice(0, 10));
      }
    } catch {
      // leave articles empty — card shows 'No news' state
    } finally {
      setLoading(false);
    }
  }, [sector.etf]);

  useEffect(() => {
    fetchSectorNews();
  }, [fetchSectorNews]);

  const sentiment = computeSectorSentiment(articles);
  const preview = articles.slice(0, 2);
  const rest = articles.slice(2);

  return (
    <div className={`bg-white rounded-lg shadow ${sentimentBorder[sentiment]} flex flex-col`}>
      {/* Header */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">{sector.icon}</span>
            <div>
              <p className="font-semibold text-gray-900 text-sm leading-tight">{sector.name}</p>
              <p className="text-xs text-gray-400">{sector.etf}</p>
            </div>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sentimentBadge[sentiment]}`}>
            {sentimentLabel[sentiment]}
          </span>
        </div>
      </div>

      {/* Articles */}
      <div className="px-4 pb-3 flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-16">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
          </div>
        ) : articles.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">No recent news</p>
        ) : (
          <div className="space-y-2">
            {preview.map((article) => (
              <a
                key={article.id}
                href={article.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <p className="text-xs font-medium text-gray-800 group-hover:text-blue-600 leading-snug line-clamp-2">
                  {article.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {article.source} · {timeAgo(article.publishedAt)}
                </p>
              </a>
            ))}

            {/* Expanded articles */}
            {expanded && rest.map((article) => (
              <a
                key={article.id}
                href={article.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block group border-t border-gray-100 pt-2"
              >
                <p className="text-xs font-medium text-gray-800 group-hover:text-blue-600 leading-snug line-clamp-2">
                  {article.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {article.source} · {timeAgo(article.publishedAt)}
                </p>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {articles.length > 2 && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {expanded ? '▲ Show less' : `▼ ${rest.length} more articles`}
          </button>
        </div>
      )}
    </div>
  );
};

// Combined "All Sectors" feed — top 1 headline per sector in one list
const AllSectorsFeed: React.FC = () => {
  const [items, setItems] = useState<{ sector: Sector; article: NewsArticle }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      const results = await Promise.all(
        SECTORS.map(async (sector) => {
          try {
            const res = await axios.get('/api/news/aggregated', {
              params: { symbols: sector.etf },
            });
            if (res.data.success && res.data.data.articles.length > 0) {
              return { sector, article: res.data.data.articles[0] as NewsArticle };
            }
          } catch { /* skip */ }
          return null;
        })
      );
      if (!cancelled) {
        setItems(results.filter(Boolean) as { sector: Sector; article: NewsArticle }[]);
        setLoading(false);
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="text-center py-12 text-gray-400"><p>No sector headlines available</p></div>;
  }

  return (
    <div className="space-y-2">
      {items.map(({ sector, article }) => {
        const s = computeSectorSentiment([article]);
        return (
          <a
            key={sector.etf}
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 p-3 bg-white rounded-lg shadow hover:shadow-md transition-shadow group"
          >
            <span className="text-2xl flex-shrink-0 mt-0.5">{sector.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{sector.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${sentimentBadge[s]}`}>
                  {s === 'positive' ? '📈' : s === 'negative' ? '📉' : '➡️'}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 line-clamp-2 leading-snug">
                {article.title}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{article.source} · {timeAgo(article.publishedAt)}</p>
            </div>
          </a>
        );
      })}
    </div>
  );
};

// Main exported grid component
const SectorNewsGrid: React.FC = () => {
  const [view, setView] = useState<'grid' | 'feed'>('grid');

  return (
    <div>
      {/* Sub-view toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setView('grid')}
          className={`px-3 py-1.5 rounded text-sm font-medium ${view === 'grid' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          ⊞ Sector Grid
        </button>
        <button
          onClick={() => setView('feed')}
          className={`px-3 py-1.5 rounded text-sm font-medium ${view === 'feed' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          ☰ Top Headlines
        </button>
      </div>

      {view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECTORS.map((sector) => (
            <SectorCard key={sector.etf} sector={sector} />
          ))}
        </div>
      ) : (
        <AllSectorsFeed />
      )}
    </div>
  );
};

export default SectorNewsGrid;
