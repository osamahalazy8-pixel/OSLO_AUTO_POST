import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.ENCRYPTION_KEY = 'test-encryption-passphrase';
process.env.META_APP_ID = 'test-meta-app-id';
process.env.META_APP_SECRET = 'test-meta-app-secret';
process.env.X_CLIENT_ID = 'test-x-client-id';
process.env.X_CLIENT_SECRET = 'test-x-client-secret';
process.env.TIKTOK_CLIENT_KEY = 'test-tiktok-client-key';
process.env.TIKTOK_CLIENT_SECRET = 'test-tiktok-client-secret';

const { decryptSecret, encryptSecret } = await import('../src/crypto.js');
const { supabase } = await import('../src/supabase.js');
const {
  beginOAuth,
  completeMetaPageSelection,
  completeOAuthCallback,
  getOAuthProviderStatus,
  getPendingMetaPages,
  refreshOAuthAccount
} = await import('../src/oauth.js');

function mockJsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function mockAccountUpsert(t, records) {
  t.mock.method(supabase, 'from', () => ({
    upsert: async (record) => {
      records.push(record);
      return { error: null };
    }
  }));
}

test('exposes OAuth readiness and starts X authorization with PKCE and CSRF state', () => {
  const providers = getOAuthProviderStatus();
  assert.equal(providers.facebook.configured, true);
  assert.equal(providers.instagram.callbackUrl, providers.facebook.callbackUrl);
  assert.equal(providers.x.configured, true);
  assert.equal(providers.tiktok.configured, true);

  const { authorizeUrl } = beginOAuth('x', 'owner-id');
  const url = new URL(authorizeUrl);
  assert.equal(url.origin, 'https://x.com');
  assert.equal(url.searchParams.get('client_id'), 'test-x-client-id');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3001/api/oauth/x/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.match(url.searchParams.get('state'), /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(url.searchParams.get('scope').split(' ').sort(), ['offline.access', 'tweet.write', 'users.read']);
});

test('exchanges X authorization, stores encrypted credentials, and consumes state once', async (t) => {
  const requests = [];
  const records = [];
  mockAccountUpsert(t, records);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/oauth2/token')) {
      return mockJsonResponse({
        access_token: 'x-access-token',
        refresh_token: 'x-refresh-token',
        expires_in: 7200,
        scope: 'users.read tweet.write offline.access'
      });
    }
    return mockJsonResponse({ data: { id: 'x-user-id', name: 'Creator', username: 'creator' } });
  });

  const { authorizeUrl } = beginOAuth('x', 'owner-id');
  const state = new URL(authorizeUrl).searchParams.get('state');
  const result = await completeOAuthCallback('x', { state, code: 'authorization-code' });
  assert.deepEqual(result, { pendingSelection: false });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers.authorization, `Basic ${Buffer.from('test-x-client-id:test-x-client-secret').toString('base64')}`);
  assert.equal(new URLSearchParams(requests[0].options.body).get('code'), 'authorization-code');
  assert.equal(requests[1].options.headers.authorization, 'Bearer x-access-token');
  assert.equal(records.length, 1);
  assert.equal(records[0].platform, 'x');
  assert.equal(records[0].account_id, 'x-user-id');
  assert.equal(decryptSecret(records[0].access_token_enc), 'x-access-token');
  assert.equal(decryptSecret(records[0].secret_enc), 'x-refresh-token');
  assert.equal(records[0].metadata.oauth_provider, 'x');
  await assert.rejects(completeOAuthCallback('x', { state, code: 'replayed-code' }), /expired or does not match/);
});

test('lets the workspace owner choose a Meta Page and linked Instagram account', async (t) => {
  const requests = [];
  const records = [];
  mockAccountUpsert(t, records);
  const responses = [
    { access_token: 'short-user-token', expires_in: 3600 },
    { access_token: 'long-user-token', expires_in: 5184000 },
    {
      data: [{
        id: 'page-1',
        name: 'Store Page',
        access_token: 'page-token',
        instagram_business_account: { id: 'instagram-1', username: 'store' }
      }]
    }
  ];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url: String(url), options });
    return mockJsonResponse(responses.shift());
  });

  const { authorizeUrl } = beginOAuth('instagram', 'owner-id');
  const state = new URL(authorizeUrl).searchParams.get('state');
  const result = await completeOAuthCallback('facebook', { state, code: 'meta-code' });
  assert.deepEqual(result, { pendingSelection: true });
  assert.equal(requests.length, 3);
  assert.equal(new URL(requests[0].url).searchParams.get('client_secret'), 'test-meta-app-secret');
  assert.match(new URL(requests[1].url).searchParams.get('fb_exchange_token'), /short-user-token/);
  assert.equal(getPendingMetaPages('other-user').length, 0);
  assert.deepEqual(getPendingMetaPages('owner-id'), [{
    id: 'page-1',
    name: 'Store Page',
    instagram: { id: 'instagram-1', username: 'store' }
  }]);

  const selection = await completeMetaPageSelection('owner-id', 'page-1', ['facebook', 'instagram']);
  assert.deepEqual(selection, { connected: ['facebook', 'instagram'] });
  assert.deepEqual(records.map((record) => [record.platform, record.account_id]), [
    ['facebook', 'page-1'],
    ['instagram', 'instagram-1']
  ]);
  assert.equal(decryptSecret(records[0].access_token_enc), 'page-token');
  assert.equal(decryptSecret(records[1].access_token_enc), 'page-token');
  assert.equal(records[1].metadata.oauth_provider, 'meta');
  assert.equal(getPendingMetaPages('owner-id').length, 0);
});

test('connects TikTok through Login Kit and stores the approved publishing token', async (t) => {
  const requests = [];
  const records = [];
  mockAccountUpsert(t, records);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/oauth/token/')) {
      return mockJsonResponse({
        access_token: 'tiktok-access-token',
        refresh_token: 'tiktok-refresh-token',
        expires_in: 86400,
        refresh_expires_in: 31536000,
        open_id: 'tiktok-user-id',
        scope: 'user.info.basic,video.publish'
      });
    }
    return mockJsonResponse({
      data: { user: { open_id: 'tiktok-user-id', display_name: 'TikTok Creator' } },
      error: { code: 'ok', message: 'success' }
    });
  });

  const { authorizeUrl } = beginOAuth('tiktok', 'owner-id');
  const authorization = new URL(authorizeUrl);
  assert.equal(authorization.origin, 'https://www.tiktok.com');
  assert.equal(authorization.searchParams.get('client_key'), 'test-tiktok-client-key');
  assert.deepEqual(authorization.searchParams.get('scope').split(',').sort(), ['user.info.basic', 'video.publish']);
  const result = await completeOAuthCallback('tiktok', {
    state: authorization.searchParams.get('state'),
    code: 'tiktok-code'
  });

  assert.deepEqual(result, { pendingSelection: false });
  assert.equal(requests.length, 2);
  assert.equal(new URLSearchParams(requests[0].options.body).get('client_secret'), 'test-tiktok-client-secret');
  assert.equal(requests[1].options.headers.authorization, 'Bearer tiktok-access-token');
  assert.equal(records[0].platform, 'tiktok');
  assert.equal(records[0].account_id, 'tiktok-user-id');
  assert.equal(decryptSecret(records[0].access_token_enc), 'tiktok-access-token');
  assert.equal(decryptSecret(records[0].secret_enc), 'tiktok-refresh-token');
  assert.equal(records[0].metadata.privacy_level, 'SELF_ONLY');
});

test('refreshes expired X tokens and rotates the encrypted refresh credential', async (t) => {
  let update;
  t.mock.method(supabase, 'from', () => ({
    update: (values) => {
      update = values;
      return { eq: async () => ({ error: null }) };
    }
  }));
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(new URLSearchParams(options.body).get('refresh_token'), 'old-refresh-token');
    return mockJsonResponse({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 7200,
      scope: 'users.read tweet.write offline.access'
    });
  });

  const account = {
    id: 'account-id',
    access_token_enc: encryptSecret('expired-access-token'),
    secret_enc: encryptSecret('old-refresh-token'),
    metadata: { oauth_provider: 'x', expires_at: new Date(Date.now() - 1000).toISOString() }
  };
  const refreshed = await refreshOAuthAccount(account);
  assert.equal(decryptSecret(refreshed.access_token_enc), 'new-access-token');
  assert.equal(decryptSecret(refreshed.secret_enc), 'new-refresh-token');
  assert.equal(decryptSecret(update.access_token_enc), 'new-access-token');
  assert.equal(update.metadata.oauth_provider, 'x');
  assert.ok(Date.parse(update.metadata.expires_at) > Date.now());
});

test('refreshes TikTok credentials using the stored refresh token', async (t) => {
  let update;
  t.mock.method(supabase, 'from', () => ({
    update: (values) => {
      update = values;
      return { eq: async () => ({ error: null }) };
    }
  }));
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('grant_type'), 'refresh_token');
    assert.equal(body.get('refresh_token'), 'old-tiktok-refresh-token');
    return mockJsonResponse({
      access_token: 'new-tiktok-access-token',
      refresh_token: 'rotated-tiktok-refresh-token',
      expires_in: 86400,
      refresh_expires_in: 31536000
    });
  });

  const account = {
    id: 'tiktok-account-id',
    access_token_enc: encryptSecret('expired-tiktok-token'),
    secret_enc: encryptSecret('old-tiktok-refresh-token'),
    metadata: { oauth_provider: 'tiktok', expires_at: new Date(Date.now() - 1000).toISOString() }
  };
  const refreshed = await refreshOAuthAccount(account);
  assert.equal(decryptSecret(refreshed.access_token_enc), 'new-tiktok-access-token');
  assert.equal(decryptSecret(refreshed.secret_enc), 'rotated-tiktok-refresh-token');
  assert.equal(decryptSecret(update.access_token_enc), 'new-tiktok-access-token');
});
