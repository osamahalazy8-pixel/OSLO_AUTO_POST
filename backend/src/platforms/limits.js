export const PLATFORM_LIMITS = {
  instagram: {
    label: 'Instagram',
    caption: 2200,
    imageMimeTypes: ['image/jpeg'],
    videoMimeTypes: ['video/mp4'],
    maxImageBytes: 8 * 1024 * 1024,
    maxVideoBytes: 100 * 1024 * 1024,
    imageMinWidth: 320,
    imageMaxWidth: 1440,
    imageMinRatio: 0.8,
    imageMaxRatio: 1.91,
    needsMedia: true
  },
  facebook: {
    label: 'Facebook',
    caption: 63206,
    imageMimeTypes: ['image/jpeg', 'image/png'],
    videoMimeTypes: ['video/mp4', 'video/quicktime'],
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 1024 * 1024 * 1024,
    needsMedia: false
  },
  x: {
    label: 'X',
    caption: 280,
    imageMimeTypes: [],
    videoMimeTypes: [],
    maxImageBytes: 0,
    maxVideoBytes: 0,
    needsMedia: false
  },
  tiktok: {
    label: 'TikTok',
    caption: 2200,
    imageMimeTypes: [],
    videoMimeTypes: ['video/mp4', 'video/webm'],
    maxVideoBytes: 287 * 1024 * 1024,
    needsMedia: true
  }
};

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_MEDIA_FILES = 10;
export const MAX_TOTAL_UPLOAD_BYTES = 250 * 1024 * 1024;

export function validateMediaSelection(files, platforms) {
  const errors = [];
  if (!Array.isArray(platforms) || platforms.length === 0) {
    errors.push('Choose at least one platform.');
  }
  if (!Array.isArray(files) || files.length > MAX_MEDIA_FILES) {
    return [`Choose no more than ${MAX_MEDIA_FILES} media files.`];
  }
  const images = files.filter((file) => file.mimetype?.startsWith('image/'));
  const videos = files.filter((file) => file.mimetype?.startsWith('video/'));
  if (images.length + videos.length !== files.length) {
    errors.push('Only supported image and video formats are accepted.');
  }

  for (const platform of platforms) {
    if (!PLATFORM_LIMITS[platform]) {
      errors.push(`Unsupported platform: ${platform}.`);
      continue;
    }
    if (platform === 'x' && files.length) {
      errors.push('X media publishing is not enabled; this integration currently supports text posts only.');
    }
    if (platform === 'instagram' && files.length > 10) {
      errors.push('Instagram carousels support up to 10 media items.');
    }
    if (platform === 'facebook' && (videos.length > 1 || (videos.length && images.length))) {
      errors.push('Facebook posts support one video or up to 10 images at a time.');
    }
    if (platform === 'facebook' && images.length > 10) {
      errors.push('Facebook photo albums support up to 10 images.');
    }
    if (platform === 'tiktok' && (images.length || videos.length !== 1)) {
      errors.push('TikTok publishing requires exactly one video and does not support image posts.');
    }
  }
  return [...new Set(errors)];
}

export function validatePost({ caption, file, files, platforms }) {
  const errors = [];
  const mediaFiles = Array.isArray(files) ? files : (file ? [file] : []);
  if (!Array.isArray(platforms) || platforms.length === 0) {
    errors.push('Choose at least one platform.');
    return errors;
  }

  for (const platform of platforms) {
    const limits = PLATFORM_LIMITS[platform];
    if (!limits) {
      errors.push(`Unsupported platform: ${platform}.`);
      continue;
    }
    if (typeof caption !== 'string' || caption.length > limits.caption) {
      errors.push(`${limits.label} caption must be at most ${limits.caption} characters.`);
    }
    if (limits.needsMedia && mediaFiles.length === 0) {
      errors.push(`${limits.label} requires media.`);
    }
    for (const item of mediaFiles) {
      const media = item.variants?.[platform] || item;
      const mimeType = media.mimetype || media.mimeType || '';
      if (media.size > MAX_UPLOAD_BYTES) {
        errors.push(`Media must be no larger than ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB in this deployment.`);
      }

      const allowedTypes = [...limits.imageMimeTypes, ...limits.videoMimeTypes];
      if (!allowedTypes.includes(mimeType)) {
        errors.push(`${limits.label} does not support ${mimeType || 'this media type'}.`);
        continue;
      }
      const isVideo = mimeType.startsWith('video/');
      const maxBytes = isVideo ? limits.maxVideoBytes : limits.maxImageBytes;
      if (maxBytes && media.size > maxBytes) {
        errors.push(`${limits.label} media must be no larger than ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
      }
      if (platform === 'instagram' && !isVideo) {
        if (media.width && (media.width < limits.imageMinWidth || media.width > limits.imageMaxWidth)) {
          errors.push('Instagram image width must be between 320 and 1440 pixels.');
        }
        if (media.width && media.height) {
          const ratio = media.width / media.height;
          if (ratio < limits.imageMinRatio || ratio > limits.imageMaxRatio) {
            errors.push('Instagram image aspect ratio must be between 4:5 and 1.91:1.');
          }
        }
      }
    }
  }
  return [...new Set(errors)];
}
