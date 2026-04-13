import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
  Linking,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Svg, { Path } from 'react-native-svg'
import { API } from '@orbit/shared/api'
import {
  ApiClientError,
  extractAuthBackendMessage,
  isValidEmail,
  isVerificationCodeComplete,
  resolveAuthLoginErrorKey,
} from '@orbit/shared/utils'
import { useAppToast } from '@/hooks/use-app-toast'
import { createColors } from '@/lib/theme'
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
import { AppTextInput } from '@/components/ui/app-text-input'

type AppColors = ReturnType<typeof createColors>

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
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
  }, [params.code, params.email, params.ref, params.returnUrl])

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

  useEffect(() => {
    if (step !== 'code' || isSubmitting) return
    if (isVerificationCodeComplete(codeDigits)) {
      void verifyCode()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeDigits, step, isSubmitting])

  function resolveLoginErrorMessage(
    err: unknown,
    source: 'google' | 'magic-code' = 'magic-code',
  ): string {
    const status = err instanceof ApiClientError ? err.status : undefined
    const backendMessage = extractAuthBackendMessage(err)
    const key = resolveAuthLoginErrorKey({ status, backendMessage, raw: err, source })
    return t(key)
  }

  async function sendCode() {
    if (!isOnline) {
      showError(t('auth.errors.offline'))
      return
    }

    const trimmed = email.trim()
    if (!trimmed) return
    if (!isValidEmail(trimmed)) {
      showError(t('auth.errors.invalidEmail'))
      return
    }
    setIsSubmitting(true)

    try {
      await apiClient(API.auth.sendCode, {
        method: 'POST',
        body: JSON.stringify({ email: trimmed, language: i18n.language }),
      })
      setStep('code')
      setSuccessMessage(t('auth.codeSent'))
      startResendCountdown()
    } catch (err: unknown) {
      showError(resolveLoginErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function verifyCode() {
    if (!isOnline) {
      showError(t('auth.errors.offline'))
      return
    }

    const code = codeDigits.join('')
    if (code.length !== 6) return
    setIsSubmitting(true)
    setSuccessMessage(null)

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
      showError(resolveLoginErrorMessage(err))
      resetCodeDigits()
      codeInputRefs.current[0]?.focus()
    } finally {
      setIsSubmitting(false)
    }
  }

  async function resendCode() {
    if (!isOnline) {
      showError(t('auth.errors.offline'))
      return
    }

    if (!canResend) return
    setIsSubmitting(true)
    setSuccessMessage(null)

    try {
      await apiClient(API.auth.sendCode, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), language: i18n.language }),
      })
      setSuccessMessage(t('auth.codeSent'))
      startResendCountdown()
    } catch (err: unknown) {
      showError(resolveLoginErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  function backToEmail() {
    setStep('email')
    setSuccessMessage(null)
    resetCodeDigits()
  }

  async function signInWithGoogle() {
    if (!isOnline) {
      showError(t('auth.errors.offline'))
      return
    }

    setIsGoogleLoading(true)

    try {
      const pendingReturnUrl = typeof params.returnUrl === 'string' ? params.returnUrl : undefined
      const result = await startMobileGoogleAuth({
        returnUrl: pendingReturnUrl,
      })

      if (result.type !== 'success') return

      router.replace('/auth-callback')
    } catch (err: unknown) {
      showError(resolveLoginErrorMessage(err, 'google'))
    } finally {
      setIsGoogleLoading(false)
    }
  }

  function openPrivacyPolicy() {
    Linking.openURL('https://app.useorbit.org/privacy')
  }

  // -- Spinner component (matches web SVG spinner) --
  function Spinner({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
    return <ActivityIndicator size="small" color={color} style={{ width: size, height: size }} />
  }

  // -- Google icon SVG --
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

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isCodeStep && styles.scrollContentCode,
          isAndroidKeyboardOpen && styles.scrollContentKeyboard,
        ]}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {/* Branding header - matches web auth layout */}
        <View style={styles.brandingHeader}>
          <View style={styles.brandingRow}>
            <Image
              source={require('@/assets/logo-no-bg.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logoText}>Orbit</Text>
          </View>
          <Text style={styles.tagline}>{t('auth.tagline')}</Text>
        </View>

        {/* Card - matches web bg-surface-overlay card */}
        <View style={styles.card}>
          {/* Welcome heading */}
          <Text style={styles.welcomeHeading}>{t('auth.welcomeBack')}</Text>

          {showReferralBanner && (
            <View
              style={styles.successAlert}
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
              accessibilityLabel={t('referral.loginBanner')}
            >
              <Text style={styles.successAlertText}>{t('referral.loginBanner')}</Text>
            </View>
          )}

          {/* Success alert */}
          {successMessage && (
            <View
              style={styles.successAlert}
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
              accessibilityLabel={successMessage}
            >
              <Text style={styles.successAlertText}>{successMessage}</Text>
            </View>
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
              {/* Step 1: Email */}
              <View style={styles.formSection}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.formLabel}>{t('auth.email')}</Text>
                  <AppTextInput
                    style={styles.formInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder={t('auth.emailPlaceholder')}
                    placeholderTextColor={colors.textMuted}
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
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, (!email.trim() || isSubmitting || !isOnline) && styles.buttonDisabled]}
                  onPress={sendCode}
                  disabled={!email.trim() || isSubmitting || !isOnline}
                  accessibilityState={{ disabled: !email.trim() || isSubmitting || !isOnline, busy: isSubmitting }}
                  activeOpacity={0.8}
                >
                  {isSubmitting && <Spinner />}
                  <Text style={styles.primaryButtonText}>{t('auth.sendCode')}</Text>
                </TouchableOpacity>
              </View>

              {/* OAuth divider - "OR CONTINUE WITH" */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>
                  {t('auth.orContinueWith').toUpperCase()}
                </Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Google Sign-In button */}
              <TouchableOpacity
                style={[styles.googleButton, (isGoogleLoading || !isOnline) && styles.buttonDisabled]}
                onPress={signInWithGoogle}
                disabled={isGoogleLoading || !isOnline}
                activeOpacity={0.8}
              >
                {isGoogleLoading ? (
                  <Spinner size={20} color={colors.textPrimary} />
                ) : (
                  <GoogleIcon />
                )}
                <Text style={styles.googleButtonText}>{t('auth.signInWithGoogle')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Step 2: Code verification */}
              <Text style={styles.codeSentText}>
                {t('auth.codeSentTo')}{' '}
                <Text style={styles.codeSentEmail}>{email}</Text>
              </Text>

              <View style={styles.codeFormSection}>
                {/* 6-digit code inputs */}
                <View
                  style={styles.codeInputRow}
                  accessibilityRole="text"
                  accessibilityLabel={`${t('auth.codeSentTo')} ${email}`}
                >
                  {codeDigits.map((digit, index) => (
                    <AppTextInput
                      key={index}
                      ref={(el) => { codeInputRefs.current[index] = el }}
                      style={styles.codeInput}
                      value={digit}
                      onChangeText={(value) => onCodeInput(index, value)}
                      onKeyPress={(e) => onCodeKeyPress(index, e)}
                      keyboardType="number-pad"
                      maxLength={6}
                      selectTextOnFocus
                      editable={!isSubmitting}
                      autoFocus={index === 0}
                      accessibilityLabel={`${t('auth.codeDigit', { n: index + 1 })}`}
                      textContentType={index === 0 ? 'oneTimeCode' : 'none'}
                    />
                  ))}
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (codeDigits.join('').length !== 6 || isSubmitting || !isOnline) && styles.buttonDisabled,
                  ]}
                  onPress={verifyCode}
                  disabled={codeDigits.join('').length !== 6 || isSubmitting || !isOnline}
                  accessibilityState={{
                    disabled: codeDigits.join('').length !== 6 || isSubmitting || !isOnline,
                    busy: isSubmitting,
                  }}
                  activeOpacity={0.8}
                >
                  {isSubmitting && <Spinner />}
                  <Text style={styles.primaryButtonText}>{t('auth.verify')}</Text>
                </TouchableOpacity>
              </View>

              {/* Change email / Resend code row */}
              <View style={styles.codeActionsRow}>
                <TouchableOpacity onPress={backToEmail} activeOpacity={0.7}>
                  <Text style={styles.changeEmailText}>{t('auth.changeEmail')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={resendCode}
                  disabled={!canResend || !isOnline}
                  accessibilityState={{ disabled: !canResend || !isOnline }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.resendText, (!canResend || !isOnline) && styles.resendDisabled]}>
                    {canResend
                      ? t('auth.resendCode')
                      : `${t('auth.resendCode')} (${resendCountdown}s)`}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Privacy Policy link */}
          <TouchableOpacity
            style={styles.privacyLink}
            onPress={openPrivacyPolicy}
            activeOpacity={0.7}
            accessibilityRole="link"
          >
            <Text style={styles.privacyText}>{t('privacy.title')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
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

  // -- Branding header (matches web auth layout) --
  brandingHeader: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 32,
  },
  brandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    alignSelf: 'center',
  },
  logoImage: {
    width: 48,
    height: 48,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // -- Card (matches web bg-surface-overlay card) --
  card: {
    width: '100%',
    maxWidth: 384, // max-w-sm = 24rem = 384px
    backgroundColor: colors.surfaceOverlay,
    borderRadius: 24, // radius-2xl = 1.5rem
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)', // border-muted
    padding: 24,
    gap: 24,
    // shadow-lg equivalent
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 12,
  },

  // -- Welcome heading --
  welcomeHeading: {
    fontSize: 24, // text-fluid-2xl at mobile
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // -- Alerts --
  successAlert: {
    backgroundColor: colors.emeraldBg,
    borderWidth: 1,
    borderColor: colors.emeraldBorder,
    borderRadius: 16, // radius-lg
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  successAlertText: {
    fontSize: 14,
    color: colors.emerald400,
  },
  // -- Form --
  formSection: {
    gap: 16,
  },
  codeFormSection: {
    gap: 24,
  },
  fieldGroup: {
    gap: 6, // space-y-1.5
  },
  formLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textMuted,
  },
  formInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12, // radius-md
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },

  // -- Primary button (matches web Send Code / Verify) --
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 20, // radius-xl = 1.25rem
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    // shadow-glow equivalent
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // -- OAuth divider --
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderEmphasis,
  },
  dividerText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
    letterSpacing: 1,
  },

  // -- Google button --
  googleButton: {
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderEmphasis,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  googleButtonText: {
    color: '#1f2937', // gray-800
    fontSize: 16,
    fontWeight: '500',
  },

  // -- Code verification step --
  codeSentText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  codeSentEmail: {
    color: colors.textPrimary,
    fontWeight: '500',
  },
  codeInputRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  codeInput: {
    width: 44,
    height: 52,
    backgroundColor: colors.surfaceGround,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  codeActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  changeEmailText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  resendText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  resendDisabled: {
    opacity: 0.5,
  },

  // -- Privacy link --
  privacyLink: {
    alignItems: 'center',
    paddingTop: 8,
  },
  privacyText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  })
}
