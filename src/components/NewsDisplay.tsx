import React, { useState, useEffect } from 'react';
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
  imageUrl?: string;
}

interface NewsDisplayProps {
  symbols?: string[];
  maxArticles?: number;
}

export const NewsDisplay: React.FC<NewsDisplayProps> = ({
  symbols = ['AAPL', 'GOOGL', 'MSFT'],
  maxArticles = 20,
}) => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'positive' | 'negative' | 'neutral'>('all');

  useEffect(() => {
    fetchNews();
  }, [symbols]);

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const symbolString = symbols.join(',');
      const response = await axios.get('/api/news/aggregated', {
        params: { symbols: symbolString },
      });

      if (response.data.success) {
        setArticles(response.data.data.articles.slice(0, maxArticles));
      } else {
        setError('Failed to fetch news');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch news');
    } finally {
      setLoading(false);
    }
  };

  const filteredArticles = articles.filter(
    (article) => filter === 'all' || article.sentiment === filter
  );

  const sentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'negative':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'neutral':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const sentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return '📈';
      case 'negative':
        return '📉';
      case 'neutral':
        return '➡️';
      default:
        return '📰';
    }
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Market News</h2>
        <button
          onClick={fetchNews}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Sentiment Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1 rounded text-sm ${
            filter === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
          }`}
        >
          All ({articles.length})
        </button>
        <button
          onClick={() => setFilter('positive')}
          className={`px-3 py-1 rounded text-sm ${
            filter === 'positive' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700'
          }`}
        >
          Positive ({articles.filter((a) => a.sentiment === 'positive').length})
        </button>
        <button
          onClick={() => setFilter('negative')}
          className={`px-3 py-1 rounded text-sm ${
            filter === 'negative' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'
          }`}
        >
          Negative ({articles.filter((a) => a.sentiment === 'negative').length})
        </button>
        <button
          onClick={() => setFilter('neutral')}
          className={`px-3 py-1 rounded text-sm ${
            filter === 'neutral' ? 'bg-gray-500 text-white' : 'bg-gray-200 text-gray-700'
          }`}
        >
          Neutral ({articles.filter((a) => a.sentiment === 'neutral').length})
        </button>
      </div>

      {/* Articles List */}
      <div className="space-y-4">
        {filteredArticles.length === 0 ? (
          <p className="text-gray-500">No articles found</p>
        ) : (
          filteredArticles.map((article) => (
            <div
              key={article.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex gap-4">
                {article.imageUrl && (
                  <img
                    src={article.imageUrl}
                    alt={article.title}
                    className="w-24 h-24 object-cover rounded hidden md:block"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{article.title}</h3>
                      <p className="text-sm text-gray-600 mb-2">{article.summary}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-semibold border whitespace-nowrap ${sentimentColor(article.sentiment)}`}>
                      {sentimentIcon(article.sentiment)} {article.sentiment}
                    </span>
                  </div>

                  {/* Symbol Tags */}
                  <div className="flex gap-1 flex-wrap mb-2">
                    {article.symbols.slice(0, 3).map((sym) => (
                      <span key={sym} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                        {sym}
                      </span>
                    ))}
                    {article.symbols.length > 3 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        +{article.symbols.length - 3}
                      </span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>{article.source}</span>
                    <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                  </div>

                  {/* Read Link */}
                  <a
                    href={article.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-700 text-sm font-medium"
                  >
                    Read full article →
                  </a>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
