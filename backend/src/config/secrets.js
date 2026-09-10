import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const cache = new Map();
let client;

function getClient() {
  if (!client) client = new SecretManagerServiceClient();
  return client;
}

/**
 * Fetches a secret's latest version from GCP Secret Manager, or falls back to
 * the matching env var when USE_LOCAL_SECRETS=true (local dev). Caches per
 * process so we don't hit Secret Manager on every request.
 */
export async function getSecret(name) {
  if (cache.has(name)) return cache.get(name);

  if (process.env.USE_LOCAL_SECRETS === 'true') {
    const value = process.env[name];
    cache.set(name, value);
    return value;
  }

  const projectId = process.env.GCP_PROJECT_ID;
  const [version] = await getClient().accessSecretVersion({
    name: `projects/${projectId}/secrets/${name}/versions/latest`,
  });
  const value = version.payload.data.toString('utf8');
  cache.set(name, value);
  return value;
}
