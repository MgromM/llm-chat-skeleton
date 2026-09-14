import { getSecret } from './secrets.js';

const GOOGLE_OAUTH_BASE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_ACCESS_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ID_TOKEN_INFO_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo';
const GOOGLE_OAUTH_SCOPES = ['openid', 'email', 'profile'];

export class GoogleOAuthError extends Error {}

async function getConfig() {
  const [clientId, clientSecret, redirectUrl] = await Promise.all([
    getSecret('GOOGLE_OAUTH_CLIENT_ID'),
    getSecret('GOOGLE_OAUTH_CLIENT_SECRET'),
    getSecret('GOOGLE_OAUTH_REDIRECT_URL'),
  ]);
  return { clientId, clientSecret, redirectUrl };
}

export async function googleGetLoginUrl(state) {
  const { clientId, redirectUrl } = await getConfig();
  const params = new URLSearchParams({
    scope: GOOGLE_OAUTH_SCOPES.join(' '),
    access_type: 'online',
    response_type: 'code',
    prompt: 'select_account',
    state: state ?? '',
    redirect_uri: redirectUrl,
    client_id: clientId,
  });
  return `${GOOGLE_OAUTH_BASE_URL}?${params.toString()}`;
}

export async function googleExchangeCode(code) {
  const { clientId, clientSecret, redirectUrl } = await getConfig();
  const response = await fetch(GOOGLE_ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUrl,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) throw new GoogleOAuthError('failed to obtain access token from Google');
  return response.json();
}

export async function googleValidateIdToken(idToken) {
  const { clientId } = await getConfig();
  const response = await fetch(`${GOOGLE_ID_TOKEN_INFO_URL}?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) throw new GoogleOAuthError('id_token is invalid');
  const payload = await response.json();
  if (Date.now() / 1000 > Number(payload.exp)) throw new GoogleOAuthError('token is expired');
  if (payload.aud !== clientId) throw new GoogleOAuthError('invalid audience');
  return payload;
}
