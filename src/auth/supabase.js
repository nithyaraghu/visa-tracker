// src/auth/supabase.js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    autoRefreshToken:    true,
    persistSession:      true,
    detectSessionInUrl:  true,
    flowType:            'pkce',
    storage:             window.localStorage,
    storageKey:          'visaguard-auth',
  },
  global: {
    headers: {
      'X-Client-Info': 'visaguard/1.0'
    }
  }
})

// Helper — get current session token for debugging
export async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? `Bearer ${session.access_token}` : null
}