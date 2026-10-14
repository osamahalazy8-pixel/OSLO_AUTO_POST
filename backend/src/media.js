import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import { MAX_UPLOAD_BYTES } from './platforms/limits.js';

const MAX_IMAGE_PIXELS = 40_000_000;
const VIDEO_TIMEOUT_MS = 180_000;

export class MediaProcessingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MediaProcessingError';
    this.statusCode = 422;
  }
}

function imageFrame(platform, width, height, mediaCount) {
  if (platform !== 'instagram') return null;
  if (mediaCount > 1) return { width: 1080, height: 1350 };
  const ratio = width / height;
  if (ratio > 1.91) return { width: 1080, height: 566 };
  if (ratio < 0.8) return { width: 864, height: 1080 };
  if (width < 320 || width > 1440) {
    const scale = Math.min(1440 / width, 1800 / height, Math.max(320 / width, 320 / height));
    return { width: Math.max(320, Math.round(width * scale)), height: Math.max(320, Math.round(height * scale)) };
  }
  return null;
}

async function createImageVariant(inputPath, outputPath, platform, fitMode, mediaCount) {
  let source;
  try {
    source = sharp(inputPath, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false }).rotate();
    const metadata = await source.metadata();
    if (!metadata.width || !metadata.height || !metadata.format) throw new Error('Missing image dimensions.');
    const frame = imageFrame(platform, metadata.width, metadata.height, mediaCount);

    if (!frame) {
      await source.resize({
        width: platform === 'facebook' ? 2048 : 1440,
        height: platform === 'facebook' ? 2048 : 1800,
        fit: 'inside',
        withoutEnlargement: false
      }).flatten({ background: '#ffffff' }).jpeg({ quality: 88, mozjpeg: true }).toFile(outputPath);
    } else if (fitMode === 'crop') {
      await source.resize(frame.width, frame.height, { fit: 'cover', position: 'centre' })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 88, mozjpeg: true })
        .toFile(outputPath);
    } else {
      const background = await sharp(inputPath, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false })
        .rotate()
        .resize(frame.width, frame.height, { fit: 'cover', position: 'centre' })
        .blur(24)
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      const foreground = await sharp(inputPath, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false })
        .rotate()
        .resize(frame.width, frame.height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();
      await sharp(background)
        .composite([{ input: foreground, gravity: 'centre' }])
        .jpeg({ quality: 88, mozjpeg: true })
        .toFile(outputPath);
    }

    const output = await sharp(outputPath).metadata();
    return { width: output.width, height: output.height, mimeType: 'image/jpeg' };
  } catch (error) {
    if (error.message.startsWith('Image format is unsupported')) throw error;
    throw new Error('Image format is unsupported or the image file is damaged. Use JPEG, PNG, WebP, AVIF, TIFF, or GIF.');
  }
}

function videoFilter(platform, fitMode, mediaCount) {
  if (platform === 'facebook') return { width: 1920, height: 1080 };
  if (platform === 'instagram' && mediaCount > 1) return { width: 1080, height: 1350 };
  return { width: 1080, height: 1920 };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('Video conversion is unavailable on this server.'));
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), VIDEO_TIMEOUT_MS);
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Video conversion could not start: ${error.message}`));
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) return resolve();
      if (code === null) return reject(new Error('Video conversion timed out. Try a shorter or smaller video.'));
      reject(new Error(`Video conversion failed: ${stderr.trim().slice(-700)}`));
    });
  });
}

async function createVideoVariant(inputPath, outputPath, platform, fitMode, mediaCount) {
  const frame = videoFilter(platform, fitMode, mediaCount);
  const baseArgs = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath];
  const scale = `scale=${frame.width}:${frame.height}:force_original_aspect_ratio=${fitMode === 'crop' ? 'increase' : 'decrease'}`;
  const videoArgs = fitMode === 'crop'
    ? ['-vf', `${scale},crop=${frame.width}:${frame.height},setsar=1`]
    : [
        '-filter_complex',
        `[0:v]scale=${frame.width}:${frame.height}:force_original_aspect_ratio=increase,crop=${frame.width}:${frame.height},boxblur=20:10[bg];` +
          `[0:v]${scale}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[outv]`,
        '-map', '[outv]'
      ];
  try {
    await runFfmpeg([
      ...baseArgs,
      ...videoArgs,
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '25',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-threads', '2',
      '-movflags', '+faststart',
      '-f', 'mp4',
      outputPath
    ]);
  } catch (error) {
    console.error('Video conversion failed:', error.message);
    throw new MediaProcessingError('Video conversion failed. Use a valid MP4, MOV, WebM, or MKV video.');
  }
  const outputStat = await stat(outputPath);
  if (outputStat.size > MAX_UPLOAD_BYTES) {
    throw new MediaProcessingError('The converted video exceeds the 100 MB per-file limit. Try a shorter video.');
  }
  return { width: frame.width, height: frame.height, mimeType: 'video/mp4', size: outputStat.size };
}

export async function transformMedia(file, platform, fitMode, mediaCount) {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'oslo-media-'));
  const extension = file.mimetype.startsWith('image/') ? 'jpg' : 'mp4';
  const outputPath = path.join(workDir, `${randomUUID()}.${extension}`);
  try {
    const details = file.mimetype.startsWith('image/')
      ? await createImageVariant(file.path, outputPath, platform, fitMode, mediaCount)
      : await createVideoVariant(file.path, outputPath, platform, fitMode, mediaCount);
    const outputStat = await stat(outputPath);
    if (outputStat.size > MAX_UPLOAD_BYTES) {
      throw new Error('The converted media exceeds the 100 MB per-file limit.');
    }
    return {
      path: outputPath,
      mimeType: details.mimeType,
      size: outputStat.size,
      width: details.width,
      height: details.height,
      dispose: () => rm(workDir, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(workDir, { recursive: true, force: true });
    if (error instanceof MediaProcessingError) throw error;
    throw new MediaProcessingError(error.message);
  }
}
