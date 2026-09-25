import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { clearGoogleAuthStarted } from './google-auth-session'

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Supabase config missing')
    client = createClient(url, key)
  }
  return client
}

export function clearSupabaseSession(): void {
  clearGoogleAuthStarted()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return
  const projectRef = new URL(url).hostname.split('.')[0]
  globalThis.localStorage.removeItem(`sb-${projectRef}-auth-token`)
  void getSupabaseClient().auth.signOut({ scope: 'local' }).catch(() => {})
}
