import type { Handler, HandlerEvent } from '@netlify/functions';

// Runs nightly at midnight CT — generates a behavioral brief per active user.
const handler: Handler = async (event: HandlerEvent) => {
  const siteUrl = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[nightly-coach-brief] CRON_SECRET not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'CRON_SECRET not configured' }) };
  }

  try {
    const response = await fetch(`${siteUrl}/api/cron/nightly-coach-brief`, {
      method: 'GET',
      headers: { 'x-cron-secret': cronSecret },
    });

    const body = await response.text();
    console.log(`[nightly-coach-brief] Status: ${response.status}, Body: ${body}`);
    return { statusCode: response.ok ? 200 : response.status, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[nightly-coach-brief] Error:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
