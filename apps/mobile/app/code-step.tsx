import { useEffect, type RefObject } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated, BackHandler, Pressable, Text, View } from 'react-native'
import type { TextInput, TextInputKeyPressEvent } from 'react-native'
import { type AppTokensV2 } from '@/lib/theme'
import { PillButton } from '@/components/ui/pill-button'
import { CodeInput } from '@/components/ui/code-input'
import { Spinner } from './login-atoms'
import type { LoginStyles } from './login-styles'

type TranslationFn = (key: string, params?: Record<string, unknown>) => string

interface CodeStepProps {
  email: string
  codeDigits: string[]
  codeInputRefs: RefObject<(TextInput | null)[]>
  onCodeInput: (index: number, value: string) => void
  onCodeKeyPress: (index: number, event: TextInputKeyPressEvent) => void
  isSubmitting: boolean
  canSubmitCode: boolean
  canResend: boolean
  resendCountdown: number
  isOnline: boolean
  onVerifyCode: () => void
  onResendCode: () => void
  onBackToEmail: () => void
  shakeOffset: Animated.Value
  tokens: AppTokensV2
  styles: LoginStyles
  t: TranslationFn
}

// react-doctor-disable-next-line no-many-boolean-props -- Deliberate presentational auth step: independent submitting/can-submit/can-resend UI-state flags owned by the login flow; an options-object rewrite would churn the caller and the web parity mirror for no runtime benefit. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function CodeStep({
  email,
  codeDigits,
  codeInputRefs,
  onCodeInput,
  onCodeKeyPress,
  isSubmitting,
  canSubmitCode,
  canResend,
  resendCountdown,
  isOnline,
  onVerifyCode,
  onResendCode,
  onBackToEmail,
  shakeOffset,
  tokens,
  styles,
  t,
}: Readonly<CodeStepProps>) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBackToEmail()
      return true
    })
    return () => subscription.remove()
  }, [onBackToEmail])

  const resendDisabled = !isOnline || isSubmitting

  return (
    <>
      <Text style={styles.codeSentText}>
        {t('auth.codeSentTo')}{' '}
        <Text style={styles.codeSentEmail}>{email}</Text>.
      </Text>

      <Animated.View style={{ transform: [{ translateX: shakeOffset }] }}>
        <CodeInput
          digits={codeDigits}
          inputRefs={codeInputRefs}
          onChange={onCodeInput}
          onKeyPress={onCodeKeyPress}
          ariaLabelForIndex={(n) => t('auth.codeDigit', { n: n + 1 })}
          disabled={isSubmitting}
          autoFocusFirst
        />
      </Animated.View>

      <PillButton
        fullWidth
        onPress={onVerifyCode}
        disabled={!canSubmitCode}
        busy={isSubmitting}
        leading={isSubmitting ? <Spinner color={tokens.fgOnPrimary} /> : undefined}
      >
        {t('auth.verify')}
      </PillButton>

      <View style={styles.resendRow}>
        {canResend ? (
          <Pressable
            onPress={onResendCode}
            disabled={resendDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: resendDisabled }}
            style={({ pressed }) => [
              styles.textButton,
              pressed && styles.textButtonPressed,
              resendDisabled && styles.textButtonDisabled,
            ]}
          >
            {({ pressed }) => (
              <Text
                style={[
                  styles.resendActiveText,
                  pressed && styles.resendActiveTextPressed,
                ]}
              >
                {t('auth.resendCode')}
              </Text>
            )}
          </Pressable>
        ) : (
          <View style={styles.textButton}>
            <Text style={styles.resendCountdownText}>
              {t('auth.resendIn', { seconds: resendCountdown })}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.changeEmailRow}>
        <Pressable
          onPress={onBackToEmail}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityState={{ disabled: isSubmitting }}
          style={({ pressed }) => [
            styles.textButton,
            pressed && styles.textButtonPressed,
            isSubmitting && styles.textButtonDisabled,
          ]}
        >
          {({ pressed }) => (
            <Text style={[styles.quietLink, pressed && styles.quietLinkPressed]}>
              {t('auth.changeEmail')}
            </Text>
          )}
        </Pressable>
      </View>
    </>
  )
}
