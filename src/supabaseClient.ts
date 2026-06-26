/**
 * Capital Crew — Shared Supabase Client
 *
 * Single source of truth for the Supabase URL, anon key, and client instance.
 * Both the auth/server edge-function callers and the Realtime subsystem use this.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xqhnjbbewoldwtndxfrm.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxaG5qYmJld29sZHd0bmR4ZnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE4NjEwNjcsImV4cCI6MjA2NzQzNzA2N30.H5rFpXVlNfKxUzR4bV7wQ3jY0dM6eH8kL2nP9sT1vR4';

export const supabaseUrl = SUPABASE_URL;
export const supabaseAnonKey = SUPABASE_ANON_KEY;

let _client: SupabaseClient | null = null;

/** Get (or create) the singleton Supabase client. */
export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        params: {
          eventsPerSecond: 20,
        },
      },
    });
  }
  return _client;
}
