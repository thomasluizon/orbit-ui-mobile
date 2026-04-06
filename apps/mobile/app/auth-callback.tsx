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
import { completeGoogleAuthFromUrl } from '@/lib/google-auth'
import { useAuthStore } from '@/stores/auth-store'
import { createColors } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppColors = ReturnType<typeof createColors>
const AUTH_CALLBACK_URL = 'https://app.useorbit.org/auth-callback'

function buildFallbackUrl(params: Record<string, string | string[] | undefined>): string | null {
  const entries: string[][] = []

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      entries.push([key, value])
    }
  }

  if (entries.length === 0) return null

  const searchParams = new URLSearchParams(entries)
  return `${AUTH_CALLBACK_URL}?${searchParams.toString()}`
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
  const processedRef = useRef(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const callbackUrl = useMemo(
    () => rawUrl ?? buildFallbackUrl(params),
    [params, rawUrl],
  )
  const hasCallbackData = Boolean(
    params.error
    || params.error_description
    || (params.token && params.userId && params.name && params.email)
    || callbackUrl,
  )

  useEffect(() => {
    if (processedRef.current) return
    if (!hasCallbackData) return
    processedRef.current = true

    async function handleCallback() {
      try {
        if (params.error || params.error_description) {
          throw new Error(params.error_description ?? params.error ?? 'Authentication failed')
        }

        if (params.token && params.userId && params.name && params.email) {
          await login(params.token, params.refreshToken ?? null, {
            userId: params.userId,
            name: params.name,
            email: params.email,
          })

          const referralCode = await getStoredReferralCode()
          if (referralCode) {
            await markReferralApplied()
            await clearStoredReferralCode()
          }
        } else {
          if (!callbackUrl) {
            throw new Error('Authentication failed')
          }

          const referralCode = await getStoredReferralCode()
          const response = await completeGoogleAuthFromUrl(
            callbackUrl,
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
  }, [callbackUrl, hasCallbackData, i18n.language, login, params, router, t])

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
