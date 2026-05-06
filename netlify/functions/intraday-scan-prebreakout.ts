import type { Handler } from '@netlify/functions';

// Runs every 15 min Mon-Fri market hours (schedule set in netlify.toml)
// Triggers the pre-breakout background function.
const handler: Handler = async () => {
  const siteUrl    = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[intraday-scan-prebreakout] CRON_SECRET not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'CRON_SECRET not configured' }) };
  }

  try {
    const response = await fetch(
      `${siteUrl}/.netlify/functions/scan-prebreakout-background?secret=${encodeURIComponent(cronSecret)}`,
      { method: 'POST' },
    );
    const body = await response.text();
    console.log(`[intraday-scan-prebreakout] Triggered. Status: ${response.status} — ${body.slice(0, 200)}`);
    return { statusCode: response.ok ? 200 : response.status, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[intraday-scan-prebreakout] Error:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
