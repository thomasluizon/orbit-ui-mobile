import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native'
import * as Linking from 'expo-linking'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
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
import { createColors } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppColors = ReturnType<typeof createColors>

interface AuthCallbackErrorState {
  message: string
  requestId?: string
}

export default function AuthCallbackScreen() {
  const { t, i18n } = useTranslation()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
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
  const rawUrl = Linking.useURL()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const {
    callbackUrl: sessionCallbackUrl,
    isPending: isPendingGoogleAuthSession,
  } = usePendingGoogleAuthSession()
  const processedRef = useRef(false)
  const [errorState, setErrorState] = useState<AuthCallbackErrorState | null>(null)

  function resolveCallbackError(err: unknown): AuthCallbackErrorState {
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
        requestId,
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
      requestId,
    }
  }

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
          router.replace((storedReturnUrl ? getSafeReturnUrl(storedReturnUrl) : '/login') as Href)
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
        router.replace(returnUrl as Href)
      } catch (error: unknown) {
        const nextErrorState = resolveCallbackError(error)
        setErrorState(nextErrorState)
      }
    }

    handleCallback().catch((error: unknown) => {
      const nextErrorState = resolveCallbackError(error)
      setErrorState(nextErrorState)
    })
  }, [callbackUrl, i18n.language, login, router, t])

  useEffect(() => {
    if (processedRef.current || errorState || callbackUrl || isPendingGoogleAuthSession) return

    const timeout = setTimeout(() => {
      router.replace('/login' as Href)
    }, 250)

    return () => {
      clearTimeout(timeout)
    }
  }, [callbackUrl, errorState, isPendingGoogleAuthSession, router])

  return (
    <View style={styles.container}>
      {errorState ? (
        <>
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorState.message}</Text>
            {errorState.requestId ? (
              <Text style={styles.errorReferenceText}>
                {t('auth.errorReference', { requestId: errorState.requestId })}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.8}
            onPress={() => router.replace('/login' as Href)}
          >
            <Text style={styles.backButtonText}>{t('auth.backToLogin')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.text}>{t('auth.signingIn')}</Text>
        </>
      )}
    </View>
  )
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
      gap: 16,
    },
    text: {
      color: colors.textSecondary,
      fontSize: 16,
    },
    errorCard: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 20,
      backgroundColor: colors.redBg,
      borderWidth: 1,
      borderColor: colors.redBorder,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    errorText: {
      color: colors.red400,
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
    },
    errorReferenceText: {
      color: colors.red400,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 18,
      marginTop: 8,
      opacity: 0.9,
    },
    backButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    backButtonText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '700',
    },
  })
}
