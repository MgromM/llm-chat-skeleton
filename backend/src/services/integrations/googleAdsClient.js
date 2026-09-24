import { logger } from '../../config/logger.js';

// Read-only reporting against the Google Ads REST API (searchStream), using
// GAQL (Google Ads Query Language). No mutate/create endpoints are called
// anywhere in this module -- keep it that way if you extend it.
const API_VERSION = 'v17';

function isConfigured() {
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN &&
      process.env.GOOGLE_ADS_CUSTOMER_ID
  );
}

// OAuth2 access tokens are short-lived; fetch a fresh one per call rather
// than caching, since this is a low-volume reporting path (not a hot loop).
async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`Google OAuth token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

/**
 * Runs a GAQL query against the configured customer account and returns the
 * flattened rows. Throws on any failure -- callers (the slash command) turn
 * that into a user-facing message rather than surfacing a stack trace.
 */
export async function runGoogleAdsQuery(gaqlQuery) {
  if (!isConfigured()) {
    throw new Error(
      'Google Ads API is not configured. Set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, ' +
        'GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN and GOOGLE_ADS_CUSTOMER_ID.'
    );
  }

  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, '');
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || customerId).replace(/-/g, '');
  const accessToken = await getAccessToken();

  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
        'login-customer-id': loginCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: gaqlQuery }),
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    logger.error('Google Ads API request failed', { status: res.status, body });
    throw new Error(`Google Ads API error: ${res.status}`);
  }

  const data = await res.json();
  return data.results ?? [];
}

/**
 * Convenience wrapper: campaign performance for the last N days.
 */
export async function getCampaignPerformance({ days = 7 } = {}) {
  const query = `
    SELECT
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE segments.date DURING LAST_${days}_DAYS
    ORDER BY metrics.cost_micros DESC
  `;
  const rows = await runGoogleAdsQuery(query);
  return rows.map((row) => ({
    name: row.campaign?.name,
    status: row.campaign?.status,
    impressions: Number(row.metrics?.impressions ?? 0),
    clicks: Number(row.metrics?.clicks ?? 0),
    costUsd: Number(row.metrics?.costMicros ?? 0) / 1_000_000,
    conversions: Number(row.metrics?.conversions ?? 0),
  }));
}

export function isGoogleAdsConfigured() {
  return isConfigured();
}
