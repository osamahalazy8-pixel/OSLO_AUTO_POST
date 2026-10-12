import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { supabase } from './supabase.js';
import { encryptSecret } from './crypto.js';
import { MAX_UPLOAD_BYTES, PLATFORM_LIMITS, validatePost } from './platforms/limits.js';
import { startScheduler } from './scheduler.js';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 }
});
const validPlatforms = Object.keys(PLATFORM_LIMITS);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: config.nodeEnv === 'production' ? false : true
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/ping', (_req, res) => {
  res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/api/platforms', (_req, res) => {
  res.json(Object.entries(PLATFORM_LIMITS).map(([id, limits]) => ({
    id,
    label: limits.label,
    caption: limits.caption,
    imageMimeTypes: limits.imageMimeTypes,
    videoMimeTypes: limits.videoMimeTypes,
    maxImageBytes: limits.maxImageBytes || 0,
    maxVideoBytes: limits.maxVideoBytes || 0,
    maxUploadBytes: MAX_UPLOAD_BYTES,
    imageMinWidth: limits.imageMinWidth || null,
    imageMaxWidth: limits.imageMaxWidth || null,
    imageMinRatio: limits.imageMinRatio || null,
    imageMaxRatio: limits.imageMaxRatio || null,
    needsMedia: limits.needsMedia
  })));
});

app.get('/api/accounts', async (_req, res, next) => {
  const { data, error } = await supabase
    .from('social_accounts')
    .select('id, platform, account_id, display_name, metadata, created_at, updated_at')
    .order('platform');
  if (error) return next(error);
  res.json(data.map((account) => ({ ...account, connected: true })));
});

app.put('/api/accounts/:platform', async (req, res, next) => {
  const { platform } = req.params;
  const { accountId, displayName, accessToken, secret, metadata } = req.body || {};
  if (!validPlatforms.includes(platform)) return res.status(400).json({ error: 'Unsupported platform.' });
  if (typeof accountId !== 'string' || !accountId.trim()) {
    return res.status(400).json({ error: 'Account or Page ID is required.' });
  }
  if (typeof displayName !== 'string' || !displayName.trim()) {
    return res.status(400).json({ error: 'Display name is required.' });
  }
  if (accessToken !== undefined && (typeof accessToken !== 'string' || accessToken.length > 10000)) {
    return res.status(400).json({ error: 'Access token is invalid.' });
  }

  const { data: existing, error: findError } = await supabase
    .from('social_accounts')
    .select('id, access_token_enc, secret_enc')
    .eq('platform', platform)
    .eq('account_id', accountId.trim())
    .maybeSingle();
  if (findError) return next(findError);
  const tokenEncrypted = accessToken ? encryptSecret(accessToken) : existing?.access_token_enc;
  if (!tokenEncrypted) return res.status(400).json({ error: 'An access token is required for a new connection.' });

  const values = {
    platform,
    account_id: accountId.trim(),
    display_name: displayName.trim(),
    access_token_enc: tokenEncrypted,
    secret_enc: secret ? encryptSecret(secret) : (existing?.secret_enc || null),
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
    updated_at: new Date().toISOString()
  };
  const query = existing
    ? supabase.from('social_accounts').update(values).eq('id', existing.id)
    : supabase.from('social_accounts').insert(values);
  const { data, error } = await query
    .select('id, platform, account_id, display_name, metadata, created_at, updated_at')
    .single();
  if (error) return next(error);
  res.json({ ...data, connected: true });
});

app.delete('/api/accounts/:id', async (req, res, next) => {
  const { data: activeDeliveries, error: deliveriesError } = await supabase
    .from('post_deliveries')
    .select('id')
    .eq('account_id', req.params.id)
    .in('status', ['scheduled', 'publishing'])
    .limit(1);
  if (deliveriesError) return next(deliveriesError);
  if (activeDeliveries.length) {
    return res.status(409).json({ error: 'This account has scheduled or publishing posts. Cancel them before disconnecting.' });
  }
  const { error } = await supabase.from('social_accounts').delete().eq('id', req.params.id);
  if (error) return next(error);
  res.status(204).end();
});

app.post('/api/media', upload.single('media'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Select an image or video first.' });
  const allowedMimePrefix = /^(image\/|video\/)/;
  if (!allowedMimePrefix.test(req.file.mimetype)) {
    return res.status(415).json({ error: 'Only image and video files are accepted.' });
  }
  const extension = req.file.originalname.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0] || '';
  const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;
  const { error } = await supabase.storage
    .from(config.storageBucket)
    .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
  if (error) return next(error);
  res.status(201).json({
    path,
    mimeType: req.file.mimetype,
    size: req.file.size,
    originalName: req.file.originalname
  });
});

app.post('/api/posts', async (req, res, next) => {
  const { caption = '', media = null, platforms, scheduledAt } = req.body || {};
  const platformNames = Array.isArray(platforms) ? platforms : [];
  const mediaData = media && typeof media === 'object'
    ? { mimetype: media.mimeType, size: media.size, width: media.width, height: media.height }
    : null;
  const validationErrors = validatePost({ caption, file: mediaData, platforms: platformNames });
  if (validationErrors.length) return res.status(400).json({ error: validationErrors.join(' '), details: validationErrors });

  const date = new Date(scheduledAt);
  if (!scheduledAt || Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 30_000) {
    return res.status(400).json({ error: 'Schedule time must be at least 30 seconds in the future.' });
  }
  const uniquePlatforms = [...new Set(platformNames)];
  if (uniquePlatforms.length !== platformNames.length) {
    return res.status(400).json({ error: 'Duplicate platforms are not allowed.' });
  }

  const { data: accounts, error: accountError } = await supabase
    .from('social_accounts')
    .select('id, platform')
    .in('platform', uniquePlatforms);
  if (accountError) return next(accountError);
  const accountByPlatform = new Map((accounts || []).map((account) => [account.platform, account]));
  const missing = uniquePlatforms.filter((platform) => !accountByPlatform.has(platform));
  if (missing.length) return res.status(400).json({ error: `Connect these platforms first: ${missing.join(', ')}.` });

  if (media?.path && (typeof media.path !== 'string' || media.path.includes('..') || media.path.startsWith('/'))) {
    return res.status(400).json({ error: 'Media path is invalid.' });
  }
  if (media && typeof media.path !== 'string') {
    return res.status(400).json({ error: 'Uploaded media path is required.' });
  }

  const { data: post, error: insertError } = await supabase
    .from('scheduled_posts')
    .insert({
      caption,
      media_path: media?.path || null,
      media_mime_type: media?.mimeType || null,
      media_size_bytes: media?.size || null,
      media_width: media?.width || null,
      media_height: media?.height || null,
      scheduled_at: date.toISOString(),
      status: 'scheduled'
    })
    .select()
    .single();
  if (insertError) return next(insertError);

  const { error: deliveryError } = await supabase.from('post_deliveries').insert(uniquePlatforms.map((platform) => ({
    post_id: post.id,
    account_id: accountByPlatform.get(platform).id,
    platform,
    scheduled_at: date.toISOString(),
    status: 'scheduled'
  })));
  if (deliveryError) {
    const { error: cleanupError } = await supabase.from('scheduled_posts').delete().eq('id', post.id);
    if (cleanupError) console.error('Could not clean up post after delivery insert failure:', cleanupError.message);
    return next(deliveryError);
  }
  res.status(201).json(post);
});

app.get('/api/posts', async (_req, res, next) => {
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('id, caption, media_path, media_mime_type, media_size_bytes, media_width, media_height, scheduled_at, status, created_at, updated_at, post_deliveries(id, platform, status, platform_post_id, error_message, published_at)')
    .order('scheduled_at', { ascending: false })
    .limit(100);
  if (error) return next(error);
  res.json(data);
});

app.delete('/api/posts/:id', async (req, res, next) => {
  const { data: post, error: findError } = await supabase
    .from('scheduled_posts')
    .select('id, media_path, status')
    .eq('id', req.params.id)
    .maybeSingle();
  if (findError) return next(findError);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  if (!['scheduled', 'failed'].includes(post.status)) {
    return res.status(409).json({ error: 'Only scheduled or failed posts can be deleted.' });
  }
  const { data: deliveries, error: deliveriesError } = await supabase
    .from('post_deliveries')
    .select('status')
    .eq('post_id', post.id);
  if (deliveriesError) return next(deliveriesError);
  if ((deliveries || []).some((delivery) => ['published', 'publishing'].includes(delivery.status))) {
    return res.status(409).json({ error: 'This post has a published or active delivery and cannot be deleted from the history.' });
  }
  const { error } = await supabase.from('scheduled_posts').delete().eq('id', post.id);
  if (error) return next(error);
  if (post.media_path) {
    const { error: storageError } = await supabase.storage.from(config.storageBucket).remove([post.media_path]);
    if (storageError) console.error('Could not remove post media:', storageError.message);
  }
  res.status(204).end();
});

if (config.nodeEnv === 'production') {
  const clientDist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(fileURLToPath(new URL('../../frontend/dist/index.html', import.meta.url))));
  }
}

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB server upload limit.` });
  }
  res.status(500).json({
    error: config.nodeEnv === 'production' ? 'Unexpected server error.' : error.message
  });
});

app.listen(config.port, () => {
  console.info(`OSLO_AUTO_POST API listening on port ${config.port}.`);
  startScheduler();
});
