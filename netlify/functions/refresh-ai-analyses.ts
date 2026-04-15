import type { Handler, HandlerEvent } from '@netlify/functions';

// Runs every 30 minutes during market hours (Mon-Fri, 9 AM - 5 PM ET)
const handler: Handler = async (event: HandlerEvent) => {
  const siteUrl = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'CRON_SECRET not configured' }) };
  }

  try {
    const response = await fetch(`${siteUrl}/api/cron/refresh-ai-analyses`, {
      method: 'GET',
      headers: {
        'x-cron-secret': cronSecret,
        'Content-Type': 'application/json',
      },
    });

    const body = await response.text();
    console.log(`[refresh-ai-analyses] Status: ${response.status}, Body: ${body}`);

    return {
      statusCode: response.ok ? 200 : response.status,
      body,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[refresh-ai-analyses] Error:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
