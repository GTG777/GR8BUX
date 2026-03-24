import type { NextApiRequest, NextApiResponse } from 'next';
import communityService from '@/lib/communityService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    let { symbols, source } = req.query;

    // Handle symbols parameter
    if (!symbols) {
      return res.status(400).json({
        success: false,
        error: 'symbols query parameter is required (comma-separated)',
      });
    }

    // Ensure symbols is a string (in case it's an array)
    const symbolString = Array.isArray(symbols) ? symbols[0] : String(symbols);
    const symbolList = symbolString.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

    if (symbolList.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one valid symbol is required',
      });
    }

    // Ensure source is a string
    const sourceString = Array.isArray(source) ? source[0] : (source ? String(source) : undefined);

    const posts: any[] = [];

    // Fetch from specific source or both
    if (!sourceString || sourceString === 'all' || sourceString === 'reddit') {
      const redditPosts = await communityService.fetchRedditSentiment(symbolList);
      posts.push(...redditPosts);
    }

    if (!sourceString || sourceString === 'all' || sourceString === 'stocktwits') {
      const stocktwitsPosts = await communityService.fetchStockTwitsSentiment(symbolList);
      posts.push(...stocktwitsPosts);
    }

    const summary = await communityService.getSentimentSummary(symbolList);

    res.status(200).json({
      success: true,
      data: {
        symbols: symbolList,
        summary,
        posts: posts.slice(0, 50).map((post) => ({
          id: post.id,
          source: post.source,
          title: post.title,
          text: post.text.substring(0, 200),
          author: post.author,
          symbol: post.symbol,
          engagement: typeof post.engagement === 'object' ? post.engagement?.total ?? 0 : (post.engagement ?? 0),
          sentiment: post.sentiment,
          createdAt: post.createdAt.toISOString(),
          url: post.url,
        })),
      },
    });
  } catch (error) {
    console.error('Community sentiment error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch community sentiment',
    });
  }
}
