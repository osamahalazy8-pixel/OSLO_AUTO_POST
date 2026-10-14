import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.ENCRYPTION_KEY = 'test-encryption-passphrase';

const { encryptSecret } = await import('../src/crypto.js');
const { publishToPlatform } = await import('../src/platforms/publish.js');

function createAccount(accountId) {
  return {
    account_id: accountId,
    access_token_enc: encryptSecret('test-meta-access-token')
  };
}

function mockMetaResponses(t) {
  const requests = [];
  const responses = [{ id: 'container-id' }, { id: 'published-post-id' }];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => responses.shift()
    };
  });
  return requests;
}

function assertFormRequest(request, expectedEndpoint, expectedParams) {
  assert.ok(request.url.endsWith(expectedEndpoint));
  assert.equal(request.options.headers['content-type'], 'application/x-www-form-urlencoded');
  const params = new URLSearchParams(request.options.body);
  for (const [key, value] of Object.entries(expectedParams)) {
    assert.equal(params.get(key), value);
  }
  assert.equal(params.get('access_token'), 'test-meta-access-token');
}

test('publishes Instagram images with form-encoded Graph API requests', async (t) => {
  const requests = mockMetaResponses(t);

  const result = await publishToPlatform(
    'instagram',
    createAccount('instagram-account-id'),
    'A caption',
    'https://media.example/image.jpg',
    'image/jpeg'
  );

  assert.equal(result, 'published-post-id');
  assert.equal(requests.length, 2);
  assertFormRequest(requests[0], '/v22.0/instagram-account-id/media', {
    image_url: 'https://media.example/image.jpg',
    caption: 'A caption'
  });
  assertFormRequest(requests[1], '/v22.0/instagram-account-id/media_publish', {
    creation_id: 'container-id'
  });
});

test('publishes Facebook text posts with a form-encoded Graph API request', async (t) => {
  const requests = mockMetaResponses(t);

  const result = await publishToPlatform(
    'facebook',
    createAccount('facebook-page-id'),
    'A caption',
    null,
    ''
  );

  assert.equal(result, 'container-id');
  assert.equal(requests.length, 1);
  assertFormRequest(requests[0], '/v22.0/facebook-page-id/feed', {
    message: 'A caption'
  });
});
