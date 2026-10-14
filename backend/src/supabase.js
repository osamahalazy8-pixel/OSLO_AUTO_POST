import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export const authClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});
