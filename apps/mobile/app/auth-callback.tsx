import { useEffect, useMemo, useRef, useState } from 'react'
import * as Linking from 'expo-linking'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import { clearStoredReferralCode, consumeStoredAuthReturnUrl, getSafeReturnUrl,
  getStoredReferralCode, markReferralApplied } from '@/lib/auth-flow'
import { AUTH_CALLBACK_URL, clearPendingGoogleAuthSession, extractGoogleAuthParams,
  resolveGoogleAuthCallbackUrl, usePendingGoogleAuthSession } from '@/lib/google-auth-callback'
import { completeGoogleAuthFromUrl } from '@/lib/google-auth'
import { useAuthStore } from '@/stores/auth-store'
import { captureBuildEnabled, shouldRetainEmptyAuthCallback } from '@/lib/capture-mode'
import { LoginContent } from '@/components/auth/login-content'

export default function AuthCallbackScreen() {
  const { i18n } = useTranslation()
  const params = useLocalSearchParams<{ token?: string; refreshToken?: string; userId?: string;
    name?: string; email?: string; error?: string; error_description?: string; access_token?: string; refresh_token?: string }>()
  const rawUrl = Linking.useLinkingURL()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const { callbackUrl: sessionCallbackUrl, isPending } = usePendingGoogleAuthSession()
  const processed = useRef(false)
  const [state, setState] = useState<'pending' | 'failed' | 'account'>('pending')
  const [accountBack, setAccountBack] = useState<BackendLoginResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const callbackUrl = useMemo(() => resolveGoogleAuthCallbackUrl({
    sessionCallbackUrl, rawUrl, params, callbackUrl: AUTH_CALLBACK_URL,
  }), [params, rawUrl, sessionCallbackUrl])

  useEffect(() => {
    if (processed.current || !callbackUrl) return
    processed.current = true
    clearPendingGoogleAuthSession()
    async function handleCallback(url: string) {
      try {
        if (extractGoogleAuthParams(url).error === 'access_denied') {
          const storedReturnUrl = await consumeStoredAuthReturnUrl()
          router.replace(storedReturnUrl ? getSafeReturnUrl(storedReturnUrl) : '/login')
          return
        }
        const referral = await getStoredReferralCode()
        const response = await completeGoogleAuthFromUrl(url, i18n.language, referral ?? undefined)
        if (response.wasReactivated) { setAccountBack(response); setState('account'); return }
        await login(response.token, response.refreshToken, { userId: response.userId, name: response.name, email: response.email })
        if (referral) { await markReferralApplied(); await clearStoredReferralCode() }
        router.replace(getSafeReturnUrl(await consumeStoredAuthReturnUrl()))
      } catch { setState('failed') }
    }
    void handleCallback(callbackUrl)
  }, [callbackUrl, i18n.language, login, router])

  useEffect(() => {
    if (shouldRetainEmptyAuthCallback(captureBuildEnabled) || processed.current || state !== 'pending' || callbackUrl || isPending) return
    const timeout = setTimeout(() => router.replace('/login'), 250)
    return () => clearTimeout(timeout)
  }, [callbackUrl, isPending, router, state])

  async function continueAccount() {
    if (!accountBack || loading) return
    setLoading(true)
    try {
      await login(accountBack.token, accountBack.refreshToken, { userId: accountBack.userId, name: accountBack.name, email: accountBack.email })
      if (await getStoredReferralCode()) { await markReferralApplied(); await clearStoredReferralCode() }
      await consumeStoredAuthReturnUrl()
      router.replace('/')
    } catch { setState('failed') }
    finally { setLoading(false) }
  }

  return <LoginContent callback={{ state, onContinue: () => void continueAccount(), loading }} />
}
