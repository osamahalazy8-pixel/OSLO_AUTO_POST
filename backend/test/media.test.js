import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { transformMedia } from '../src/media.js';

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`Command exited with code ${code}.`)));
  });
}

test('fits portrait Instagram images inside a blurred 4:5 frame', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'oslo-media-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'source.png');
  await sharp({
    create: { width: 300, height: 600, channels: 3, background: '#4869a1' }
  }).png().toFile(sourcePath);

  const output = await transformMedia({
    path: sourcePath,
    mimetype: 'image/png'
  }, 'instagram', 'blur', 1);
  t.after(() => output.dispose());

  const metadata = await sharp(output.path).metadata();
  assert.equal(output.mimeType, 'image/jpeg');
  assert.equal(metadata.width, 864);
  assert.equal(metadata.height, 1080);
  assert.ok((await stat(output.path)).size > 0);
});

test('crops landscape Instagram images to the 1.91:1 frame', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'oslo-media-crop-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'source.png');
  await sharp({
    create: { width: 2000, height: 800, channels: 3, background: '#4869a1' }
  }).png().toFile(sourcePath);

  const output = await transformMedia({
    path: sourcePath,
    mimetype: 'image/png'
  }, 'instagram', 'crop', 1);
  t.after(() => output.dispose());

  const metadata = await sharp(output.path).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 566);
});

test('transcodes landscape videos to a vertical blurred Instagram MP4', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'oslo-video-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'source.mp4');
  await runCommand(ffmpegPath, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=blue:s=640x480:d=0.3',
    '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', sourcePath
  ]);

  const output = await transformMedia({
    path: sourcePath,
    mimetype: 'video/mp4'
  }, 'instagram', 'blur', 1);
  t.after(() => output.dispose());

  assert.equal(output.mimeType, 'video/mp4');
  assert.equal(output.width, 1080);
  assert.equal(output.height, 1920);
  assert.ok((await stat(output.path)).size > 0);
  await runCommand(ffmpegPath, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', output.path, '-f', 'null', '-'
  ]);
});
