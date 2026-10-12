import 'dotenv/config';
import { deriveEncryptionKey } from './encryption-key.js';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  encryptionKey: deriveEncryptionKey(required('ENCRYPTION_KEY')),
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'post-media',
  schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false',
  metaGraphApiVersion: process.env.META_GRAPH_API_VERSION || 'v22.0',
  xApiBaseUrl: process.env.X_API_BASE_URL || 'https://api.x.com/2'
};
