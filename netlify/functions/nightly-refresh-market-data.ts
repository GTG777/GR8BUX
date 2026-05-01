import type { Handler } from '@netlify/functions';

// Nightly refresh at 11 PM ET (04:00 UTC Tue-Sat)
// Seeds fresh price/IVR/RSI data before next market open so earnings page
// shows populated columns first thing in the morning.
const handler: Handler = async () => {
  const siteUrl = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'CRON_SECRET not configured' }) };
  }

  try {
    const response = await fetch(`${siteUrl}/api/cron/refresh-market-data`, {
      method: 'GET',
      headers: {
        'x-cron-secret': cronSecret,
        'Content-Type': 'application/json',
      },
    });

    const body = await response.text();
    console.log(`[nightly-refresh-market-data] Status: ${response.status}, Body: ${body}`);

    return {
      statusCode: response.ok ? 200 : response.status,
      body,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[nightly-refresh-market-data] Error:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
