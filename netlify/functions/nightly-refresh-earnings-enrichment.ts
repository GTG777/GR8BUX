import type { Handler } from '@netlify/functions';

// Nightly at 11:45 PM ET (04:45 UTC Tue-Sat)
// Triggers the background function which has a 15-minute timeout so it can
// process all upcoming earners without hitting the 26s serverless limit.
const handler: Handler = async (event) => {
  const siteUrl    = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'CRON_SECRET not configured' }) };
  }

  try {
    // Trigger background function — it returns 202 immediately and processes
    // in the background for up to 15 minutes.
    const response = await fetch(
      `${siteUrl}/.netlify/functions/earnings-enrichment-background?secret=${encodeURIComponent(cronSecret)}`,
      { method: 'POST' },
    );

    const body = await response.text();
    console.log(`[nightly-refresh-earnings-enrichment] Triggered background fn. Status: ${response.status}`);

    return { statusCode: response.ok ? 200 : response.status, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[nightly-refresh-earnings-enrichment] Error:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};

export { handler };
