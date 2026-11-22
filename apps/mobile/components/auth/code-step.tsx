import { useEffect, useMemo } from 'react'
import { Animated, BackHandler, Text, View } from 'react-native'
import { formatLoginCountdown } from '@orbit/shared/utils'
import { motionDurations } from '@orbit/shared/theme'
import { easings } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { PillButton } from '@/components/ui/pill-button'
import { OtpInput } from '@/components/ui/otp-input'
import type { LoginStyles } from '@/app/login-styles'

const SHAKE_OFFSETS = [-4, 4, -4, 4, 0] as const

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
