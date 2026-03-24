import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface SentimentSummary {
  symbol: string;
  positive: number;
  negative: number;
  neutral: number;
  overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  engagementScore: number;
}

interface CommunityPost {
  id: string;
  source: 'reddit' | 'stocktwits';
  title: string;
  text: string;
  author: string;
  symbol: string;
  engagement: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  createdAt: string;
  url: string;
}

interface TalkOfTownProps {
  symbols?: string[];
  source?: 'reddit' | 'stocktwits' | 'all';
}

export const TalkOfTown: React.FC<TalkOfTownProps> = ({
  symbols = ['AAPL', 'GOOGL', 'MSFT'],
  source = 'all',
}) => {
  const [summary, setSummary] = useState<SentimentSummary[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'sentiment' | 'posts'>('sentiment');

  useEffect(() => {
    fetchSentiment();
  }, [symbols, source]);

  const fetchSentiment = async () => {
    setLoading(true);
    setError(null);
    try {
      const symbolString = symbols.join(',');
      const params: any = { symbols: symbolString };
      if (source !== 'all') {
        params.source = source;
      }

      const response = await axios.get('/api/community/sentiment', { params });

      if (response.data.success) {
        setSummary(response.data.data.summary);
        setPosts(response.data.data.posts);
      } else {
        setError('Failed to fetch sentiment');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sentiment');
    } finally {
      setLoading(false);
    }
  };

  const sentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'BULLISH':
      case 'positive':
        return 'text-green-600 bg-green-50';
      case 'BEARISH':
      case 'negative':
        return 'text-red-600 bg-red-50';
      case 'NEUTRAL':
      case 'neutral':
        return 'text-gray-600 bg-gray-50';
      default:
        return 'text-blue-600 bg-blue-50';
    }
  };

  const sentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'BULLISH':
      case 'positive':
        return '🚀';
      case 'BEARISH':
      case 'negative':
        return '📉';
      case 'NEUTRAL':
      case 'neutral':
        return '➡️';
      default:
        return '📊';
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
        <h2 className="text-2xl font-bold text-gray-900">Talk of the Town</h2>
        <button
          onClick={fetchSentiment}
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

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('sentiment')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'sentiment'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Sentiment Summary
        </button>
        <button
          onClick={() => setActiveTab('posts')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'posts'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Community Posts ({posts.length})
        </button>
      </div>

      {/* Sentiment Summary Tab */}
      {activeTab === 'sentiment' && (
        <div className="space-y-4">
          {summary.length === 0 ? (
            <p className="text-gray-500">No sentiment data available</p>
          ) : (
            summary.map((item) => (
              <div key={item.symbol} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{item.symbol}</h3>
                    <div className={`flex items-center gap-2 text-2xl font-bold ${sentimentColor(item.overallSentiment)}`}>
                      {sentimentIcon(item.overallSentiment)}
                      {item.overallSentiment}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Engagement Score</p>
                    <p className="text-2xl font-bold text-blue-600">{item.engagementScore.toFixed(1)}</p>
                  </div>
                </div>

                {/* Sentiment Breakdown */}
                <div className="mb-3">
                  <div className="flex h-8 rounded-full overflow-hidden border border-gray-300 bg-gray-100">
                    {item.positive > 0 && (
                      <div
                        className="bg-green-500 flex items-center justify-center text-white text-xs font-bold"
                        style={{ width: `${item.positive}%` }}
                      >
                        {item.positive > 10 && `${item.positive}%`}
                      </div>
                    )}
                    {item.neutral > 0 && (
                      <div
                        className="bg-gray-400 flex items-center justify-center text-white text-xs font-bold"
                        style={{ width: `${item.neutral}%` }}
                      >
                        {item.neutral > 10 && `${item.neutral}%`}
                      </div>
                    )}
                    {item.negative > 0 && (
                      <div
                        className="bg-red-500 flex items-center justify-center text-white text-xs font-bold"
                        style={{ width: `${item.negative}%` }}
                      >
                        {item.negative > 10 && `${item.negative}%`}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="bg-green-50 p-2 rounded border border-green-200">
                    <p className="text-gray-600">Positive</p>
                    <p className="text-lg font-bold text-green-600">{item.positive}%</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded border border-gray-200">
                    <p className="text-gray-600">Neutral</p>
                    <p className="text-lg font-bold text-gray-600">{item.neutral}%</p>
                  </div>
                  <div className="bg-red-50 p-2 rounded border border-red-200">
                    <p className="text-gray-600">Negative</p>
                    <p className="text-lg font-bold text-red-600">{item.negative}%</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Community Posts Tab */}
      {activeTab === 'posts' && (
        <div className="space-y-4">
          {posts.length === 0 ? (
            <p className="text-gray-500">No posts available</p>
          ) : (
            posts.map((post) => (
              <div
                key={post.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start gap-3 mb-2">
                  <div className="flex-1">
                    <div className="flex gap-2 items-center mb-1">
                      <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-semibold">
                        {post.source === 'reddit' ? '🔴' : '💬'} {post.source.toUpperCase()}
                      </span>
                      <span className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                        {post.symbol}
                      </span>
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-1">{post.title}</h4>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${sentimentColor(post.sentiment)}`}>
                    {sentimentIcon(post.sentiment)} {post.sentiment}
                  </span>
                </div>

                <p className="text-gray-700 text-sm mb-2 line-clamp-2">{post.text}</p>

                <div className="flex justify-between items-center text-xs text-gray-500">
                  <div className="flex gap-3">
                    <span>👤 {post.author}</span>
                    <span>❤️ {post.engagement}</span>
                  </div>
                  <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                </div>

                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 text-xs font-medium mt-2 inline-block"
                >
                  View on {post.source} →
                </a>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
