import { useEffect, useMemo, useRef, useState } from 'react'
import * as Linking from 'expo-linking'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import { clearStoredAuthReturnUrl, clearStoredReferralCode, consumeStoredAuthReturnUrl,
  createAuthReturnUrlAttempt, getSafeReturnUrl, getStoredAuthReturnUrl, getStoredReferralCode,
  isAuthReturnUrlAttemptCurrent } from '@/lib/auth-flow'
import { AUTH_CALLBACK_URL, clearPendingGoogleAuthSession, extractGoogleAuthParams,
  resolveGoogleAuthCallbackUrl, usePendingGoogleAuthSession } from '@/lib/google-auth-callback'
import { completeGoogleAuthFromUrl } from '@/lib/google-auth'
import { useAuthStore } from '@/stores/auth-store'
import { captureBuildEnabled, shouldRetainEmptyAuthCallback } from '@/lib/capture-mode'
import { LoginContent } from '@/components/auth/login-content'

function resolveReturnUrlAttemptId(
  callbackUrl: string,
  sessionCallbackUrl: string | null,
  sessionReturnUrlAttemptId: number | null,
  isPending: boolean,
): number {
  if (sessionCallbackUrl === callbackUrl && sessionReturnUrlAttemptId !== null) return sessionReturnUrlAttemptId
  if (sessionCallbackUrl || isPending) return -1
  return createAuthReturnUrlAttempt()
}

function ownsReturnUrl(isCurrentLoginSession: () => boolean, attemptId: number): boolean {
  return isCurrentLoginSession() && isAuthReturnUrlAttemptCurrent(attemptId)
}

export default function AuthCallbackScreen() {
  const { i18n } = useTranslation()
  const params = useLocalSearchParams<{ token?: string; refreshToken?: string; userId?: string;
    name?: string; email?: string; error?: string; error_description?: string; access_token?: string; refresh_token?: string }>()
  const rawUrl = Linking.useLinkingURL()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const { callbackUrl: sessionCallbackUrl, isPending,
    returnUrlAttemptId: sessionReturnUrlAttemptId } = usePendingGoogleAuthSession()
  const processed = useRef(false)
  const returnUrlAttemptRef = useRef<number | null>(null)
  const [state, setState] = useState<'pending' | 'failed' | 'account'>('pending')
  const [accountBack, setAccountBack] = useState<BackendLoginResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const callbackUrl = useMemo(() => resolveGoogleAuthCallbackUrl({
    sessionCallbackUrl, rawUrl, params, callbackUrl: AUTH_CALLBACK_URL,
  }), [params, rawUrl, sessionCallbackUrl])

  useEffect(() => {
    if (processed.current || !callbackUrl) return
    const returnUrlAttemptId = resolveReturnUrlAttemptId(
      callbackUrl, sessionCallbackUrl, sessionReturnUrlAttemptId, isPending,
    )
    if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) return
    processed.current = true
    returnUrlAttemptRef.current = returnUrlAttemptId
    clearPendingGoogleAuthSession(returnUrlAttemptId)
    async function handleCallback(url: string) {
      try {
        if (extractGoogleAuthParams(url).error === 'access_denied') {
          const storedReturnUrl = await consumeStoredAuthReturnUrl(returnUrlAttemptId)
          if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) return
          router.replace(storedReturnUrl ? getSafeReturnUrl(storedReturnUrl) : '/login')
          return
        }
        const referral = await getStoredReferralCode()
        if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) return
        const response = await completeGoogleAuthFromUrl(url, i18n.language, referral ?? undefined)
        if (!isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) return
        if (response.wasReactivated) { setAccountBack(response); setState('account'); return }
        const isCurrentLoginSession = await login(response.token, response.refreshToken, {
          userId: response.userId, name: response.name, email: response.email,
        })
        if (!isCurrentLoginSession?.() || !isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) return
        if (referral) await clearStoredReferralCode()
        if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) return
        const storedReturnUrl = await getStoredAuthReturnUrl(returnUrlAttemptId)
        if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) return
        await clearStoredAuthReturnUrl(returnUrlAttemptId, isCurrentLoginSession)
        if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) return
        router.replace(getSafeReturnUrl(storedReturnUrl))
      } catch { setState('failed') }
    }
    void handleCallback(callbackUrl)
  }, [callbackUrl, i18n.language, isPending, login, router, sessionCallbackUrl, sessionReturnUrlAttemptId])

  useEffect(() => {
    if (shouldRetainEmptyAuthCallback(captureBuildEnabled) || processed.current || state !== 'pending' || callbackUrl || isPending) return
    const timeout = setTimeout(() => router.replace('/login'), 250)
    return () => clearTimeout(timeout)
  }, [callbackUrl, isPending, router, state])

  async function continueAccount() {
    if (!accountBack || loading) return
    const returnUrlAttemptId = returnUrlAttemptRef.current
    if (returnUrlAttemptId === null || !isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) return
    setLoading(true)
    try {
      const isCurrentLoginSession = await login(accountBack.token, accountBack.refreshToken, {
        userId: accountBack.userId, name: accountBack.name, email: accountBack.email,
      })
      if (!isCurrentLoginSession?.() || !isAuthReturnUrlAttemptCurrent(returnUrlAttemptId)) return
      const referralCode = await getStoredReferralCode()
      if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) return
      if (referralCode) {
        await clearStoredReferralCode()
        if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) return
      }
      await getStoredAuthReturnUrl(returnUrlAttemptId)
      if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) return
      await clearStoredAuthReturnUrl(returnUrlAttemptId, isCurrentLoginSession)
      if (!ownsReturnUrl(isCurrentLoginSession, returnUrlAttemptId)) return
      router.replace('/')
    } catch { setState('failed') }
    finally { setLoading(false) }
  }

  return <LoginContent callback={{ state, onContinue: () => void continueAccount(), loading }} />
}
