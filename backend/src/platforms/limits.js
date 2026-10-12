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

export function validatePost({ caption, file, platforms }) {
  const errors = [];
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
    if (limits.needsMedia && !file) {
      errors.push(`${limits.label} requires media.`);
    }
    if (!file) continue;
    if (file.size > MAX_UPLOAD_BYTES) {
      errors.push(`Media must be no larger than ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB in this deployment.`);
    }

    const allowedTypes = [...limits.imageMimeTypes, ...limits.videoMimeTypes];
    if (!allowedTypes.includes(file.mimetype)) {
      errors.push(`${limits.label} does not support ${file.mimetype || 'this media type'}.`);
      continue;
    }
    const isVideo = file.mimetype.startsWith('video/');
    const maxBytes = isVideo ? limits.maxVideoBytes : limits.maxImageBytes;
    if (file.size > maxBytes) {
      errors.push(`${limits.label} media must be no larger than ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
    }
    if (platform === 'instagram' && !isVideo) {
      if (file.width && (file.width < limits.imageMinWidth || file.width > limits.imageMaxWidth)) {
        errors.push('Instagram image width must be between 320 and 1440 pixels.');
      }
      if (file.width && file.height) {
        const ratio = file.width / file.height;
        if (ratio < limits.imageMinRatio || ratio > limits.imageMaxRatio) {
          errors.push('Instagram image aspect ratio must be between 4:5 and 1.91:1.');
        }
      }
    }
  }
  return [...new Set(errors)];
}
