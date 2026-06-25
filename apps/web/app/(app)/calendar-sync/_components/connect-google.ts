import { getSupabaseClient } from '@/lib/supabase'
import { buildGoogleCalendarOAuthOptions } from '@orbit/shared/utils'

export async function connectGoogle(): Promise<void> {
  const supabase = getSupabaseClient()
  const redirectTo = `${globalThis.location.origin}/auth-callback`
  sessionStorage.setItem('auth_return_url', '/calendar-sync')

  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: buildGoogleCalendarOAuthOptions({ redirectTo, forceConsent: true }),
  })
}
