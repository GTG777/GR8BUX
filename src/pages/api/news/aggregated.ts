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

    // Handle empty symbols gracefully
    if (!symbols || typeof symbols !== 'string' || symbols.trim() === '') {
      return res.status(200).json({
        success: true,
        data: {
          symbols: [],
          count: 0,
          articles: [],
          message: 'No symbols selected. Add symbols to see related news.',
        },
      });
    }

    const symbolList = symbols.split(',').map((s) => s.trim().toUpperCase()).filter((s) => s !== '');

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
