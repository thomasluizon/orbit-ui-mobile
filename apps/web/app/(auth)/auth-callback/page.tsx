import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'
import { AuthCallbackContent } from './auth-callback-content'

export default async function AuthCallbackPage() {
  const pendingRaw = (await cookies()).get(GOOGLE_OAUTH_COOKIE)?.value
  let pendingWebState: string | null = null
  if (pendingRaw) {
    try {
      pendingWebState = z.object({ state: z.string().min(1) }).safeParse(JSON.parse(pendingRaw)).data?.state ?? null
    } catch { pendingWebState = null }
  }
  return <Suspense fallback={null}><AuthCallbackContent pendingWebState={pendingWebState} /></Suspense>
}
