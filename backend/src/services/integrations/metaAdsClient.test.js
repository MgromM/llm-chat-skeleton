import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMetaAdsConfigured, getCampaignInsights } from './metaAdsClient.js';

test('isMetaAdsConfigured is false when env vars are unset', () => {
  delete process.env.META_ADS_ACCESS_TOKEN;
  delete process.env.META_ADS_AD_ACCOUNT_ID;
  assert.equal(isMetaAdsConfigured(), false);
});

test('getCampaignInsights fails closed (throws, never calls the network) when not configured', async () => {
  delete process.env.META_ADS_ACCESS_TOKEN;
  delete process.env.META_ADS_AD_ACCOUNT_ID;
  await assert.rejects(() => getCampaignInsights(), /not configured/);
});
