import { useEffect, useMemo } from 'react'
import { Animated, BackHandler, Text, View } from 'react-native'
import { formatLoginCountdown, type LoginCodeFailure } from '@orbit/shared/utils'
import { type AppTokensV2, easings } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { PillButton } from '@/components/ui/pill-button'
import { OtpInput } from '@/components/ui/otp-input'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import type { LoginStyles } from '@/app/login-styles'
import { LoginHeader, LoginOfflineNotice, LoginSuccessMessage } from './login-sections'

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
  errorSignal: string | null
  successMessage: string | null
  isOnline: boolean
  onVerifyCode: () => void
  onResendCode: () => void
  onBackToEmail: () => void
  tokens: AppTokensV2
  styles: LoginStyles
  t: (key: string, params?: Record<string, unknown>) => string
}

export function CodeStep({ email, codeDigits, onCodeChange, isSubmitting, isResending, canResend, resendCountdown,
  lockCountdown, codeFailure, errorSignal, successMessage, isOnline, onVerifyCode, onResendCode,
  onBackToEmail, tokens, styles, t }: Readonly<CodeStepProps>) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onBackToEmail(); return true })
    return () => subscription.remove()
  }, [onBackToEmail])
  const reduced = usePrefersReducedMotion()
  const shake = useMemo(() => new Animated.Value(0), [])
  const locked = codeFailure === 'locked'
  const waiting = locked && lockCountdown > 0
  const expired = codeFailure === 'expired'
  const fieldError = isOnline && !locked ? errorSignal ?? undefined : undefined
  useEffect(() => {
    shake.setValue(0)
    if (!fieldError || reduced) return
    const animation = Animated.sequence([-4, 4, -4, 4, 0].map((toValue) => Animated.timing(shake, {
      toValue, duration: 56, easing: toAnimatedEasing(easings.smooth), useNativeDriver: true,
    })))
    animation.start()
    return () => animation.stop()
  }, [fieldError, reduced, shake])
  return <View style={styles.step}>
    <View style={styles.titleBlock}>
      <LoginHeader step="code" t={t} styles={styles} />
      <Text style={styles.stepSubtitle}>{t('auth.codeSentTo', { email })}</Text>
      <LoginSuccessMessage message={successMessage} styles={styles} />
      <View style={styles.quietAction}>
        {/* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */}
        <PillButton variant="ghost" size="sm" disabled={isSubmitting}
          onClick={onBackToEmail}>{t('auth.changeEmail')}</PillButton>
      </View>
    </View>
    <Animated.View style={{ transform: [{ translateX: shake }] }}>
      <OtpInput label={t('auth.verificationCode')} value={codeDigits.join('')} onChange={onCodeChange}
        error={fieldError} hint={!fieldError && !locked ? t('auth.codeHint') : undefined}
        disabled={isSubmitting || expired || waiting} />
    </Animated.View>
    {!isOnline && <LoginOfflineNotice t={t} styles={styles} tokens={tokens} />}
    {!waiting && !expired && <PillButton onClick={onVerifyCode} disabled={isSubmitting || !isOnline || codeDigits.join('').length !== 6}
      loading={isSubmitting && !isResending}>{t('auth.verify')}</PillButton>}
    {!waiting && <View style={styles.titleBlock}>
      {canResend || expired ? <View style={styles.quietAction}>
        {/* eslint-disable-next-line local/max-button-words -- #74 owns this existing control copy. */}
        <PillButton variant="ghost" size="sm" onClick={onResendCode} disabled={!isOnline || isSubmitting} loading={isResending}>{t('auth.resendCode')}</PillButton>
      </View> : <Text style={styles.mono}>{t('auth.resendIn', { time: formatLoginCountdown(resendCountdown) })}</Text>}
    </View>}
    {locked && <View style={styles.titleBlock}>
      <View accessibilityLiveRegion="polite"><CapacityNotice message={t('auth.errors.tooManyAttempts')} /></View>
    </View>}
  </View>
}
