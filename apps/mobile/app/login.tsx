import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  Keyboard,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Svg, { Path } from 'react-native-svg'
import { API } from '@orbit/shared/api'
import {
  ApiClientError,
  extractAuthBackendMessage,
  extractBackendRequestId,
  isValidEmail,
  isVerificationCodeComplete,
  resolveAuthLoginErrorKey,
} from '@orbit/shared/utils'
import { useAppToast } from '@/hooks/use-app-toast'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'
import { useLoginCodeEntry } from '@/hooks/use-login-code-entry'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'
import {
  clearStoredReferralCode,
  consumeStoredAuthReturnUrl,
  getSafeReturnUrl,
  getStoredReferralCode,
  isSafeReturnUrl,
  isValidReferralCode,
  isValidVerificationCode,
  markReferralApplied,
  storeAuthReturnUrl,
  storeReferralCode,
} from '@/lib/auth-flow'
import { startMobileGoogleAuth } from '@/lib/google-auth'
import { useOffline } from '@/hooks/use-offline'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { SaturnDropcap } from '@/components/ui/saturn-dropcap'
import { UnderlinedInput } from '@/components/ui/underlined-input'
import { CodeInput } from '@/components/ui/code-input'

interface AuthErrorState {
  message: string
  requestId?: string
}

function Spinner({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return <ActivityIndicator size="small" color={color} style={{ width: size, height: size }} />
}

function GoogleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  )
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const params = useLocalSearchParams<{
    ref?: string
    returnUrl?: string
    email?: string
    code?: string
  }>()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const { isOnline } = useOffline()
  const { showError } = useAppToast()

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showReferralBanner, setShowReferralBanner] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const isCodeStep = step === 'code'
  const isAndroidKeyboardOpen = Platform.OS === 'android' && keyboardVisible

  const {
    codeDigits,
    setCodeDigits,
    codeInputRefs,
    canResend,
    resendCountdown,
    startResendCountdown,
    resetCodeDigits,
    onCodeInput,
    onCodeKeyPress,
  } = useLoginCodeEntry()
  const offlineTitle = t('calendarSync.notConnected')
  const offlineDescription = `${t('auth.sendCode')} / ${t('auth.verify')} / ${t('auth.signInWithGoogle')}`

  useEffect(() => {
    async function hydrateAuthFlowState() {
      const refCode = typeof params.ref === 'string' ? params.ref : undefined
      const returnUrl = typeof params.returnUrl === 'string' ? params.returnUrl : undefined
      const deepLinkEmail = typeof params.email === 'string' ? params.email : undefined
      const deepLinkCode = typeof params.code === 'string' ? params.code : undefined

      if (refCode && isValidReferralCode(refCode)) {
        await storeReferralCode(refCode)
        setShowReferralBanner(true)
      } else {
        setShowReferralBanner(Boolean(await getStoredReferralCode()))
      }

      if (returnUrl && isSafeReturnUrl(returnUrl)) {
        await storeAuthReturnUrl(returnUrl)
      }

      if (deepLinkEmail) {
        setEmail(deepLinkEmail)
      }

      if (deepLinkEmail && isValidVerificationCode(deepLinkCode)) {
        setCodeDigits(deepLinkCode.split(''))
        setStep('code')
      }
    }

    hydrateAuthFlowState().catch(() => {})
  }, [
    params.code,
    params.email,
    params.ref,
    params.returnUrl,
    setCodeDigits,
    setEmail,
    setShowReferralBanner,
    setStep,
  ])

  useEffect(() => {
    if (Platform.OS !== 'android') return

    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true)
    })
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false)
    })

    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [])

  const verifyCodeRef = useRef(() => {})
  useEffect(() => {
    verifyCodeRef.current = verifyCode
  })

  useEffect(() => {
    if (step !== 'code' || isSubmitting) return
    if (isVerificationCodeComplete(codeDigits)) {
      verifyCodeRef.current()
    }
  }, [codeDigits, step, isSubmitting])

  function resolveLoginErrorState(
    err: unknown,
    source: 'google' | 'magic-code' = 'magic-code',
  ): AuthErrorState {
    const status = err instanceof ApiClientError ? err.status : undefined
    const backendMessage = extractAuthBackendMessage(err)
    const requestId = extractBackendRequestId(err)
    const key = resolveAuthLoginErrorKey({ status, backendMessage, raw: err, source })
    const message = requestId
      ? `${t(key)} ${t('auth.errorReference', { requestId })}`
      : t(key)

    return {
      message,
      requestId,
    }
  }

  function reportError(message: string) {
    setErrorMessage(message)
    showError(message)
  }

  async function sendCode() {
    if (!isOnline) {
      reportError(t('auth.errors.offline'))
      return
    }

    const trimmed = email.trim()
    if (!trimmed) return
    if (!isValidEmail(trimmed)) {
      reportError(t('auth.errors.invalidEmail'))
      return
    }
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await apiClient(API.auth.sendCode, {
        method: 'POST',
        body: JSON.stringify({ email: trimmed, language: i18n.language }),
      })
      setStep('code')
      setSuccessMessage(t('auth.codeSent'))
      startResendCountdown()
    } catch (err: unknown) {
      reportError(resolveLoginErrorState(err).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function verifyCode() {
    if (!isOnline) {
      reportError(t('auth.errors.offline'))
      return
    }

    const code = codeDigits.join('')
    if (code.length !== 6) return
    setIsSubmitting(true)
    setSuccessMessage(null)
    setErrorMessage(null)

    try {
      const referralCode = await getStoredReferralCode()
      const res = await apiClient<BackendLoginResponse>(API.auth.verifyCode, {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          code,
          language: i18n.language,
          ...(referralCode ? { referralCode } : {}),
        }),
      })
      await login(res.token, res.refreshToken, {
        userId: res.userId,
        name: res.name,
        email: res.email,
      })
      if (referralCode) {
        await markReferralApplied()
        await clearStoredReferralCode()
        setShowReferralBanner(false)
      }
      const returnUrl = getSafeReturnUrl(await consumeStoredAuthReturnUrl())
      router.replace(returnUrl as Href)
    } catch (err: unknown) {
      reportError(resolveLoginErrorState(err).message)
      resetCodeDigits()
      codeInputRefs.current[0]?.focus()
    } finally {
      setIsSubmitting(false)
    }
  }

  async function resendCode() {
    if (!isOnline) {
      reportError(t('auth.errors.offline'))
      return
    }

    if (!canResend) return
    setIsSubmitting(true)
    setSuccessMessage(null)
    setErrorMessage(null)

    try {
      await apiClient(API.auth.sendCode, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), language: i18n.language }),
      })
      setSuccessMessage(t('auth.codeSent'))
      startResendCountdown()
    } catch (err: unknown) {
      reportError(resolveLoginErrorState(err).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function backToEmail() {
    setStep('email')
    setSuccessMessage(null)
    setErrorMessage(null)
    resetCodeDigits()
  }

  async function signInWithGoogle() {
    if (!isOnline) {
      reportError(t('auth.errors.offline'))
      return
    }

    setIsGoogleLoading(true)
    setErrorMessage(null)

    try {
      const pendingReturnUrl = typeof params.returnUrl === 'string' ? params.returnUrl : undefined
      const result = await startMobileGoogleAuth({
        returnUrl: pendingReturnUrl,
      })

      if (result.type !== 'success') return

      router.replace('/auth-callback')
    } catch (err: unknown) {
      reportError(resolveLoginErrorState(err, 'google').message)
    } finally {
      setIsGoogleLoading(false)
    }
  }

  function openPrivacyPolicy() {
    router.push('/privacy')
  }

  function openTerms() {
    router.push('/terms')
  }

  const canSubmitEmail = Boolean(email.trim()) && !isSubmitting && isOnline
  const canSubmitCode =
    codeDigits.join('').length === 6 && !isSubmitting && isOnline

  return (
    <KeyboardAwareScrollView
      containerStyle={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      contentContainerStyle={[
        styles.scrollContent,
        isCodeStep && styles.scrollContentCode,
        isAndroidKeyboardOpen && styles.scrollContentKeyboard,
      ]}
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
    >
      {}
      {showReferralBanner && (
        <View style={styles.referralBanner}>
          <Text style={styles.referralBannerText}>
            {t('referral.loginBanner')}
          </Text>
        </View>
      )}

      <View style={styles.formColumn}>
        {}
        <View style={styles.brandingHeader}>
          <SaturnDropcap size={32} color={tokens.fg1} />
          <Text style={styles.wordmark}>Orbit</Text>
          <View style={styles.brandingRule} />
        </View>

        {}
        <Text style={styles.stepSubtitle}>
          {step === 'email' ? t('auth.signIn') : t('auth.enterCode')}
        </Text>

        {}
        {errorMessage && (
          <Text style={styles.inlineError}>{errorMessage}</Text>
        )}

        {}
        {successMessage && (
          <Text style={styles.successText}>{successMessage}</Text>
        )}

        {!isOnline && (
          <OfflineUnavailableState
            title={offlineTitle}
            description={offlineDescription}
            compact
          />
        )}

        {step === 'email' ? (
          <>
            <UnderlinedInput
              label={t('auth.email')}
              mono
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.emailPlaceholder')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              editable={!isSubmitting}
              onSubmitEditing={sendCode}
              returnKeyType="send"
              accessibilityLabel={t('auth.email')}
            />

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: pressed
                    ? tokens.primaryPressed
                    : tokens.primary,
                },
                !canSubmitEmail && styles.buttonDisabled,
              ]}
              onPress={sendCode}
              disabled={!canSubmitEmail}
              accessibilityState={{
                disabled: !canSubmitEmail,
                busy: isSubmitting,
              }}
            >
              {isSubmitting && <Spinner color={tokens.fgOnPrimary} />}
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: tokens.fgOnPrimary },
                ]}
              >
                {t('auth.sendCode')}
              </Text>
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>
                {t('auth.orContinueWith')}
              </Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  borderColor: tokens.hairlineStrong,
                  backgroundColor: pressed ? tokens.bgSunk : 'transparent',
                },
                (isGoogleLoading || !isOnline) && styles.buttonDisabled,
              ]}
              onPress={signInWithGoogle}
              disabled={isGoogleLoading || !isOnline}
            >
              {isGoogleLoading ? (
                <Spinner size={20} color={tokens.fg1} />
              ) : (
                <GoogleIcon />
              )}
              <Text style={[styles.secondaryButtonText, { color: tokens.fg1 }]}>
                {t('auth.signInWithGoogle')}
              </Text>
            </Pressable>

            {}
            <Text style={styles.legal}>
              {t('auth.legalPrefix')}{' '}
              <Text style={styles.legalLink} onPress={openTerms}>
                {t('auth.terms')}
              </Text>{' '}
              {t('auth.legalConjunction')}{' '}
              <Text style={styles.legalLink} onPress={openPrivacyPolicy}>
                {t('auth.privacy')}
              </Text>
              .
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.codeSentText}>
              {t('auth.codeSentTo')}{' '}
              <Text style={styles.codeSentEmail}>{email}</Text>.
            </Text>

            <CodeInput
              digits={codeDigits}
              inputRefs={codeInputRefs}
              onChange={onCodeInput}
              onKeyPress={onCodeKeyPress}
              ariaLabelForIndex={(n) => t('auth.codeDigit', { n: n + 1 })}
              disabled={isSubmitting}
              autoFocusFirst
            />

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: pressed
                    ? tokens.primaryPressed
                    : tokens.primary,
                },
                !canSubmitCode && styles.buttonDisabled,
              ]}
              onPress={verifyCode}
              disabled={!canSubmitCode}
              accessibilityState={{
                disabled: !canSubmitCode,
                busy: isSubmitting,
              }}
            >
              {isSubmitting && <Spinner color={tokens.fgOnPrimary} />}
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: tokens.fgOnPrimary },
                ]}
              >
                {t('auth.verify')}
              </Text>
            </Pressable>

            {}
            <View style={styles.resendRow}>
              {canResend ? (
                <Pressable onPress={resendCode} disabled={!isOnline}>
                  <Text style={styles.resendActiveText}>
                    {t('auth.resendCode')}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.resendCountdownText}>
                  {t('auth.resendIn', { seconds: resendCountdown })}
                </Text>
              )}
            </View>

            <View style={styles.changeEmailRow}>
              <Pressable onPress={backToEmail}>
                <Text style={styles.quietLink}>{t('auth.changeEmail')}</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </KeyboardAwareScrollView>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.bg,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 28,
      paddingVertical: 24,
    },
    scrollContentCode: {
      paddingBottom: 24,
    },
    scrollContentKeyboard: {
      justifyContent: 'flex-start',
      paddingTop: 24,
      paddingBottom: 24,
    },

    referralBanner: {
      alignSelf: 'stretch',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: tokens.hairline,
      borderBottomWidth: 1,
      borderBottomColor: tokens.hairline,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    referralBannerText: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontWeight: '600',
      color: tokens.fg1,
      letterSpacing: 0.66,
    },

    formColumn: {
      width: '100%',
      maxWidth: 360,
      gap: 18,
    },

    brandingHeader: {
      alignItems: 'center',
      gap: 14,
      paddingBottom: 12,
    },
    wordmark: {
      fontFamily: 'Geist',
      fontSize: 28,
      fontWeight: '600',
      color: tokens.fg1,
      letterSpacing: -0.7,
      lineHeight: 28,
    },
    brandingRule: {
      width: 60,
      height: 1,
      backgroundColor: tokens.hairlineStrong,
      marginTop: 6,
    },

    stepSubtitle: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontWeight: '600',
      color: tokens.fg3,
      textAlign: 'center',
    },

    inlineError: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontStyle: 'italic',
      color: tokens.statusOverdue,
      textAlign: 'center',
    },

    successText: {
      fontFamily: 'Geist',
      fontSize: 13,
      fontStyle: 'italic',
      color: tokens.fg2,
      textAlign: 'center',
    },

    primaryButton: {
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    primaryButtonText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '600',
    },
    buttonDisabled: {
      opacity: 0.5,
    },

    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 8,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: tokens.hairline,
    },
    dividerText: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontWeight: '500',
      color: tokens.fg3,
      letterSpacing: 0.66,
    },

    secondaryButton: {
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    secondaryButtonText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '500',
    },

    legal: {
      fontFamily: 'Geist',
      fontSize: 12,
      fontStyle: 'italic',
      lineHeight: 18,
      color: tokens.fg3,
      textAlign: 'center',
      marginTop: 8,
    },
    legalLink: {
      textDecorationLine: 'underline',
      color: tokens.fg3,
    },

    codeSentText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontStyle: 'italic',
      lineHeight: 21,
      color: tokens.fg3,
      textAlign: 'center',
    },
    codeSentEmail: {
      color: tokens.fg1,
      fontStyle: 'normal',
    },

    resendRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingTop: 4,
    },
    resendActiveText: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontWeight: '500',
      color: tokens.fg1,
      textDecorationLine: 'underline',
      letterSpacing: 0.44,
    },
    resendCountdownText: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontWeight: '500',
      color: tokens.fg3,
      letterSpacing: 0.44,
    },

    changeEmailRow: {
      flexDirection: 'row',
      justifyContent: 'center',
    },
    quietLink: {
      fontFamily: 'Geist',
      fontSize: 13,
      color: tokens.fg3,
      paddingVertical: 6,
    },
  })
}
