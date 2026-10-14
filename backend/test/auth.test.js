import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.ENCRYPTION_KEY = 'test-encryption-passphrase';

const {
  clearSessionCookies,
  readCookie,
  requireActive,
  requireRoles,
  setSessionCookies
} = await import('../src/auth.js');

function createResponse() {
  const headers = new Map();
  return {
    statusCode: null,
    body: null,
    setHeader(name, value) { headers.set(name, value); },
    getHeader(name) { return headers.get(name); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    headers
  };
}

test('reads named cookies and safely rejects malformed values', () => {
  assert.equal(readCookie({ headers: { cookie: 'theme=dark; oslo_access=access%20token' } }, 'oslo_access'), 'access token');
  assert.equal(readCookie({ headers: { cookie: 'oslo_access=%E0%A4%A' } }, 'oslo_access'), null);
  assert.equal(readCookie({ headers: {} }, 'oslo_access'), null);
});

test('stores access and refresh tokens only in secure HTTP-only cookies in production', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const response = createResponse();
    setSessionCookies(response, {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600
    });
    const cookies = response.getHeader('Set-Cookie');
    assert.equal(cookies.length, 2);
    assert.ok(cookies.every((cookie) => cookie.includes('HttpOnly') && cookie.includes('Secure') && cookie.includes('SameSite=Strict')));
    assert.ok(cookies[0].startsWith('oslo_access='));
    assert.ok(cookies[1].startsWith('oslo_refresh='));
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test('clears both session cookies on logout', () => {
  const response = createResponse();
  clearSessionCookies(response);
  const cookies = response.getHeader('Set-Cookie');
  assert.equal(cookies.length, 2);
  assert.ok(cookies.every((cookie) => cookie.includes('Max-Age=0')));
});

test('blocks pending users from protected workspace operations', () => {
  const response = createResponse();
  let continued = false;
  requireActive({ profile: { status: 'pending' } }, response, () => { continued = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(continued, false);
});

test('restricts role-gated operations to the configured roles', () => {
  const response = createResponse();
  let continued = false;
  requireRoles('owner', 'admin')({ profile: { role: 'editor' } }, response, () => { continued = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(continued, false);

  requireRoles('owner', 'admin')({ profile: { role: 'admin' } }, response, () => { continued = true; });
  assert.equal(continued, true);
});
