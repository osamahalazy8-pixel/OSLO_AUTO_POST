import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { authClient, supabase } from './supabase.js';
import { authenticate, clearSessionCookies, requireActive, requireRoles, ROLES, setSessionCookies } from './auth.js';
import { encryptSecret } from './crypto.js';
import { MAX_MEDIA_FILES, MAX_TOTAL_UPLOAD_BYTES, MAX_UPLOAD_BYTES, PLATFORM_LIMITS, validateMediaSelection, validatePost } from './platforms/limits.js';
import { MediaProcessingError, transformMedia } from './media.js';
import { beginOAuth, completeMetaPageSelection, completeOAuthCallback, getOAuthProviderStatus, getPendingMetaPages, OAuthFlowError } from './oauth.js';
import { startScheduler } from './scheduler.js';

const app = express();
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, _file, callback) => callback(null, `${randomUUID()}.upload`)
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_MEDIA_FILES, fields: 2, fieldSize: 1024 }
});
const validPlatforms = Object.keys(PLATFORM_LIMITS);
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function receiveMediaFiles(req, res, next) {
  upload.array('media', MAX_MEDIA_FILES)(req, res, (error) => {
    if (error) {
      void removeTemporaryFiles(req.files || []).finally(() => next(error));
      return;
    }
    next();
  });
}

async function removeTemporaryFiles(files = []) {
  await Promise.all(files.map(async (file) => {
    try {
      await unlink(file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Could not remove temporary media file:', error.message);
    }
  }));
}

async function removeStoredMedia(paths) {
  const uniquePaths = [...new Set(paths)];
  if (!uniquePaths.length) return;
  const { error } = await supabase.storage.from(config.storageBucket).remove(uniquePaths);
  if (error) console.error('Could not remove stored media:', error.message);
}

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

app.get('/api/oauth/:platform/callback', asyncRoute(async (req, res) => {
  try {
    const result = await completeOAuthCallback(req.params.platform, req.query);
    const destination = new URL(config.frontendUrl);
    destination.searchParams.set('oauth', result.pendingSelection ? 'select' : 'success');
    if (!result.pendingSelection) destination.searchParams.set('platform', req.params.platform);
    res.redirect(303, destination.toString());
  } catch (error) {
    console.error(`OAuth callback failed for ${req.params.platform}:`, error.message);
    const destination = new URL(config.frontendUrl);
    destination.searchParams.set('oauth', 'error');
    res.redirect(303, destination.toString());
  }
}));

app.get('/api/auth/bootstrap', asyncRoute(async (_req, res, next) => {
  const { data, error } = await supabase
    .from('workspace_state')
    .select('owner_id')
    .eq('id', true)
    .maybeSingle();
  if (error) return next(error);
  res.json({ ownerExists: Boolean(data?.owner_id), ownerSetupEnabled: Boolean(config.ownerSetupKey) });
}));

app.post('/api/auth/register', asyncRoute(async (req, res, next) => {
  const { email, password, displayName, ownerSetupKey } = req.body || {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be between 12 and 128 characters.' });
  }
  if (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 100) {
    return res.status(400).json({ error: 'Enter a display name of at most 100 characters.' });
  }
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspace_state')
    .select('owner_id')
    .eq('id', true)
    .maybeSingle();
  if (workspaceError) return next(workspaceError);
  if (!workspace?.owner_id) {
    const providedKey = typeof ownerSetupKey === 'string' ? Buffer.from(ownerSetupKey) : Buffer.alloc(0);
    const configuredKey = Buffer.from(config.ownerSetupKey);
    if (!configuredKey.length || providedKey.length !== configuredKey.length ||
        !timingSafeEqual(providedKey, configuredKey)) {
      return res.status(403).json({ error: 'The owner setup key is missing or incorrect.' });
    }
  }

  const { data, error } = await authClient.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { display_name: displayName.trim() } }
  });
  if (error) {
    if (error.status === 422 || error.message.toLowerCase().includes('already registered')) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    return next(error);
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, email, display_name, role, status')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError) return next(profileError);
  if (!profile) return next(new Error('The account profile was not created.'));
  if (data.session) setSessionCookies(res, data.session);
  res.status(201).json({
    user: profile,
    needsEmailConfirmation: !data.session,
    message: profile.role === 'owner'
      ? 'Owner account created.'
      : 'Registration received. The owner must approve your account before you can access the workspace.'
  });
}));

app.post('/api/auth/login', asyncRoute(async (req, res, next) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const { data, error } = await authClient.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });
  if (error || !data.session) return res.status(401).json({ error: 'Email or password is incorrect.' });

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, email, display_name, role, status')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError) return next(profileError);
  if (!profile) return res.status(403).json({ error: 'User profile is not available. Contact the workspace owner.' });
  setSessionCookies(res, data.session);
  res.json({ user: profile });
}));

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookies(res);
  res.status(204).end();
});

app.use('/api', authenticate);

app.get('/api/auth/session', (req, res) => {
  res.json({ user: req.profile });
});

app.use('/api', requireActive);

app.get('/api/oauth/providers', (req, res) => {
  res.json(getOAuthProviderStatus());
});

app.post('/api/oauth/:platform/start', requireRoles('owner', 'admin'), asyncRoute(async (req, res) => {
  res.json(beginOAuth(req.params.platform, req.user.id));
}));

app.get('/api/oauth/pending', requireRoles('owner', 'admin'), (req, res) => {
  res.json({ pages: getPendingMetaPages(req.user.id) });
});

app.post('/api/oauth/meta/complete', requireRoles('owner', 'admin'), asyncRoute(async (req, res) => {
  const { pageId, platforms } = req.body || {};
  const result = await completeMetaPageSelection(req.user.id, pageId, platforms);
  res.json(result);
}));

app.get('/api/users', requireRoles('owner', 'admin'), asyncRoute(async (_req, res, next) => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, display_name, role, status, created_at')
    .order('created_at', { ascending: true });
  if (error) return next(error);
  res.json(data);
}));

app.patch('/api/users/:id', requireRoles('owner', 'admin'), asyncRoute(async (req, res, next) => {
  const { role, status } = req.body || {};
  if (req.params.id === req.profile.id) {
    return res.status(400).json({ error: 'You cannot change your own role or account status.' });
  }
  if (role !== undefined && (!ROLES.includes(role) || role === 'owner')) {
    return res.status(400).json({ error: 'Choose a valid non-owner role.' });
  }
  if (status !== undefined && !['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Choose active or suspended status.' });
  }
  if (role === undefined && status === undefined) {
    return res.status(400).json({ error: 'Choose a role or account status to update.' });
  }

  const { data: target, error: findError } = await supabase
    .from('user_profiles')
    .select('id, role')
    .eq('id', req.params.id)
    .maybeSingle();
  if (findError) return next(findError);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'owner') return res.status(409).json({ error: 'The owner account cannot be changed here.' });
  if (req.profile.role !== 'owner' && target.role === 'admin') {
    return res.status(403).json({ error: 'Only the owner can manage an administrator account.' });
  }
  if (req.profile.role !== 'owner' && role === 'admin') {
    return res.status(403).json({ error: 'Only the owner can appoint an administrator.' });
  }

  const updates = { updated_at: new Date().toISOString() };
  if (role !== undefined) updates.role = role;
  if (status !== undefined) updates.status = status;
  const { data, error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('id', req.params.id)
    .select('id, email, display_name, role, status, created_at')
    .single();
  if (error) return next(error);
  res.json(data);
}));

app.get('/api/accounts', asyncRoute(async (_req, res, next) => {
  const { data, error } = await supabase
    .from('social_accounts')
    .select('id, platform, account_id, display_name, metadata, created_at, updated_at')
    .order('platform');
  if (error) return next(error);
  res.json(data.map((account) => ({ ...account, connected: true })));
}));

app.put('/api/accounts/:platform', requireRoles('owner', 'admin'), asyncRoute(async (req, res, next) => {
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
}));

app.delete('/api/accounts/:id', requireRoles('owner', 'admin'), asyncRoute(async (req, res, next) => {
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
}));

app.post('/api/media', requireRoles('owner', 'admin', 'editor'), receiveMediaFiles, asyncRoute(async (req, res, next) => {
  const files = req.files || [];
  const storedPaths = [];
  const finish = async () => removeTemporaryFiles(files);
  try {
    if (!files.length) return res.status(400).json({ error: 'Select one or more images or videos first.' });
    const totalSize = files.reduce((total, file) => total + file.size, 0);
    if (totalSize > MAX_TOTAL_UPLOAD_BYTES) {
      return res.status(413).json({ error: `The total upload must be no larger than ${Math.floor(MAX_TOTAL_UPLOAD_BYTES / (1024 * 1024))} MB.` });
    }

    let platforms;
    try {
      platforms = JSON.parse(req.body.platforms || '[]');
    } catch {
      return res.status(400).json({ error: 'Selected platforms are invalid.' });
    }
    const fitMode = req.body.fitMode;
    if (!Array.isArray(platforms) || platforms.some((platform) => !validPlatforms.includes(platform))) {
      return res.status(400).json({ error: 'Selected platforms are invalid.' });
    }
    if (!['crop', 'blur'].includes(fitMode)) {
      return res.status(400).json({ error: 'Choose crop or blur for media that needs a new frame.' });
    }

    const selectionErrors = validateMediaSelection(
      files.map((file) => ({ mimetype: file.mimetype })),
      platforms
    );
    if (selectionErrors.length) {
      return res.status(400).json({ error: selectionErrors.join(' '), details: selectionErrors });
    }

    const items = [];
    for (const file of files) {
      const variants = {};
      for (const platform of platforms) {
        let converted;
        try {
          converted = await transformMedia(file, platform, fitMode, files.length);
          const extension = converted.mimeType === 'image/jpeg' ? 'jpg' : 'mp4';
          const storagePath = `${req.user.id}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${platform}.${extension}`;
          const { error } = await supabase.storage
            .from(config.storageBucket)
            .upload(storagePath, await readFile(converted.path), {
              contentType: converted.mimeType,
              upsert: false
            });
          if (error) throw error;
          storedPaths.push(storagePath);
          variants[platform] = {
            path: storagePath,
            mimeType: converted.mimeType,
            size: converted.size,
            width: converted.width,
            height: converted.height
          };
        } finally {
          if (converted) await converted.dispose();
        }
      }
      items.push({
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        variants
      });
    }
    res.status(201).json({ items, fitMode });
  } catch (error) {
    await removeStoredMedia(storedPaths);
    next(error);
  } finally {
    await finish();
  }
}));

app.post('/api/posts', requireRoles('owner', 'admin', 'editor'), asyncRoute(async (req, res, next) => {
  const { caption = '', media = null, platforms, scheduledAt } = req.body || {};
  const platformNames = Array.isArray(platforms) ? platforms : [];
  const mediaItems = Array.isArray(media) ? media : [];
  if (media !== null && !Array.isArray(media)) {
    return res.status(400).json({ error: 'Media must be a list of uploaded files.' });
  }
  const uniquePlatforms = [...new Set(platformNames)];
  if (uniquePlatforms.length !== platformNames.length) {
    return res.status(400).json({ error: 'Duplicate platforms are not allowed.' });
  }

  const selectionErrors = validateMediaSelection(
    mediaItems.map((item) => ({ mimetype: item?.mimeType || '' })),
    uniquePlatforms
  );
  if (selectionErrors.length) {
    return res.status(400).json({ error: selectionErrors.join(' '), details: selectionErrors });
  }
  for (const item of mediaItems) {
    if (!item || typeof item !== 'object' || !item.variants || typeof item.variants !== 'object') {
      return res.status(400).json({ error: 'Uploaded media variants are required.' });
    }
    for (const platform of uniquePlatforms) {
      const variant = item.variants[platform];
      if (!variant || !Number.isSafeInteger(variant.size) || variant.size < 1 ||
          !Number.isSafeInteger(variant.width) || variant.width < 1 ||
          !Number.isSafeInteger(variant.height) || variant.height < 1) {
        return res.status(400).json({ error: 'Uploaded media metadata is invalid.' });
      }
    }
  }
  for (const platform of uniquePlatforms) {
    const platformSize = mediaItems.reduce((total, item) => total + Number(item.variants[platform]?.size || 0), 0);
    if (platformSize > MAX_TOTAL_UPLOAD_BYTES) {
      return res.status(400).json({ error: `The total upload must be no larger than ${Math.floor(MAX_TOTAL_UPLOAD_BYTES / (1024 * 1024))} MB.` });
    }
  }
  const validationErrors = validatePost({ caption, files: mediaItems, platforms: uniquePlatforms });
  if (validationErrors.length) return res.status(400).json({ error: validationErrors.join(' '), details: validationErrors });

  const date = new Date(scheduledAt);
  if (!scheduledAt || Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 30_000) {
    return res.status(400).json({ error: 'Schedule time must be at least 30 seconds in the future.' });
  }

  const storedPaths = [];
  for (const item of mediaItems) {
    for (const platform of uniquePlatforms) {
      const variant = item.variants[platform];
      const storagePath = variant?.path;
      if (typeof storagePath !== 'string' || !storagePath.startsWith(`${req.user.id}/`) ||
          storagePath.includes('..') || storagePath.startsWith('/')) {
        return res.status(400).json({ error: 'Media path is invalid.' });
      }
      storedPaths.push(storagePath);
    }
  }

  const { data: accounts, error: accountError } = await supabase
    .from('social_accounts')
    .select('id, platform')
    .in('platform', uniquePlatforms);
  if (accountError) return next(accountError);
  const accountByPlatform = new Map((accounts || []).map((account) => [account.platform, account]));
  const missing = uniquePlatforms.filter((platform) => !accountByPlatform.has(platform));
  if (missing.length) return res.status(400).json({ error: `Connect these platforms first: ${missing.join(', ')}.` });

  const firstVariant = mediaItems[0]?.variants?.[uniquePlatforms[0]];
  const storedMediaItems = mediaItems.map((item) => ({
    originalName: String(item.originalName || '').slice(0, 255),
    mimeType: item.mimeType,
    size: item.size,
    variants: Object.fromEntries(uniquePlatforms.map((platform) => [platform, item.variants[platform]]))
  }));
  const { data: post, error: insertError } = await supabase
    .from('scheduled_posts')
    .insert({
      caption,
      media_path: firstVariant?.path || null,
      media_mime_type: firstVariant?.mimeType || null,
      media_size_bytes: firstVariant?.size || null,
      media_width: firstVariant?.width || null,
      media_height: firstVariant?.height || null,
      media_items: storedMediaItems,
      created_by: req.user.id,
      scheduled_at: date.toISOString(),
      status: 'scheduled'
    })
    .select()
    .single();
  if (insertError) {
    await removeStoredMedia(storedPaths);
    return next(insertError);
  }

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
    await removeStoredMedia(storedPaths);
    return next(deliveryError);
  }
  res.status(201).json(post);
}));

app.get('/api/posts', asyncRoute(async (_req, res, next) => {
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('id, caption, media_path, media_mime_type, media_size_bytes, media_width, media_height, media_items, created_by, scheduled_at, status, created_at, updated_at, post_deliveries(id, platform, status, platform_post_id, error_message, published_at)')
    .order('scheduled_at', { ascending: false })
    .limit(100);
  if (error) return next(error);
  res.json(data);
}));

app.delete('/api/posts/:id', requireRoles('owner', 'admin', 'editor'), asyncRoute(async (req, res, next) => {
  const { data: post, error: findError } = await supabase
    .from('scheduled_posts')
    .select('id, media_path, media_items, status')
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
  const mediaPaths = (post.media_items || []).flatMap((item) =>
    Object.values(item.variants || {}).map((variant) => variant.path)
  );
  if (post.media_path) mediaPaths.push(post.media_path);
  await removeStoredMedia(mediaPaths);
  res.status(204).end();
}));

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
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: `Choose no more than ${MAX_MEDIA_FILES} media files.` });
  }
  if (error instanceof MediaProcessingError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  if (error instanceof OAuthFlowError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  res.status(500).json({
    error: config.nodeEnv === 'production' ? 'Unexpected server error.' : error.message
  });
});

app.listen(config.port, () => {
  console.info(`OSLO_AUTO_POST API listening on port ${config.port}.`);
  startScheduler();
});
