import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { APPLE_OAUTH_COOKIE } from '@/lib/apple-oauth-cookie'
import { GOOGLE_OAUTH_COOKIE } from '@/lib/google-oauth-cookie'
import { AuthCallbackContent } from './auth-callback-content'

function readPendingState(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    const pending: unknown = JSON.parse(raw)
    return z.object({ state: z.string().min(1) }).safeParse(pending).data?.state ?? null
  } catch { return null }
}

export default async function AuthCallbackPage() {
  const cookieStore = await cookies()
  const pendingWebStates = {
    apple: readPendingState(cookieStore.get(APPLE_OAUTH_COOKIE)?.value),
    google: readPendingState(cookieStore.get(GOOGLE_OAUTH_COOKIE)?.value),
  }
  return <Suspense fallback={null}><AuthCallbackContent pendingWebStates={pendingWebStates} /></Suspense>
}
