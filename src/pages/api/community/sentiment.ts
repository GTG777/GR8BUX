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
    const { symbols, source } = req.query;

    if (!symbols || typeof symbols !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'symbols query parameter is required (comma-separated)',
      });
    }

    const symbolList = symbols.split(',').map((s) => s.trim().toUpperCase());

    const posts: any[] = [];

    // Fetch from specific source or both
    if (!source || source === 'reddit') {
      const redditPosts = await communityService.fetchRedditSentiment(symbolList);
      posts.push(...redditPosts);
    }

    if (!source || source === 'stocktwits') {
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
          engagement: post.engagement,
          sentiment: post.sentiment,
          createdAt: post.createdAt.toISOString(),
          url: post.url,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch community sentiment',
    });
  }
}
