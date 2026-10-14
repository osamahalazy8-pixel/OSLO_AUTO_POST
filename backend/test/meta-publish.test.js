import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
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

function mockMetaResponses(t, responses = [{ id: 'container-id' }, { id: 'published-post-id' }]) {
  const requests = [];
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

test('publishes Instagram image carousels through child containers and a parent container', async (t) => {
  const requests = mockMetaResponses(t, [
    { id: 'first-child' },
    { id: 'second-child' },
    { id: 'carousel-container' },
    { id: 'published-carousel' }
  ]);

  const result = await publishToPlatform(
    'instagram',
    createAccount('instagram-account-id'),
    'Carousel caption',
    [
      { url: 'https://media.example/first.jpg', mimeType: 'image/jpeg' },
      { url: 'https://media.example/second.jpg', mimeType: 'image/jpeg' }
    ]
  );

  assert.equal(result, 'published-carousel');
  assert.equal(requests.length, 4);
  assertFormRequest(requests[0], '/v22.0/instagram-account-id/media', {
    image_url: 'https://media.example/first.jpg',
    is_carousel_item: 'true'
  });
  assertFormRequest(requests[1], '/v22.0/instagram-account-id/media', {
    image_url: 'https://media.example/second.jpg',
    is_carousel_item: 'true'
  });
  assertFormRequest(requests[2], '/v22.0/instagram-account-id/media', {
    media_type: 'CAROUSEL',
    children: 'first-child,second-child',
    caption: 'Carousel caption'
  });
  assertFormRequest(requests[3], '/v22.0/instagram-account-id/media_publish', {
    creation_id: 'carousel-container'
  });
});

test('publishes Facebook photo albums and preserves attachment order', async (t) => {
  const requests = mockMetaResponses(t, [
    { id: 'first-photo' },
    { id: 'second-photo' },
    { id: 'album-post' }
  ]);

  const result = await publishToPlatform(
    'facebook',
    createAccount('facebook-page-id'),
    'Album caption',
    [
      { url: 'https://media.example/first.jpg', mimeType: 'image/jpeg' },
      { url: 'https://media.example/second.jpg', mimeType: 'image/jpeg' }
    ]
  );

  assert.equal(result, 'album-post');
  assert.equal(requests.length, 3);
  assertFormRequest(requests[0], '/v22.0/facebook-page-id/photos', {
    url: 'https://media.example/first.jpg',
    published: 'false'
  });
  assertFormRequest(requests[1], '/v22.0/facebook-page-id/photos', {
    url: 'https://media.example/second.jpg',
    published: 'false'
  });
  assertFormRequest(requests[2], '/v22.0/facebook-page-id/feed', {
    message: 'Album caption',
    'attached_media[0]': '{"media_fbid":"first-photo"}',
    'attached_media[1]': '{"media_fbid":"second-photo"}'
  });
});
