import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { TriangleAlert } from 'lucide-react-native'
import * as Linking from 'expo-linking'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  ApiClientError,
  extractAuthBackendMessage,
  extractBackendRequestId,
  resolveAuthLoginErrorKey,
} from '@orbit/shared/utils'
import {
  clearStoredReferralCode,
  consumeStoredAuthReturnUrl,
  getSafeReturnUrl,
  getStoredReferralCode,
  markReferralApplied,
} from '@/lib/auth-flow'
import {
  AUTH_CALLBACK_URL,
  clearPendingGoogleAuthSession,
  extractGoogleAuthParams,
  resolveGoogleAuthCallbackUrl,
  usePendingGoogleAuthSession,
} from '@/lib/google-auth-callback'
import { completeGoogleAuthFromUrl } from '@/lib/google-auth'
import { useAuthStore } from '@/stores/auth-store'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'

type AppTokens = ReturnType<typeof createTokensV2>

interface AuthCallbackErrorState {
  message: string
}

export default function AuthCallbackScreen() {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const params = useLocalSearchParams<{
    token?: string
    refreshToken?: string
    userId?: string
    name?: string
    email?: string
    error?: string
    error_description?: string
    access_token?: string
    refresh_token?: string
  }>()
  const rawUrl = Linking.useLinkingURL()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const {
    callbackUrl: sessionCallbackUrl,
    isPending: isPendingGoogleAuthSession,
  } = usePendingGoogleAuthSession()
  const processedRef = useRef(false)
  const [errorState, setErrorState] = useState<AuthCallbackErrorState | null>(null)

  const resolveCallbackError = useCallback(
    (err: unknown): AuthCallbackErrorState => {
      const status = err instanceof ApiClientError ? err.status : undefined
      const payload = err instanceof ApiClientError ? err.data : err
      const backendMessage = extractAuthBackendMessage(payload)
      const requestId = extractBackendRequestId(payload)
      const hasStructuredContext =
        status !== undefined ||
        backendMessage !== undefined ||
        requestId !== undefined ||
        err instanceof TypeError

      if (!hasStructuredContext) {
        return {
          message: t('auth.callbackError'),
        }
      }

      const key = resolveAuthLoginErrorKey({
        status,
        backendMessage,
        raw: err,
        source: 'google',
      })

      return {
        message: t(key),
      }
    },
    [t],
  )

  const callbackUrl = useMemo(
    () =>
      resolveGoogleAuthCallbackUrl({
        sessionCallbackUrl,
        rawUrl,
        params,
        callbackUrl: AUTH_CALLBACK_URL,
      }),
    [params, rawUrl, sessionCallbackUrl],
  )

  useEffect(() => {
    if (processedRef.current) return
    if (!callbackUrl) return
    processedRef.current = true
    const resolvedCallbackUrl = callbackUrl
    clearPendingGoogleAuthSession()

    async function handleCallback() {
      try {
        const callbackParams = extractGoogleAuthParams(resolvedCallbackUrl)
        if (callbackParams.error === 'access_denied') {
          const storedReturnUrl = await consumeStoredAuthReturnUrl()
          router.replace(storedReturnUrl ? getSafeReturnUrl(storedReturnUrl) : '/login')
          return
        }

        const referralCode = await getStoredReferralCode()
        const response = await completeGoogleAuthFromUrl(
          resolvedCallbackUrl,
          i18n.language,
          referralCode ?? undefined,
        )

        await login(response.token, response.refreshToken, {
          userId: response.userId,
          name: response.name,
          email: response.email,
        })

        if (referralCode) {
          await markReferralApplied()
          await clearStoredReferralCode()
        }

        const returnUrl = getSafeReturnUrl(await consumeStoredAuthReturnUrl())
        router.replace(returnUrl)
      } catch (error: unknown) {
        const nextErrorState = resolveCallbackError(error)
        setErrorState(nextErrorState)
      }
    }

    handleCallback().catch((error: unknown) => {
      const nextErrorState = resolveCallbackError(error)
      setErrorState(nextErrorState)
    })
  }, [callbackUrl, i18n.language, login, resolveCallbackError, router, t])

  useEffect(() => {
    if (processedRef.current || errorState || callbackUrl || isPendingGoogleAuthSession) return

    const timeout = setTimeout(() => {
      router.replace('/login')
    }, 250)

    return () => {
      clearTimeout(timeout)
    }
  }, [callbackUrl, errorState, isPendingGoogleAuthSession, router])

  return (
    <View style={styles.container}>
      <GradientTop height={320} />
      {errorState ? (
        <>
          <View style={styles.errorWell}>
            <TriangleAlert size={34} color={tokens.fg3} strokeWidth={1.8} />
          </View>
          <Text style={styles.errorTitle}>{errorState.message}</Text>
          <PillButton onPress={() => router.replace('/login')}>
            {t('auth.backToLogin')}
          </PillButton>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={tokens.primary} />
          <Text style={styles.text}>{t('auth.signingIn')}</Text>
        </>
      )}
    </View>
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.bg,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
      gap: 20,
    },
    text: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      letterSpacing: 0.24,
      color: tokens.fg3,
    },
    errorWell: {
      width: 80,
      height: 80,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
    },
    errorTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 22,
      lineHeight: 29,
      color: tokens.fg1,
      textAlign: 'center',
      maxWidth: 320,
    },
  })
}
