import type { Handler } from '@netlify/functions';

// Scheduled every 15 min during market hours (Mon-Fri, 9am-4pm ET = 13:00-21:00 UTC)
// Triggers the background function to run the On Watch scanner.
const handler: Handler = async (event) => {
  const siteUrl    = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[intraday-scan-onwatch] CRON_SECRET not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'CRON_SECRET not configured' }) };
  }

  try {
    const response = await fetch(
      `${siteUrl}/.netlify/functions/scan-onwatch-background?secret=${encodeURIComponent(cronSecret)}`,
      { method: 'POST' },
    );

    const body = await response.text();
    console.log(`[intraday-scan-onwatch] Triggered background fn. Status: ${response.status}`);

    return { statusCode: response.ok ? 200 : response.status, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[intraday-scan-onwatch] Error:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
