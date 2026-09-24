import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGoogleAdsConfigured, runGoogleAdsQuery } from './googleAdsClient.js';

test('isGoogleAdsConfigured is false when env vars are unset', () => {
  for (const key of [
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CLIENT_SECRET',
    'GOOGLE_ADS_REFRESH_TOKEN',
    'GOOGLE_ADS_CUSTOMER_ID',
  ]) {
    delete process.env[key];
  }
  assert.equal(isGoogleAdsConfigured(), false);
});

test('runGoogleAdsQuery fails closed (throws, never calls the network) when not configured', async () => {
  for (const key of [
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CLIENT_SECRET',
    'GOOGLE_ADS_REFRESH_TOKEN',
    'GOOGLE_ADS_CUSTOMER_ID',
  ]) {
    delete process.env[key];
  }
  await assert.rejects(() => runGoogleAdsQuery('SELECT campaign.name FROM campaign'), /not configured/);
});
