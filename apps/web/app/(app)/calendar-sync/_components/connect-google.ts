import { getSupabaseClient } from '@/lib/supabase'
import { buildGoogleCalendarOAuthOptions } from '@orbit/shared/utils'
import { clearGoogleAuthStarted, markGoogleAuthStarted } from '@/lib/google-auth-session'

export async function connectGoogle(): Promise<void> {
  const supabase = getSupabaseClient()
  sessionStorage.setItem('auth_return_url', '/calendar-sync')
  const attemptId = markGoogleAuthStarted()
  const redirectTo = `${globalThis.location.origin}/auth-callback?authAttempt=${attemptId}`
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: buildGoogleCalendarOAuthOptions({ redirectTo, forceConsent: true }),
    })
    if (error) throw error
  } catch (error) {
    clearGoogleAuthStarted()
    throw error
  }
}
