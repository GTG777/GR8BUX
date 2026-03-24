import type { NextApiRequest, NextApiResponse } from 'next';
import newsService from '@/lib/newsService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    const { symbols, apiKey } = req.query;

    if (!symbols || typeof symbols !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'symbols query parameter is required (comma-separated)',
      });
    }

    const symbolList = symbols.split(',').map((s) => s.trim().toUpperCase());

    const newsApiKey = apiKey && typeof apiKey === 'string' ? apiKey : undefined;
    const news = await newsService.aggregateNews(symbolList, { newsApiKey });

    res.status(200).json({
      success: true,
      data: {
        symbols: symbolList,
        count: news.length,
        articles: news.map((article) => ({
          id: article.id || `${article.source}-${article.sourceUrl}`,
          title: article.title,
          summary: article.summary,
          source: article.source,
          sourceUrl: article.sourceUrl,
          publishedAt: article.publishedAt.toISOString(),
          symbols: article.symbols,
          sentiment: article.sentiment,
          imageUrl: article.imageUrl,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch news',
    });
  }
}
