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
  supabaseAnonKey: required('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  ownerSetupKey: process.env.OWNER_SETUP_KEY || '',
  encryptionKey: deriveEncryptionKey(required('ENCRYPTION_KEY')),
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'post-media',
  schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false',
  metaGraphApiVersion: process.env.META_GRAPH_API_VERSION || 'v22.0',
  xApiBaseUrl: process.env.X_API_BASE_URL || 'https://api.x.com/2',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, ''),
  frontendUrl: (process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  metaAppId: process.env.META_APP_ID || '',
  metaAppSecret: process.env.META_APP_SECRET || '',
  xClientId: process.env.X_CLIENT_ID || '',
  xClientSecret: process.env.X_CLIENT_SECRET || '',
  tiktokClientKey: process.env.TIKTOK_CLIENT_KEY || '',
  tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET || ''
};
