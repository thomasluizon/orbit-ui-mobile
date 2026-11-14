import { ShellContent } from '@/components/shell/shell-content'
import { getPendingAuthProvider, getAuthCallbackErrorKey } from '@orbit/shared/utils'
import { SPACING } from '@orbit/shared/theme'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Platform, Text, View, useWindowDimensions, type ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { Lockup } from '@/components/ui/lockup'
import { PillButton } from '@/components/ui/pill-button'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import { createLoginStyles } from '@/app/login-styles'
import { useLoginFlow } from '@/app/use-login-flow'
import { LoginHeader, ReferralBanner, LoginStepStage, LoginValidationMessage } from './login-sections'
import { EmailStep } from './email-step'
import { CodeStep } from './code-step'
import { SteadyColumn, steadyLength } from './steady-column'

export interface LoginCallback {
  provider?: 'apple' | 'google'
  state: 'pending' | 'failed' | 'account'
  onContinue: () => void
  loading?: boolean
}

export function LoginContent({ callback }: Readonly<{ callback?: LoginCallback }>) {
  const insets = useSafeAreaInsets()
  const { width, scale } = useWindowDimensions()
  const wide = width >= 768
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createLoginStyles(tokens)
  const flow = useLoginFlow(Boolean(callback))
  const { t } = flow
  const [callbackDismissed, setCallbackDismissed] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const [viewportHeight, setViewportHeight] = useState(0)
  useLayoutEffect(() => {
    scrollRef.current?.getNativeScrollRef()?.measureInWindow((_x, _y, _width, height) => setViewportHeight(height))
  })
  const check = useMeasuredCheck(flow, scale)
  function continueAccount() {
    if (callback?.state === 'account') callback.onContinue()
    else void flow.continueAccount()
  }
  const account = Boolean(flow.accountBack) || callback?.state === 'account'
  const pendingProvider = getPendingAuthProvider(callback)
  const callbackErrorKey = getAuthCallbackErrorKey(callback?.provider)
  const googleFailed = callback?.state === 'failed' && !callbackDismissed
  const emailErrorKey = googleFailed ? callbackErrorKey : flow.errorKey
  const emailErrorMessage = googleFailed ? t(callbackErrorKey) : flow.errorMessage
  const sendCodeLabel = flow.fromOnboarding ? t('auth.onboarding.continue') : undefined
  const canSubmitTurnstile = !flow.turnstileSiteKey || Boolean(flow.turnstileToken)
  const turnstileWidget = check.widget
  const checkSpace = !account && check.height > 0 ? check.height + styles.step.gap : 0
  const scrollPadding = wide ? styles.scrollWide.padding : 0
  return <View style={styles.root}>
    <ShellContent style={{ flex: 1 }}><KeyboardAwareScrollView ref={scrollRef} containerStyle={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={[styles.scrollContent, wide && styles.scrollWide, { paddingBottom: scrollPadding + insets.bottom }]} keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false} onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}>
      <SteadyColumn viewportHeight={viewportHeight - 2 * scrollPadding - insets.bottom} blockSpace={checkSpace}
        style={[styles.formColumn, !wide && styles.formCompact, width < 336 && { paddingHorizontal: SPACING.s8 }, wide && styles.panel]}>
        {Platform.OS !== 'ios' && flow.showReferralBanner && !account && <ReferralBanner t={t} styles={styles} />}
        <Lockup />
        {account ? <AccountBackState t={t} styles={styles} loading={flow.isSubmitting || callback?.loading}
          continueAccount={continueAccount} errorMessage={flow.errorMessage} /> : <LoginStepStage step={flow.step}>
          <View style={styles.step}>
            {flow.step === 'email' && <LoginHeader step="email" t={t} styles={styles} fromOnboarding={flow.fromOnboarding} plannedHabitCount={flow.plannedHabitCount} />}
            {flow.step === 'email' ? <EmailStep email={flow.email} onEmailChange={(email) => { setCallbackDismissed(true); flow.setEmail(email) }}
              isSubmitting={flow.isSubmitting} isGoogleLoading={flow.isGoogleLoading || pendingProvider === 'google'}
              isAppleLoading={flow.isAppleLoading || pendingProvider === 'apple'}
              errorKey={emailErrorKey}
              errorMessage={emailErrorMessage} fieldError={flow.emailFieldError}
              isOnline={flow.isOnline} t={t} tokens={tokens} styles={styles} emailFocusRequest={flow.emailFocusRequest}
              canSubmitTurnstile={canSubmitTurnstile} turnstileWidget={turnstileWidget}
              onSendCode={() => { setCallbackDismissed(true); void flow.sendCode() }}
              onSignInWithApple={() => { setCallbackDismissed(true); void flow.signInWithApple() }}
              onSignInWithGoogle={() => { setCallbackDismissed(true); void flow.signInWithGoogle() }}
              onOpenPrivacy={flow.openPrivacyPolicy} onOpenTerms={flow.openTerms}
              sendCodeLabel={sendCodeLabel} />
              : <CodeStep email={flow.email} codeDigits={flow.codeDigits} isSubmitting={flow.isSubmitting} isResending={flow.isResending}
                canResend={flow.canResend} resendCountdown={flow.resendCountdown} codeFailure={flow.codeFailure}
                lockCountdown={flow.lockCountdown} fieldError={flow.codeFieldError} errorSignal={flow.errorMessage} onCodeBlur={flow.onCodeBlur} codeFocusRequest={flow.codeFocusRequest} successMessage={flow.successMessage}
                isOnline={flow.isOnline} onCodeChange={flow.onCodeChange} onBackToEmail={flow.backToEmail} t={t}
                canSubmitTurnstile={canSubmitTurnstile} turnstileWidget={turnstileWidget}
                tokens={tokens} styles={styles} onVerifyCode={() => void flow.verifyCode()}
                onResendCode={() => void flow.resendCode()} />}
          </View>
        </LoginStepStage>}
        <LoginValidationMessage message={flow.validationGeneralError} isOnline={flow.isOnline} styles={styles} />
      </SteadyColumn>
    </KeyboardAwareScrollView></ShellContent>
  </View>
}

function useMeasuredCheck(flow: ReturnType<typeof useLoginFlow>, pixelRatio: number) {
  const [height, setHeight] = useState(0)
  const reportSpace = useCallback((space: number) => setHeight((current) => steadyLength(current, space, pixelRatio)), [pixelRatio])
  const widget = flow.turnstileSiteKey && flow.isOnline
    ? <TurnstileWidget key={flow.turnstileResetKey} siteKey={flow.turnstileSiteKey} resetKey={flow.turnstileResetKey} onToken={flow.onTurnstileToken}
      onSpaceChange={reportSpace} />
    : null
  return { widget, height: widget ? height : 0 }
}

function AccountBackState({ t, styles, loading, continueAccount, errorMessage }: Readonly<{
  t: ReturnType<typeof useLoginFlow>['t']; styles: ReturnType<typeof createLoginStyles>;
  loading: boolean | undefined; continueAccount: () => void; errorMessage: string | null
}>) {
  return <View style={styles.step}>
          <View style={styles.titleBlock}>
            <Text accessibilityRole="header" style={styles.stepTitle}>{t('auth.accountBack.title')}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.stepSubtitle}>{t('auth.accountBack.body')}</Text>
          </View>
          <PillButton onClick={continueAccount}
            loading={loading}>{t('auth.accountBack.action')}</PillButton>
          {errorMessage && <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text>}
        </View>
}
