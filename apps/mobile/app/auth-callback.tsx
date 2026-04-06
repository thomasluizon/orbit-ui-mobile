import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native'
import * as Linking from 'expo-linking'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
      } catch {
        setErrorMessage(t('auth.callbackError'))
      }
    }

    handleCallback().catch(() => {
      setErrorMessage(t('auth.callbackError'))
    })
  }, [callbackUrl, i18n.language, login, router, t])

  useEffect(() => {
    if (processedRef.current || errorMessage || callbackUrl || isPendingGoogleAuthSession) return

    const timeout = setTimeout(() => {
      router.replace('/login' as Href)
    }, 250)

    return () => {
      clearTimeout(timeout)
    }
  }, [callbackUrl, errorMessage, isPendingGoogleAuthSession, router])

  return (
    <View style={styles.container}>
      {errorMessage ? (
        <>
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
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
