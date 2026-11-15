import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Animated, BackHandler, Text, View } from 'react-native'
import { formatLoginCountdown, type LoginCodeFailure } from '@orbit/shared/utils'
import { motionDurations } from '@orbit/shared/theme'
import { type AppTokensV2, easings } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { PillButton } from '@/components/ui/pill-button'
import { OtpInput } from '@/components/ui/otp-input'
import { KeyboardRevealGroup } from '@/components/ui/keyboard-reveal-group'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import type { LoginStyles } from '@/app/login-styles'
import { LoginHeader, LoginOfflineNotice, LoginSuccessMessage } from './login-sections'

/** The rejected code shakes through these offsets over the shared slow duration, as on web. */
const SHAKE_OFFSETS = [-4, 4, -4, 4, 0] as const

interface CodeStepProps {
  email: string
  codeDigits: string[]
  onCodeChange: (value: string) => void
  isSubmitting: boolean
  isResending: boolean
  canResend: boolean
  resendCountdown: number
  lockCountdown: number
  codeFailure: LoginCodeFailure
  fieldError?: string
  onCodeBlur?: () => void
  codeFocusRequest?: number
  errorSignal: string | null
  successMessage: string | null
  isOnline: boolean
  canSubmitTurnstile: boolean
  turnstileWidget: ReactNode
  onVerifyCode: () => void
  onResendCode: () => void
  onBackToEmail: () => void
  tokens: AppTokensV2
  styles: LoginStyles
  t: (key: string, params?: Record<string, unknown>) => string
}

/** The code field. A rejected code shakes it over the shared slow duration, and reduced motion keeps it still. */
export function LoginCodeField({ label, value, error, hint, disabled, focusRequest, onChange, onBlur }: Readonly<{
  label: string; value: string; error: string | undefined; hint: string | undefined; disabled: boolean
  focusRequest: number | undefined; onChange: (value: string) => void; onBlur: (() => void) | undefined
}>) {
  const reduced = usePrefersReducedMotion()
  const shake = useMemo(() => new Animated.Value(0), [])
  useEffect(() => {
    shake.setValue(0)
    if (!error || reduced) return
    const animation = Animated.sequence(SHAKE_OFFSETS.map((toValue) => Animated.timing(shake, {
      toValue, duration: motionDurations.slow / SHAKE_OFFSETS.length, easing: toAnimatedEasing(easings.smooth), useNativeDriver: true,
    })))
    animation.start()
    return () => animation.stop()
  }, [error, reduced, shake])
  return (
    <Animated.View testID="login-code-field" style={{ transform: [{ translateX: shake }] }}>
      <OtpInput label={label} value={value} onChange={onChange} onBlur={onBlur} focusRequest={focusRequest} error={error} hint={hint} disabled={disabled} />
    </Animated.View>
  )
}

/** The resend control: a countdown while the window is closed, then one quiet action. */
export function LoginResend({ ready, countdown, disabled, loading, onResend, styles, t }: Readonly<{
  ready: boolean; countdown: number; disabled: boolean; loading: boolean; onResend: () => void; styles: LoginStyles
  t: (key: string, params?: Record<string, unknown>) => string
}>) {
  if (!ready) return <Text style={styles.mono}>{t('auth.resendIn', { time: formatLoginCountdown(countdown) })}</Text>
  return <View style={styles.quietAction}>
    <PillButton variant="ghost" size="sm" onClick={onResend} disabled={disabled} loading={loading}>{t('auth.resendCode')}</PillButton>
  </View>
}

/** Android back on the code step returns to the email step and keeps the typed address. */
export function useBackToEmail(onBackToEmail: () => void) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onBackToEmail(); return true })
    return () => subscription.remove()
  }, [onBackToEmail])
}

export function CodeStep({ email, codeDigits, onCodeChange, isSubmitting, isResending, canResend, resendCountdown,
  lockCountdown, codeFailure, fieldError: backendFieldError, onCodeBlur, codeFocusRequest, errorSignal, successMessage, isOnline, onVerifyCode, onResendCode,
  onBackToEmail, canSubmitTurnstile, turnstileWidget, tokens, styles, t }: Readonly<CodeStepProps>) {
  useBackToEmail(onBackToEmail)
  const locked = codeFailure === 'locked'
  const waiting = locked && lockCountdown > 0
  const expired = codeFailure === 'expired'
  const fieldError = isOnline && !locked ? backendFieldError ?? errorSignal ?? undefined : undefined
  return <View style={styles.step}>
    <View style={styles.titleBlock}>
      <LoginHeader step="code" t={t} styles={styles} />
      <Text style={styles.stepSubtitle}>{t('auth.codeSentTo', { email })}</Text>
      <LoginSuccessMessage message={successMessage} styles={styles} />
      <View style={styles.quietAction}>
        <PillButton variant="ghost" size="sm" disabled={isSubmitting}
          onClick={onBackToEmail}>{t('auth.changeEmail')}</PillButton>
      </View>
    </View>
    <KeyboardRevealGroup testID="login-field-action" style={styles.step}>
      <LoginCodeField label={t('auth.verificationCode')} value={codeDigits.join('')} onChange={onCodeChange} onBlur={onCodeBlur} focusRequest={codeFocusRequest}
        error={fieldError} hint={!fieldError && !locked ? t('auth.codeHint') : undefined} disabled={isSubmitting || expired || waiting} />
      {turnstileWidget}
      {!isOnline && <LoginOfflineNotice t={t} styles={styles} tokens={tokens} />}
      {!waiting && !expired && <PillButton onClick={onVerifyCode} disabled={isSubmitting || !isOnline || codeDigits.join('').length !== 6 || !canSubmitTurnstile}
        loading={isSubmitting && !isResending}>{t('auth.verify')}</PillButton>}
      {!waiting && <View style={styles.titleBlock}>
        <LoginResend ready={canResend || expired} countdown={resendCountdown} disabled={!isOnline || isSubmitting || !canSubmitTurnstile}
          loading={isResending} onResend={onResendCode} styles={styles} t={t} />
      </View>}
      {locked && <View style={styles.titleBlock}>
        <View accessibilityLiveRegion="polite"><CapacityNotice message={t('auth.errors.tooManyAttempts')} /></View>
      </View>}
    </KeyboardRevealGroup>
  </View>
}
