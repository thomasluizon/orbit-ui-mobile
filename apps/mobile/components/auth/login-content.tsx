import { useState } from 'react'
import { Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { Lockup } from '@/components/ui/lockup'
import { PillButton } from '@/components/ui/pill-button'
import { createLoginStyles } from '@/app/login-styles'
import { useLoginFlow } from '@/app/use-login-flow'
import { LoginHeader, ReferralBanner, LoginStepStage } from './login-sections'
import { EmailStep } from './email-step'
import { CodeStep } from './code-step'

export interface LoginCallback {
  state: 'pending' | 'failed' | 'account'
  onContinue: () => void
  loading?: boolean
}

export function LoginContent({ callback }: Readonly<{ callback?: LoginCallback }>) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const wide = width >= 768
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createLoginStyles(tokens)
  const flow = useLoginFlow()
  const { t } = flow
  const [callbackDismissed, setCallbackDismissed] = useState(false)
  function continueAccount() {
    if (callback?.state === 'account') callback.onContinue()
    else void flow.continueAccount()
  }
  const account = Boolean(flow.accountBack) || callback?.state === 'account'
  const googlePending = callback?.state === 'pending'
  const googleFailed = callback?.state === 'failed' && !callbackDismissed
  const emailErrorKey = googleFailed ? 'auth.errors.googleError' : flow.errorKey
  const emailErrorMessage = googleFailed ? t('auth.errors.googleError') : flow.errorMessage
  const sendCodeLabel = flow.fromOnboarding ? t('auth.onboarding.continue') : undefined
  return <View style={styles.root}>
    <KeyboardAwareScrollView containerStyle={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      contentContainerStyle={[styles.scrollContent, wide && styles.scrollWide]} keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}>
      <View style={[styles.formColumn, width < 336 && { paddingHorizontal: 8 }, wide && styles.panel]}>
        {flow.showReferralBanner && !account && <ReferralBanner t={t} styles={styles} />}
        <Lockup />
        {account ? <AccountBackState t={t} styles={styles} loading={flow.isSubmitting || callback?.loading}
          continueAccount={continueAccount} errorMessage={flow.errorMessage} /> : <LoginStepStage step={flow.step}>
          <View style={styles.step}>
            <LoginHeader step={flow.step} t={t} styles={styles} fromOnboarding={flow.fromOnboarding} plannedHabitCount={flow.plannedHabitCount} />
            {flow.step === 'email' ? <EmailStep email={flow.email} onEmailChange={(email) => { setCallbackDismissed(true); flow.setEmail(email) }}
              isSubmitting={flow.isSubmitting} isGoogleLoading={flow.isGoogleLoading || googlePending}
              errorKey={emailErrorKey}
              errorMessage={emailErrorMessage}
              isOnline={flow.isOnline} t={t} tokens={tokens} styles={styles}
              onSendCode={() => { setCallbackDismissed(true); void flow.sendCode() }}
              onSignInWithGoogle={() => { setCallbackDismissed(true); void flow.signInWithGoogle() }}
              onOpenPrivacy={flow.openPrivacyPolicy} onOpenTerms={flow.openTerms}
              sendCodeLabel={sendCodeLabel} />
              : <CodeStep email={flow.email} codeDigits={flow.codeDigits} isSubmitting={flow.isSubmitting}
                canResend={flow.canResend} resendCountdown={flow.resendCountdown} codeFailure={flow.codeFailure}
                lockCountdown={flow.lockCountdown} errorSignal={flow.errorMessage} successMessage={flow.successMessage}
                isOnline={flow.isOnline} onCodeChange={flow.onCodeChange} onBackToEmail={flow.backToEmail} t={t}
                tokens={tokens} styles={styles} onVerifyCode={() => void flow.verifyCode()}
                onResendCode={() => void flow.resendCode()} />}
          </View>
        </LoginStepStage>}
      </View>
    </KeyboardAwareScrollView>
  </View>
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
