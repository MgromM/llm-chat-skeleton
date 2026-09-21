import Anthropic from '@anthropic-ai/sdk';
import { getSecret } from '../config/secrets.js';

let client;

/**
 * Singleton Anthropic client. Key comes from Secret Manager (or env var in
 * local dev via USE_LOCAL_SECRETS), never hardcoded or passed around raw.
 */
export async function getAnthropicClient() {
  if (client) return client;
  const apiKey = await getSecret('ANTHROPIC_API_KEY');
  client = new Anthropic({ apiKey });
  return client;
}

// Pricing per million tokens (USD). Update when Anthropic changes pricing or
// new models are added — used only for our own cost tracking, not billing.
export const MODEL_PRICING_PER_MTOK = {
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
};

// Anthropic prices a cache write at 1.25x the base input rate and a cache
// hit at 0.1x — both are fixed multipliers of the model's own input price.
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export function estimateCostUsd(model, inputTokens, outputTokens, cacheCreationTokens = 0, cacheReadTokens = 0) {
  const pricing = MODEL_PRICING_PER_MTOK[model];
  if (!pricing) return null;
  return (
    (inputTokens * pricing.input +
      outputTokens * pricing.output +
      cacheCreationTokens * pricing.input * CACHE_WRITE_MULTIPLIER +
      cacheReadTokens * pricing.input * CACHE_READ_MULTIPLIER) /
    1_000_000
  );
}
