/**
 * Community Sentiment Service
 * Tracks sentiment from Reddit and StockTwits
 */

import axios from 'axios';

export interface CommunityPost {
  id: string;
  source: 'reddit' | 'stocktwits';
  title: string;
  text: string;
  author: string;
  symbol: string;
  engagement: number; // likes, upvotes, etc.
  sentiment: 'positive' | 'negative' | 'neutral';
  createdAt: Date;
  url: string;
}

export interface SentimentSummary {
  symbol: string;
  positive: number;
  negative: number;
  neutral: number;
  overallSentiment: 'positive' | 'negative' | 'neutral';
  engagementScore: number;
}

class CommunityService {
  /**
   * Fetch Reddit discussions for a symbol
   */
  async fetchRedditSentiment(symbols: string[]): Promise<CommunityPost[]> {
    try {
      const posts: CommunityPost[] = [];

      for (const symbol of symbols) {
        try {
          // Use Pushshift API (free archive of Reddit data)
          // Note: Pushshift API is deprecated, using alternative approach
          const response = await axios.get('https://www.reddit.com/r/stocks/search.json', {
            params: {
              q: symbol,
              sort: 'new',
              restrict_sr: true,
              limit: 20,
            },
            headers: {
              'User-Agent': 'TradingJournal/1.0 (trading journal app)',
            },
            timeout: 5000,
          });

          if (response.data.data && response.data.data.children) {
            for (const item of response.data.data.children) {
              const post = item.data;

              posts.push({
                id: post.id,
                source: 'reddit',
                title: post.title,
                text: post.selftext,
                author: post.author,
                symbol,
                engagement: post.score || 0,
                sentiment: this.analyzeSentiment(post.title + ' ' + post.selftext),
                createdAt: new Date(post.created_utc * 1000),
                url: `https://reddit.com${post.permalink}`,
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching Reddit sentiment for ${symbol}:`, error);
        }
      }

      return posts;
    } catch (error) {
      console.error('Error fetching Reddit sentiment:', error);
      return [];
    }
  }

  /**
   * Fetch StockTwits sentiment for a symbol
   */
  async fetchStockTwitsSentiment(symbols: string[]): Promise<CommunityPost[]> {
    try {
      const posts: CommunityPost[] = [];

      for (const symbol of symbols) {
        try {
          // StockTwits API (free tier)
          const response = await axios.get(`https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json`, {
            timeout: 5000,
          });

          if (response.data.messages) {
            for (const message of response.data.messages) {
              posts.push({
                id: message.id,
                source: 'stocktwits',
                title: '',
                text: message.body,
                author: message.user.username,
                symbol,
                engagement: message.likes || 0,
                sentiment: this.analyzeSentiment(message.body),
                createdAt: new Date(message.created_at),
                url: `https://stocktwits.com/symbol/${symbol}`,
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching StockTwits sentiment for ${symbol}:`, error);
        }
      }

      return posts;
    } catch (error) {
      console.error('Error fetching StockTwits sentiment:', error);
      return [];
    }
  }

  /**
   * Analyze sentiment from text
   */
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const lowerText = text.toLowerCase();

    const positiveKeywords = [
      'bullish', 'buy', 'long', 'gain', 'surge', 'rally', 'profit', 'bull', 'rise', 'jump', 
      'great', 'amazing', 'excellent', 'awesome', 'opportunity', 'rocket', '🚀', 'moon', 'lambo',
    ];

    const negativeKeywords = [
      'bearish', 'sell', 'short', 'loss', 'crash', 'plunge', 'decline', 'bear', 'fall', 'drop', 
      'sell off', 'bad', 'terrible', 'avoid', 'dump', 'dead', 'rip', 'scam', 'fraud',
    ];

    let positiveScore = 0;
    let negativeScore = 0;

    for (const keyword of positiveKeywords) {
      if (lowerText.includes(keyword)) positiveScore++;
    }

    for (const keyword of negativeKeywords) {
      if (lowerText.includes(keyword)) negativeScore++;
    }

    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
  }

  /**
   * Get sentiment summary for symbols
   */
  async getSentimentSummary(symbols: string[]): Promise<SentimentSummary[]> {
    const summaries: SentimentSummary[] = [];

    // Fetch from both sources in parallel
    const [redditPosts, stocktwitsPosts] = await Promise.all([
      this.fetchRedditSentiment(symbols),
      this.fetchStockTwitsSentiment(symbols),
    ]);

    const allPosts = [...redditPosts, ...stocktwitsPosts];

    // Group by symbol and calculate sentiment
    for (const symbol of symbols) {
      const symbolPosts = allPosts.filter((p) => p.symbol === symbol);

      if (symbolPosts.length === 0) continue;

      let positive = 0;
      let negative = 0;
      let neutral = 0;
      let totalEngagement = 0;

      for (const post of symbolPosts) {
        if (post.sentiment === 'positive') positive++;
        else if (post.sentiment === 'negative') negative++;
        else neutral++;

        totalEngagement += post.engagement;
      }

      const total = symbolPosts.length;
      let overallSentiment: 'positive' | 'negative' | 'neutral' = 'neutral';

      if (positive > negative) overallSentiment = 'positive';
      else if (negative > positive) overallSentiment = 'negative';

      summaries.push({
        symbol,
        positive: Math.round((positive / total) * 100),
        negative: Math.round((negative / total) * 100),
        neutral: Math.round((neutral / total) * 100),
        overallSentiment,
        engagementScore: Math.round(totalEngagement / total),
      });
    }

    return summaries;
  }
}

export default new CommunityService();
