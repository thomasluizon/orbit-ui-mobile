import { useState, useRef, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
  Linking,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as WebBrowser from 'expo-web-browser'
import { useTranslation } from 'react-i18next'
import Svg, { Path } from 'react-native-svg'
import { isValidEmail } from '@orbit/shared/utils/email'
import { colors } from '@/lib/theme'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'
import type { BackendLoginResponse } from '@orbit/shared/types/auth'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.useorbit.org'

const BACKEND_ERROR_MAP: Record<string, string> = {
  'Please wait before requesting a new code': 'auth.errors.rateLimited',
  'Verification code expired or not found': 'auth.errors.codeExpired',
  'Too many attempts. Please request a new code': 'auth.errors.tooManyAttempts',
  'Invalid verification code': 'auth.errors.invalidCode',
  'Invalid email format': 'auth.errors.invalidEmail',
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const { t, i18n } = useTranslation()
  const login = useAuthStore((s) => s.login)

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', ''])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [canResend, setCanResend] = useState(true)
  const [resendCountdown, setResendCountdown] = useState(0)

  const codeInputRefs = useRef<(TextInput | null)[]>([])

  function translateBackendError(error: string): string {
    const key = BACKEND_ERROR_MAP[error]
    return key ? t(key) : error
  }

  function extractError(err: unknown): string {
    if (err instanceof Error) {
      return translateBackendError(err.message)
    }
    return t('auth.genericError')
  }

  const startResendCountdown = useCallback(() => {
    setCanResend(false)
    setResendCountdown(60)
    const interval = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          setCanResend(true)
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  async function sendCode() {
    const trimmed = email.trim()
    if (!trimmed) return
    if (!isValidEmail(trimmed)) {
      setErrorMessage(t('auth.errors.invalidEmail'))
      return
    }
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await apiClient('/api/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email: trimmed, language: i18n.language }),
      })
      setStep('code')
      setSuccessMessage(t('auth.codeSent'))
      startResendCountdown()
    } catch (err: unknown) {
      setErrorMessage(extractError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function verifyCode() {
    const code = codeDigits.join('')
    if (code.length !== 6) return
    setIsSubmitting(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const res = await apiClient<BackendLoginResponse>('/api/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          code,
          language: i18n.language,
        }),
      })
      await login(res.token, res.refreshToken, {
        userId: res.userId,
        name: res.name,
        email: res.email,
      })
      // Auth guard in root layout handles navigation to (tabs)
    } catch (err: unknown) {
      setErrorMessage(extractError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function resendCode() {
    if (!canResend) return
    setIsSubmitting(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await apiClient('/api/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), language: i18n.language }),
      })
      setSuccessMessage(t('auth.codeSent'))
      startResendCountdown()
    } catch (err: unknown) {
      setErrorMessage(extractError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  function backToEmail() {
    setStep('email')
    setErrorMessage(null)
    setSuccessMessage(null)
    setCodeDigits(['', '', '', '', '', ''])
  }

  function onCodeInput(index: number, value: string) {
    const cleanValue = value.replace(/\D/g, '')

    // Handle paste / multi-digit input
    if (cleanValue.length > 1) {
      const digits = cleanValue.split('')
      const newCodeDigits = [...codeDigits]
      for (let i = 0; i < digits.length && index + i < 6; i++) {
        newCodeDigits[index + i] = digits[i] ?? ''
      }
      setCodeDigits(newCodeDigits)
      const nextIndex = Math.min(index + digits.length, 5)
      codeInputRefs.current[nextIndex]?.focus()

      if (newCodeDigits.join('').length === 6) {
        // Auto-verify when all digits filled
        setTimeout(() => {
          const joined = newCodeDigits.join('')
          if (joined.length === 6) verifyCode()
        }, 0)
      }
      return
    }

    const newCodeDigits = [...codeDigits]
    newCodeDigits[index] = cleanValue
    setCodeDigits(newCodeDigits)

    if (cleanValue && index < 5) {
      codeInputRefs.current[index + 1]?.focus()
    }
  }

  // Auto-submit on last digit
  useEffect(() => {
    const code = codeDigits.join('')
    if (code.length === 6 && step === 'code' && !isSubmitting) {
      verifyCode()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeDigits])

  function onCodeKeyPress(index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === 'Backspace' && !codeDigits[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  async function signInWithGoogle() {
    setIsGoogleLoading(true)
    setErrorMessage(null)

    try {
      const redirectUri = `${API_BASE}/api/auth/google/mobile-callback`
      const result = await WebBrowser.openAuthSessionAsync(
        `${API_BASE}/api/auth/google?redirect_uri=${encodeURIComponent(redirectUri)}&platform=mobile`,
        redirectUri,
      )

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url)
        const token = url.searchParams.get('token')
        const refreshToken = url.searchParams.get('refreshToken')
        const userId = url.searchParams.get('userId')
        const name = url.searchParams.get('name')
        const userEmail = url.searchParams.get('email')

        if (token && userId && name && userEmail) {
          await login(token, refreshToken, { userId, name, email: userEmail })
        }
      }
    } catch {
      setErrorMessage(t('auth.googleError'))
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Branding header - matches web auth layout */}
        <View style={styles.brandingHeader}>
          <View style={styles.brandingRow}>
            <Image
              source={require('@/assets/icon.png')}
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

          {/* Success alert */}
          {successMessage && (
            <View style={styles.successAlert}>
              <Text style={styles.successAlertText}>{successMessage}</Text>
            </View>
          )}

          {/* Error alert */}
          {errorMessage && (
            <View style={styles.errorAlert}>
              <Text style={styles.errorAlertText}>{errorMessage}</Text>
            </View>
          )}

          {step === 'email' ? (
            <>
              {/* Step 1: Email */}
              <View style={styles.formSection}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.formLabel}>{t('auth.email')}</Text>
                  <TextInput
                    style={styles.formInput}
                    value={email}
                    onChangeText={setEmail}
                    placeholder={t('auth.emailPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    editable={!isSubmitting}
                    onSubmitEditing={sendCode}
                    returnKeyType="send"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, (!email.trim() || isSubmitting) && styles.buttonDisabled]}
                  onPress={sendCode}
                  disabled={!email.trim() || isSubmitting}
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
                style={[styles.googleButton, isGoogleLoading && styles.buttonDisabled]}
                onPress={signInWithGoogle}
                disabled={isGoogleLoading}
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

              <View style={styles.formSection}>
                {/* 6-digit code inputs */}
                <View style={styles.codeInputRow}>
                  {codeDigits.map((digit, index) => (
                    <TextInput
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
                    />
                  ))}
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (codeDigits.join('').length !== 6 || isSubmitting) && styles.buttonDisabled,
                  ]}
                  onPress={verifyCode}
                  disabled={codeDigits.join('').length !== 6 || isSubmitting}
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
                  disabled={!canResend}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.resendText, !canResend && styles.resendDisabled]}>
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
          >
            <Text style={styles.privacyText}>{t('privacy.title')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
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

  // -- Branding header (matches web auth layout) --
  brandingHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  brandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
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
  errorAlert: {
    backgroundColor: colors.redBg,
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorAlertText: {
    fontSize: 14,
    color: colors.red400,
  },

  // -- Form --
  formSection: {
    gap: 16,
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
