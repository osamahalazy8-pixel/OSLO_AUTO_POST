import { config } from '../config.js';
import { decryptSecret } from '../crypto.js';

async function requestJson(url, options) {
  const response = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(30_000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || body.message || `Platform request failed (${response.status}).`);
  }
  return body;
}

async function postMetaGraph(url, params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }
  return requestJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
}

async function publishFacebook(account, caption, mediaUrl, mimeType) {
  const version = config.metaGraphApiVersion;
  const root = `https://graph.facebook.com/${version}/${encodeURIComponent(account.account_id)}`;
  const token = decryptSecret(account.access_token_enc);
  let result;
  if (!mediaUrl) {
    result = await postMetaGraph(`${root}/feed`, { message: caption, access_token: token });
  } else {
    const isVideo = mimeType.startsWith('video/');
    const endpoint = isVideo ? 'videos' : 'photos';
    result = await postMetaGraph(`${root}/${endpoint}`, {
      [isVideo ? 'file_url' : 'url']: mediaUrl,
      [isVideo ? 'description' : 'caption']: caption,
      access_token: token
    });
  }
  return result.id || result.post_id || 'published';
}

async function publishInstagram(account, caption, mediaUrl, mimeType) {
  if (!mediaUrl) throw new Error('Instagram publishing requires an image or video.');
  const version = config.metaGraphApiVersion;
  const root = `https://graph.facebook.com/${version}/${encodeURIComponent(account.account_id)}`;
  const token = decryptSecret(account.access_token_enc);
  const isVideo = mimeType.startsWith('video/');
  const creation = await postMetaGraph(`${root}/media`, {
    [isVideo ? 'video_url' : 'image_url']: mediaUrl,
    media_type: isVideo ? 'REELS' : undefined,
    caption,
    access_token: token
  });

  if (isVideo) {
    const deadline = Date.now() + 5 * 60 * 1000;
    let ready = false;
    while (Date.now() < deadline) {
      const status = await requestJson(
        `https://graph.facebook.com/${version}/${encodeURIComponent(creation.id)}?fields=status_code&access_token=${encodeURIComponent(token)}`,
        { method: 'GET' }
      );
      if (status.status_code === 'FINISHED') {
        ready = true;
        break;
      }
      if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        throw new Error(`Instagram media processing ended with ${status.status_code}.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    if (!ready) throw new Error('Instagram video processing timed out; retry after checking the account.');
  }

  const published = await postMetaGraph(`${root}/media_publish`, {
    creation_id: creation.id,
    access_token: token
  });
  return published.id || 'published';
}

async function publishX(account, caption) {
  const token = decryptSecret(account.access_token_enc);
  const result = await requestJson(`${config.xApiBaseUrl}/tweets`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ text: caption })
  });
  return result.data?.id || 'published';
}

async function publishTikTok(account, caption, mediaUrl) {
  if (!mediaUrl) throw new Error('TikTok publishing requires a video.');
  const token = decryptSecret(account.access_token_enc);
  const result = await requestJson('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8'
    },
    body: JSON.stringify({
      post_info: {
        title: caption,
        privacy_level: account.metadata?.privacy_level || 'SELF_ONLY',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: mediaUrl
      }
    })
  });
  if (result.error?.code && result.error.code !== 'ok') {
    throw new Error(result.error.message || `TikTok API error: ${result.error.code}`);
  }
  if (!result.data?.publish_id) throw new Error('TikTok did not return a publish ID.');
  return { processingId: result.data.publish_id };
}

export async function getTikTokPublishStatus(account, publishId) {
  const token = decryptSecret(account.access_token_enc);
  const result = await requestJson('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8'
    },
    body: JSON.stringify({ publish_id: publishId })
  });
  if (result.error?.code && result.error.code !== 'ok') {
    throw new Error(result.error.message || `TikTok status API error: ${result.error.code}`);
  }
  return result.data;
}

export async function publishToPlatform(platform, account, caption, mediaUrl, mimeType) {
  switch (platform) {
    case 'facebook':
      return publishFacebook(account, caption, mediaUrl, mimeType || '');
    case 'instagram':
      return publishInstagram(account, caption, mediaUrl, mimeType || '');
    case 'x':
      if (mediaUrl) throw new Error('X media publishing is not enabled; this integration currently supports text posts only.');
      return publishX(account, caption);
    case 'tiktok':
      if (mimeType && !mimeType.startsWith('video/')) {
        throw new Error('TikTok integration currently supports video posts only.');
      }
      return publishTikTok(account, caption, mediaUrl);
    default:
      throw new Error(`Unsupported platform: ${platform}.`);
  }
}
