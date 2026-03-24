/**
 * News Aggregation Service
 * Fetches market news from multiple free sources
 */

import axios from 'axios';

export interface NewsArticle {
  id?: string;
  title: string;
  summary?: string;
  source: string;
  sourceUrl: string;
  publishedAt: Date;
  symbols: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  imageUrl?: string;
}

class NewsService {
  /**
   * Fetch news from Yahoo Finance RSS
   */
  async fetchYahooFinanceNews(symbols: string[]): Promise<NewsArticle[]> {
    try {
      const articles: NewsArticle[] = [];

      for (const symbol of symbols) {
        try {
          // Yahoo Finance RSS feed format
          const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}`;

          // Using a CORS proxy since browsers can't access RSS directly
          const response = await axios.get(`https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`);

          if (response.data && response.data.contents) {
            const xmlText = response.data.contents;
            // Parse basic XML structure
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            const matches = xmlText.matchAll(itemRegex);

            for (const match of matches) {
              const itemXml = match[1];

              // Extract title
              const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
              const title = titleMatch ? titleMatch[1].replace(/<\/?[^>]+(>|$)/g, '') : '';

              // Extract description
              const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/);
              const summary = descMatch ? descMatch[1].replace(/<\/?[^>]+(>|$)/g, '') : '';

              // Extract publication date
              const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
              const publishedAt = pubDateMatch ? new Date(pubDateMatch[1]) : new Date();

              // Extract link
              const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
              const sourceUrl = linkMatch ? linkMatch[1].trim() : '';

              if (title && sourceUrl) {
                articles.push({
                  title,
                  summary,
                  source: 'Yahoo Finance',
                  sourceUrl,
                  publishedAt,
                  symbols: [symbol],
                  sentiment: this.analyzeSentiment(title + ' ' + summary),
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching Yahoo Finance news for ${symbol}:`, error);
        }
      }

      return articles;
    } catch (error) {
      console.error('Error fetching Yahoo Finance news:', error);
      return [];
    }
  }

  /**
   * Fetch news from NewsAPI (free tier available)
   */
  async fetchNewsAPI(symbols: string[], apiKey?: string): Promise<NewsArticle[]> {
    try {
      if (!apiKey) {
        console.warn('NewsAPI key not provided, skipping NewsAPI');
        return [];
      }

      const articles: NewsArticle[] = [];

      for (const symbol of symbols) {
        try {
          const response = await axios.get('https://newsapi.org/v2/everything', {
            params: {
              q: symbol,
              sortBy: 'publishedAt',
              language: 'en',
              apiKey,
            },
            timeout: 5000,
          });

          if (response.data.articles) {
            for (const item of response.data.articles) {
              articles.push({
                title: item.title,
                summary: item.description,
                source: item.source.name,
                sourceUrl: item.url,
                publishedAt: new Date(item.publishedAt),
                symbols: [symbol],
                imageUrl: item.urlToImage,
                sentiment: this.analyzeSentiment(item.title + ' ' + item.description),
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching NewsAPI news for ${symbol}:`, error);
        }
      }

      return articles;
    } catch (error) {
      console.error('Error fetching from NewsAPI:', error);
      return [];
    }
  }

  /**
   * Simple sentiment analysis based on keywords
   */
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const lowerText = text.toLowerCase();

    const positiveKeywords = ['gain', 'surge', 'rally', 'profit', 'bull', 'rise', 'jump', 'crush', 'beat', 'outperform', 'upgrade'];
    const negativeKeywords = ['loss', 'crash', 'plunge', 'decline', 'bear', 'fall', 'drop', 'miss', 'underperform', 'downgrade', 'warning'];

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
   * Aggregate news from all sources
   */
  async aggregateNews(symbols: string[], options?: { newsApiKey?: string }): Promise<NewsArticle[]> {
    const allNews: NewsArticle[] = [];

    // Fetch from Yahoo Finance
    const yahooNews = await this.fetchYahooFinanceNews(symbols.slice(0, 5)); // Limit to first 5 to avoid rate limits
    allNews.push(...yahooNews);

    // Fetch from NewsAPI if key provided
    if (options?.newsApiKey) {
      const newsApiNews = await this.fetchNewsAPI(symbols.slice(0, 5), options.newsApiKey);
      allNews.push(...newsApiNews);
    }

    // Remove duplicates by title
    const seen = new Set<string>();
    const unique = allNews.filter((article) => {
      if (seen.has(article.title)) return false;
      seen.add(article.title);
      return true;
    });

    // Sort by date (newest first)
    return unique.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  }
}

export default new NewsService();
