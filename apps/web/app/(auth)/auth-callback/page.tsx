import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { APPLE_OAUTH_COOKIE } from '@/lib/apple-oauth-cookie'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'
import { AuthCallbackContent } from './auth-callback-content'

export default async function AuthCallbackPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const callbackParams = await searchParams ?? {}
  const pendingRaw = (await cookies()).get(callbackParams.provider === 'apple' ? APPLE_OAUTH_COOKIE : GOOGLE_OAUTH_COOKIE)?.value
  let pendingWebState: string | null = null
  if (pendingRaw) {
    try {
      const pending: unknown = JSON.parse(pendingRaw)
      pendingWebState = z.object({ state: z.string().min(1) }).safeParse(pending).data?.state ?? null
    } catch { pendingWebState = null }
  }
  return <Suspense fallback={null}><AuthCallbackContent pendingWebState={pendingWebState} /></Suspense>
}
