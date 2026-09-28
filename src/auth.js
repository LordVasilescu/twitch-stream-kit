// © 2026 Mathew. All rights reserved.
import { config, redirectUri, scopes } from './config.js';
import { loadTokens, saveTokens } from './store.js';

const OAUTH = 'https://id.twitch.tv/oauth2';

export function authorizeUrl() {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
  });
  return `${OAUTH}/authorize?${params}`;
}

// Exchange the ?code= from the callback for tokens, then resolve the user id.
export async function exchangeCode(code) {
  const res = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope,
  };
  const me = await getUser(tokens.accessToken);
  tokens.userId = me.id;
  tokens.login = me.login;
  saveTokens(tokens);
  return tokens;
}

export async function refresh() {
  const tokens = loadTokens();
  if (!tokens?.refreshToken) throw new Error('No refresh token — re-authorize.');
  const res = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  tokens.accessToken = data.access_token;
  if (data.refresh_token) tokens.refreshToken = data.refresh_token;
  if (data.scope) tokens.scope = data.scope;
  saveTokens(tokens);
  return tokens;
}

async function getUser(accessToken) {
  const res = await fetch('https://api.twitch.tv/helix/users', {
    headers: { 'Client-Id': config.clientId, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Get user failed: ${res.status} ${await res.text()}`);
  return (await res.json()).data[0];
}

// Authenticated Helix request that auto-refreshes once on 401.
export async function helix(path, { method = 'GET', body, query } = {}) {
  const tokens = loadTokens();
  if (!tokens) throw new Error('Not authorized yet.');
  const url = new URL(`https://api.twitch.tv/helix/${path}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const doFetch = (token) =>
    fetch(url, {
      method,
      headers: {
        'Client-Id': config.clientId,
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  let res = await doFetch(tokens.accessToken);
  if (res.status === 401) {
    const fresh = await refresh();
    res = await doFetch(fresh.accessToken);
  }
  return res;
}
