import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { redirect } from 'next/navigation'
import { APPLE_OAUTH_COOKIE } from '@/lib/apple-oauth-cookie'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'
import { desktopAttemptSchema } from '@/lib/desktop-auth'
import { AuthCallbackContent } from './auth-callback-content'

export default async function AuthCallbackPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const callbackParams = await searchParams ?? {}
  const pendingRaw = (await cookies()).get(callbackParams.provider === 'apple' ? APPLE_OAUTH_COOKIE : GOOGLE_OAUTH_COOKIE)?.value
  let pendingWebState: string | null = null
  let desktop = false
  if (pendingRaw) {
    try {
      const pending: unknown = JSON.parse(pendingRaw)
      pendingWebState = z.object({ state: z.string().min(1) }).safeParse(pending).data?.state ?? null
      desktop = z.object({ desktop: desktopAttemptSchema }).safeParse(pending).success
    } catch { pendingWebState = null }
  }
  if (desktop) {
    const params = await searchParams ?? {}
    if (typeof params.state === 'string' && params.state === pendingWebState) {
      const query = new URLSearchParams()
      for (const key of ['code', 'state', 'error']) {
        if (typeof params[key] === 'string') query.set(key, params[key])
      }
      redirect(`/api/auth/desktop/callback?${query}`)
    }
  }
  return <Suspense fallback={null}><AuthCallbackContent pendingWebState={pendingWebState} /></Suspense>
}
