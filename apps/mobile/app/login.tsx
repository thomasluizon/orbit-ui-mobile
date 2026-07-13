import { useMemo } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- Deliberate React Native Animated API; migrating to reanimated risks the pinned worklets 0.10.0 / reanimated 4.5.0 ABI (SDK 57) and would require rewriting the shared lib/motion.ts Animated helpers + cross-component Animated.Value props. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated, View, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { GradientTop } from '@/components/ui/gradient-top'
import { createLoginStyles } from './login-styles'
import { useLoginFlow } from './use-login-flow'
import { LoginHeader, ReferralBanner, LoginSuccessMessage } from './login-sections'
import { EmailStep } from './email-step'
import { CodeStep } from './code-step'

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createLoginStyles(tokens), [tokens])

  const {
    t,
    step,
    email,
    setEmail,
    isSubmitting,
    isGoogleLoading,
    successMessage,
    showReferralBanner,
    fromOnboarding,
    plannedHabitCount,
    isOnline,
    isCodeStep,
    isAndroidKeyboardOpen,
    stepEntrance,
    shakeOffset,
    codeDigits,
    codeInputRefs,
    canResend,
    resendCountdown,
    onCodeInput,
    onCodeKeyPress,
    canSubmitEmail,
    canSubmitCode,
    sendCode,
    verifyCode,
    resendCode,
    backToEmail,
    signInWithGoogle,
    openPrivacyPolicy,
    openTerms,
  } = useLoginFlow()

  return (
    <View style={styles.root}>
      <GradientTop height={320} />
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
        {showReferralBanner && <ReferralBanner t={t} styles={styles} />}

        <Animated.View
          style={[
            styles.formColumn,
            {
              opacity: stepEntrance,
              transform: [
                {
                  translateX: stepEntrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [isCodeStep ? 24 : -24, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <LoginHeader
            step={step}
            t={t}
            styles={styles}
            fromOnboarding={fromOnboarding}
            plannedHabitCount={plannedHabitCount}
          />

          {successMessage && (
            <LoginSuccessMessage message={successMessage} styles={styles} />
          )}

          {!isOnline && (
            <OfflineUnavailableState
              title={t('offline.title')}
              description={t('offline.description')}
              compact
            />
          )}

          {step === 'email' ? (
            <EmailStep
              email={email}
              onEmailChange={setEmail}
              isSubmitting={isSubmitting}
              canSubmitEmail={canSubmitEmail}
              isGoogleLoading={isGoogleLoading}
              isOnline={isOnline}
              onSendCode={() => void sendCode()}
              onSignInWithGoogle={() => void signInWithGoogle()}
              onOpenTerms={openTerms}
              onOpenPrivacy={openPrivacyPolicy}
              tokens={tokens}
              styles={styles}
              t={t}
              sendCodeLabel={
                fromOnboarding
                  ? t('onboarding.flow.saveYourPlan.cta')
                  : undefined
              }
            />
          ) : (
            <CodeStep
              email={email}
              codeDigits={codeDigits}
              codeInputRefs={codeInputRefs}
              onCodeInput={onCodeInput}
              onCodeKeyPress={onCodeKeyPress}
              isSubmitting={isSubmitting}
              canSubmitCode={canSubmitCode}
              canResend={canResend}
              resendCountdown={resendCountdown}
              isOnline={isOnline}
              onVerifyCode={() => void verifyCode()}
              onResendCode={() => void resendCode()}
              onBackToEmail={backToEmail}
              shakeOffset={shakeOffset}
              tokens={tokens}
              styles={styles}
              t={t}
            />
          )}
        </Animated.View>
      </KeyboardAwareScrollView>
    </View>
  )
}
