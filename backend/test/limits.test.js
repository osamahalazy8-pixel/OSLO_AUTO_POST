import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MEDIA_FILES, MAX_UPLOAD_BYTES, PLATFORM_LIMITS, validateMediaSelection, validatePost } from '../src/platforms/limits.js';

test('requires at least one supported social platform', () => {
  assert.deepEqual(validatePost({ caption: '', platforms: [], file: null }), ['Choose at least one platform.']);
});

test('validates required Instagram media and caption length', () => {
  const result = validatePost({
    caption: 'x'.repeat(2201),
    platforms: ['instagram'],
    file: null
  });
  assert.ok(result.includes('Instagram caption must be at most 2200 characters.'));
  assert.ok(result.includes('Instagram requires media.'));
});

test('validates the supported Instagram image dimensions', () => {
  const errors = validatePost({
    caption: 'Hello',
    platforms: ['instagram'],
    file: { mimetype: 'image/jpeg', size: 1000, width: 200, height: 500 }
  });
  assert.ok(errors.some((message) => message.includes('width must be between 320 and 1440')));
  assert.ok(errors.some((message) => message.includes('aspect ratio must be between 4:5 and 1.91:1')));
});

test('rejects media for text-only X publishing and enforces the deployment upload cap', () => {
  const file = { mimetype: 'image/png', size: MAX_UPLOAD_BYTES + 1 };
  const errors = validatePost({ caption: 'Hello', platforms: ['x'], file });
  assert.ok(errors.some((message) => message.includes('100 MB in this deployment')));
  assert.ok(errors.some((message) => message.includes('X does not support image/png')));
});

test('defines explicit baseline limits for every supported integration', () => {
  assert.deepEqual(Object.keys(PLATFORM_LIMITS).sort(), ['facebook', 'instagram', 'tiktok', 'x']);
});

test('accepts image carousels for Instagram and Facebook while enforcing platform media rules', () => {
  const photos = Array.from({ length: 3 }, () => ({ mimetype: 'image/jpeg' }));
  assert.deepEqual(validateMediaSelection(photos, ['instagram', 'facebook']), []);
  assert.ok(validateMediaSelection(photos, ['x']).some((message) => message.includes('text posts only')));
  assert.ok(validateMediaSelection(photos, ['tiktok']).some((message) => message.includes('exactly one video')));
  assert.ok(validateMediaSelection([{ mimetype: 'video/mp4' }, { mimetype: 'video/mp4' }], ['facebook'])
    .some((message) => message.includes('one video')));
});

test('validates each platform-specific transformed media variant', () => {
  const media = [{
    mimeType: 'image/png',
    size: 1000,
    variants: {
      instagram: { mimetype: 'image/jpeg', size: 900, width: 1080, height: 1350 },
      facebook: { mimetype: 'image/jpeg', size: 950, width: 1200, height: 900 }
    }
  }];
  assert.deepEqual(validatePost({ caption: 'Hello', files: media, platforms: ['instagram', 'facebook'] }), []);
  assert.ok(MAX_MEDIA_FILES >= 10);
});
