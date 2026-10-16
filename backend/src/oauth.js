import { createHash, randomBytes } from 'node:crypto';
import { config } from './config.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import { supabase } from './supabase.js';

const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map();
const pendingMetaAccounts = new Map();

export class OAuthFlowError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'OAuthFlowError';
    this.statusCode = statusCode;
  }
}

const oauthSettings = {
  facebook: {
    provider: 'meta',
    configured: () => Boolean(config.metaAppId && config.metaAppSecret),
    callbackPlatform: 'facebook'
  },
  instagram: {
    provider: 'meta',
    configured: () => Boolean(config.metaAppId && config.metaAppSecret),
    callbackPlatform: 'facebook'
  },
  x: {
    provider: 'x',
    configured: () => Boolean(config.xClientId && config.xClientSecret)
  },
  tiktok: {
    provider: 'tiktok',
    configured: () => Boolean(config.tiktokClientKey && config.tiktokClientSecret)
  }
};

function callbackUri(platform) {
  return `${config.publicBaseUrl}/api/oauth/${platform}/callback`;
}

function cleanupExpired() {
  const now = Date.now();
  for (const [state, record] of pendingStates) {
    if (record.expiresAt <= now) pendingStates.delete(state);
  }
  for (const [userId, record] of pendingMetaAccounts) {
    if (record.expiresAt <= now) pendingMetaAccounts.delete(userId);
  }
}

const cleanupTimer = setInterval(cleanupExpired, 60_000);
cleanupTimer.unref();

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

function createPkcePair() {
  const verifier = randomToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function providerFor(platform) {
  const settings = oauthSettings[platform];
  if (!settings) throw new OAuthFlowError('Unsupported OAuth platform.', 404);
  if (!settings.configured()) {
    throw new OAuthFlowError(`OAuth is not configured for ${platform}. Set the provider application credentials on the server.`, 503);
  }
  return settings.provider;
}

export function getOAuthProviderStatus() {
  return Object.fromEntries(Object.entries(oauthSettings).map(([platform, settings]) => [
    platform,
    { configured: settings.configured(), callbackUrl: callbackUri(settings.callbackPlatform || platform) }
  ]));
}

export function beginOAuth(platform, userId) {
  cleanupExpired();
  const provider = providerFor(platform);
  const state = randomToken();
  const record = {
    userId,
    platform,
    provider,
    callbackPlatform: provider === 'meta' ? 'facebook' : platform,
    expiresAt: Date.now() + STATE_TTL_MS
  };
  const authorizeUrl = new URL(
    provider === 'meta'
      ? `https://www.facebook.com/${config.metaGraphApiVersion}/dialog/oauth`
      : provider === 'x'
        ? 'https://x.com/i/oauth2/authorize'
        : 'https://www.tiktok.com/v2/auth/authorize/'
  );

  if (provider === 'meta') {
    authorizeUrl.search = new URLSearchParams({
      client_id: config.metaAppId,
      redirect_uri: callbackUri('facebook'),
      response_type: 'code',
      scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish',
      state
    }).toString();
  } else if (provider === 'x') {
    const pkce = createPkcePair();
    record.codeVerifier = pkce.verifier;
    authorizeUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.xClientId,
      redirect_uri: callbackUri('x'),
      scope: 'users.read tweet.write offline.access',
      state,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256'
    }).toString();
  } else {
    authorizeUrl.search = new URLSearchParams({
      client_key: config.tiktokClientKey,
      response_type: 'code',
      scope: 'user.info.basic,video.publish',
      redirect_uri: callbackUri('tiktok'),
      state
    }).toString();
  }

  pendingStates.set(state, record);
  return { authorizeUrl: authorizeUrl.toString() };
}

function takeOAuthState(state, platform) {
  cleanupExpired();
  if (typeof state !== 'string' || !state) throw new OAuthFlowError('OAuth state is missing or invalid. Start the connection again.');
  const record = pendingStates.get(state);
  pendingStates.delete(state);
  if (!record || record.callbackPlatform !== platform || record.expiresAt <= Date.now()) {
    throw new OAuthFlowError('OAuth session expired or does not match. Start the connection again.', 410);
  }
  return record;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body.error && body.error !== 'ok' && body.error?.code !== 'ok') || body.data?.error) {
    const providerError = body.error_description || body.error?.message || body.message || body.data?.error?.message;
    throw new Error(providerError || `OAuth provider request failed (${response.status}).`);
  }
  return body;
}

function formRequest(values, headers = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(values).toString()
  };
}

function expiryFromSeconds(seconds) {
  const numeric = Number(seconds);
  return Number.isFinite(numeric) && numeric > 0
    ? new Date(Date.now() + numeric * 1000).toISOString()
    : null;
}

function requireGrantedScope(token, scope, provider) {
  const scopes = String(token.scope || '').split(/[,\s]+/).filter(Boolean);
  if (!scopes.includes(scope)) {
    throw new OAuthFlowError(`${provider} did not grant the ${scope} permission required for publishing.`);
  }
}

async function saveAccount({ platform, accountId, displayName, accessToken, refreshToken, metadata }) {
  const { error } = await supabase.from('social_accounts').upsert({
    platform,
    account_id: accountId,
    display_name: displayName,
    access_token_enc: encryptSecret(accessToken),
    secret_enc: refreshToken ? encryptSecret(refreshToken) : null,
    metadata: { ...metadata, oauth_provider: platform === 'facebook' || platform === 'instagram' ? 'meta' : platform },
    updated_at: new Date().toISOString()
  }, { onConflict: 'platform,account_id' });
  if (error) throw error;
}

async function exchangeMetaCode(code) {
  const url = new URL(`https://graph.facebook.com/${config.metaGraphApiVersion}/oauth/access_token`);
  url.search = new URLSearchParams({
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    redirect_uri: callbackUri('facebook'),
    code
  }).toString();
  const shortLived = await requestJson(url);
  const longUrl = new URL(`https://graph.facebook.com/${config.metaGraphApiVersion}/oauth/access_token`);
  longUrl.search = new URLSearchParams({
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    grant_type: 'fb_exchange_token',
    fb_exchange_token: shortLived.access_token
  }).toString();
  return requestJson(longUrl);
}

async function completeMetaOAuth(userId, code) {
  const token = await exchangeMetaCode(code);
  if (!token.access_token) throw new Error('Meta did not return an access token.');
  const pagesUrl = new URL(`https://graph.facebook.com/${config.metaGraphApiVersion}/me/accounts`);
  pagesUrl.search = new URLSearchParams({
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    limit: '100',
    access_token: token.access_token
  }).toString();
  const pagesResponse = await requestJson(pagesUrl);
  const pages = (pagesResponse.data || [])
    .filter((page) => page.id && page.access_token)
    .map((page) => ({
      id: page.id,
      name: page.name || page.id,
      accessToken: page.access_token,
      instagram: page.instagram_business_account?.id
        ? { id: page.instagram_business_account.id, username: page.instagram_business_account.username || '' }
        : null
    }));
  if (!pages.length) {
    throw new Error('No Facebook Pages were found. Grant Page access to the Facebook account and try again.');
  }
  pendingMetaAccounts.set(userId, {
    pages,
    expiresAt: Date.now() + STATE_TTL_MS
  });
  return { pendingSelection: true };
}

async function completeXOAuth(code, state) {
  const headers = {
    authorization: `Basic ${Buffer.from(`${config.xClientId}:${config.xClientSecret}`).toString('base64')}`
  };
  const token = await requestJson('https://api.x.com/2/oauth2/token', formRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUri('x'),
    code_verifier: state.codeVerifier
  }, headers));
  if (!token.access_token) throw new Error('X did not return an access token.');
  requireGrantedScope(token, 'tweet.write', 'X');
  const profile = await requestJson('https://api.x.com/2/users/me?user.fields=name,username', {
    headers: { authorization: `Bearer ${token.access_token}` }
  });
  const user = profile.data;
  if (!user?.id) throw new Error('X did not return the authorized account profile.');
  await saveAccount({
    platform: 'x',
    accountId: user.id,
    displayName: user.name || user.username || user.id,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    metadata: { username: user.username || '', expires_at: expiryFromSeconds(token.expires_in), scopes: token.scope || '' }
  });
  return { pendingSelection: false };
}

async function completeTikTokOAuth(code) {
  const token = await requestJson('https://open.tiktokapis.com/v2/oauth/token/', formRequest({
    client_key: config.tiktokClientKey,
    client_secret: config.tiktokClientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: callbackUri('tiktok')
  }));
  if (!token.access_token || !token.open_id) throw new Error('TikTok did not return the authorized account credentials.');
  requireGrantedScope(token, 'video.publish', 'TikTok');
  const profile = await requestJson(
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name',
    { headers: { authorization: `Bearer ${token.access_token}` } }
  );
  const user = profile.data?.user;
  if (!user?.open_id) throw new Error('TikTok did not return the authorized account profile.');
  await saveAccount({
    platform: 'tiktok',
    accountId: user.open_id,
    displayName: user.display_name || user.open_id,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    metadata: {
      privacy_level: 'SELF_ONLY',
      expires_at: expiryFromSeconds(token.expires_in),
      refresh_expires_at: expiryFromSeconds(token.refresh_expires_in),
      scopes: token.scope || ''
    }
  });
  return { pendingSelection: false };
}

export async function completeOAuthCallback(platform, query) {
  const state = takeOAuthState(query.state, platform);
  if (query.error) throw new Error('Authorization was cancelled or denied by the platform.');
  if (typeof query.code !== 'string' || !query.code) throw new Error('The platform did not return an authorization code.');
  if (state.provider === 'meta') return completeMetaOAuth(state.userId, query.code);
  if (state.provider === 'x') return completeXOAuth(query.code, state);
  return completeTikTokOAuth(query.code);
}

export function getPendingMetaPages(userId) {
  cleanupExpired();
  const pending = pendingMetaAccounts.get(userId);
  if (!pending) return [];
  return pending.pages.map(({ id, name, instagram }) => ({ id, name, instagram }));
}

export async function completeMetaPageSelection(userId, pageId, platforms) {
  cleanupExpired();
  const pending = pendingMetaAccounts.get(userId);
  if (!pending) throw new OAuthFlowError('The Meta account selection expired. Connect the account again.', 410);
  if (typeof pageId !== 'string' || !Array.isArray(platforms) || !platforms.length ||
      platforms.some((platform) => !['facebook', 'instagram'].includes(platform)) ||
      new Set(platforms).size !== platforms.length) {
    throw new OAuthFlowError('Choose a valid Facebook Page and one or more supported destinations.');
  }
  const page = pending.pages.find((item) => item.id === pageId);
  if (!page) throw new OAuthFlowError('That Facebook Page is not part of this authorization.');
  if (platforms.includes('instagram') && !page.instagram) {
    throw new OAuthFlowError('The selected Facebook Page is not linked to a professional Instagram account.');
  }
  for (const platform of platforms) {
    await saveAccount({
      platform,
      accountId: platform === 'instagram' ? page.instagram.id : page.id,
      displayName: platform === 'instagram'
        ? (page.instagram.username ? `@${page.instagram.username}` : `${page.name} · Instagram`)
        : page.name,
      accessToken: page.accessToken,
      metadata: platform === 'instagram' ? { page_id: page.id } : {}
    });
  }
  pendingMetaAccounts.delete(userId);
  return { connected: platforms };
}

export async function refreshOAuthAccount(account) {
  const provider = account.metadata?.oauth_provider;
  const expiresAt = Date.parse(account.metadata?.expires_at || '');
  if (!provider || !Number.isFinite(expiresAt) || expiresAt > Date.now() + 5 * 60 * 1000) return account;
  if (!account.secret_enc) {
    throw new Error(`${provider} access token expired. Reconnect this account from Settings.`);
  }
  const refreshToken = decryptSecret(account.secret_enc);
  let token;
  if (provider === 'x') {
    token = await requestJson('https://api.x.com/2/oauth2/token', formRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.xClientId
    }, {
      authorization: `Basic ${Buffer.from(`${config.xClientId}:${config.xClientSecret}`).toString('base64')}`
    }));
  } else if (provider === 'tiktok') {
    token = await requestJson('https://open.tiktokapis.com/v2/oauth/token/', formRequest({
      client_key: config.tiktokClientKey,
      client_secret: config.tiktokClientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }));
  } else {
    return account;
  }
  if (!token.access_token) throw new Error(`${provider} did not return a refreshed access token. Reconnect this account.`);

  const metadata = {
    ...account.metadata,
    expires_at: expiryFromSeconds(token.expires_in),
    ...(token.refresh_expires_in ? { refresh_expires_at: expiryFromSeconds(token.refresh_expires_in) } : {}),
    ...(token.scope ? { scopes: token.scope } : {})
  };
  const accessTokenEnc = encryptSecret(token.access_token);
  const refreshTokenEnc = token.refresh_token ? encryptSecret(token.refresh_token) : account.secret_enc;
  const { error } = await supabase.from('social_accounts').update({
    access_token_enc: accessTokenEnc,
    secret_enc: refreshTokenEnc,
    metadata,
    updated_at: new Date().toISOString()
  }).eq('id', account.id);
  if (error) throw error;
  return {
    ...account,
    access_token_enc: accessTokenEnc,
    secret_enc: refreshTokenEnc,
    metadata
  };
}
