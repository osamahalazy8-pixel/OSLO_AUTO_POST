import 'dotenv/config';
import { Buffer } from 'node:buffer';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function encryptionKey() {
  const value = required('ENCRYPTION_KEY');
  const key = /^[a-f\d]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');

  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex characters or base64).');
  }
  return key;
}

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  encryptionKey: encryptionKey(),
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'post-media',
  schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false',
  metaGraphApiVersion: process.env.META_GRAPH_API_VERSION || 'v22.0',
  xApiBaseUrl: process.env.X_API_BASE_URL || 'https://api.x.com/2'
};
