import type { Handler } from '@netlify/functions';

// 7:30 PM CST (01:30 UTC Tue-Sat)
// Triggers the background function to refresh earnings enrichment in the evening.
const handler: Handler = async (event) => {
  const siteUrl    = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'CRON_SECRET not configured' }) };
  }

  try {
    const response = await fetch(
      `${siteUrl}/.netlify/functions/earnings-enrichment-background?secret=${encodeURIComponent(cronSecret)}`,
      { method: 'POST' },
    );

    const body = await response.text();
    console.log(`[earnings-enrichment-evening] Triggered background fn. Status: ${response.status}`);

    return { statusCode: response.ok ? 200 : response.status, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[earnings-enrichment-evening] Error:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
