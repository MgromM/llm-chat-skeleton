import { logger } from '../../config/logger.js';

// Read-only reporting against the Meta (Facebook) Marketing API's insights
// endpoints. No campaign/adset/ad create-or-update endpoints are called
// anywhere in this module -- keep it that way if you extend it.
const API_VERSION = 'v20.0';

function isConfigured() {
  return Boolean(process.env.META_ADS_ACCESS_TOKEN && process.env.META_ADS_AD_ACCOUNT_ID);
}

/**
 * Returns per-campaign insights for the ad account over the given date
 * preset (Meta's own presets, e.g. "last_7d", "last_30d", "today").
 * Throws on any failure -- callers (the slash command) turn that into a
 * user-facing message rather than surfacing a stack trace.
 */
export async function getCampaignInsights({ datePreset = 'last_7d' } = {}) {
  if (!isConfigured()) {
    throw new Error('Meta Ads API is not configured. Set META_ADS_ACCESS_TOKEN and META_ADS_AD_ACCOUNT_ID.');
  }

  const accountId = process.env.META_ADS_AD_ACCOUNT_ID.replace(/^act_/, '');
  const fields = ['campaign_name', 'spend', 'impressions', 'clicks', 'ctr', 'actions'].join(',');
  const params = new URLSearchParams({
    level: 'campaign',
    fields,
    date_preset: datePreset,
    access_token: process.env.META_ADS_ACCESS_TOKEN,
  });

  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/act_${accountId}/insights?${params}`, {
    method: 'GET',
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error('Meta Ads API request failed', { status: res.status, body });
    throw new Error(`Meta Ads API error: ${res.status}`);
  }

  const data = await res.json();
  return (data.data ?? []).map((row) => ({
    name: row.campaign_name,
    spendUsd: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    ctr: Number(row.ctr ?? 0),
    conversions: (row.actions ?? []).reduce((sum, a) => sum + Number(a.value ?? 0), 0),
  }));
}

export function isMetaAdsConfigured() {
  return isConfigured();
}
