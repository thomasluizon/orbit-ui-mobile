import type { FlowStepView } from '@orbit/shared/contracts/flow'
import { deriveLoginEmailErrors, formatLoginCountdown, getAuthCallbackErrorKey, getPendingAuthProvider } from '@orbit/shared/utils'
import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createLoginStyles, type LoginStyles } from '@/app/login-styles'
import { useLoginFlow } from '@/app/use-login-flow'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Input } from '@/components/ui/input'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { PillButton } from '@/components/ui/pill-button'
import { QuestionFlow } from '@/components/ui/question-flow'
import { captureGuidedFlowCompleted } from '@/lib/posthog'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAuthStore } from '@/stores/auth-store'
import { useAppTheme } from '@/lib/use-app-theme'
import { LoginCodeField, LoginResend, useBackToEmail } from './code-step'
import { LoginLegalConsent, LoginProviderActions } from './email-step'
import type { LoginCallback } from './login-content'
import { LoginOfflineNotice, LoginSuccessMessage, LoginValidationMessage, ReferralBanner } from './login-sections'

type LoginFlow = ReturnType<typeof useLoginFlow>

interface GuidedLoginProps {
  flow: LoginFlow
  callback: LoginCallback | undefined
  callbackDismissed: boolean
  onDismissCallback: () => void
  canSubmitTurnstile: boolean
  turnstileWidget: ReactNode
  tokens: AppTokensV2
  styles: LoginStyles
}

/** The reason a press on the continue action does nothing. The offline notice and the wait of the human check show it. */
function refusalHint(flow: LoginFlow, canSubmitTurnstile: boolean) {
  if (!flow.isOnline) return flow.t('auth.errors.offline')
  return canSubmitTurnstile ? undefined : flow.t('auth.turnstileLoading')
}

function emailStep({ flow, callback, callbackDismissed, onDismissCallback, canSubmitTurnstile, turnstileWidget, tokens, styles }: GuidedLoginProps): FlowStepView & { footer: ReactNode } {
  const { t } = flow
  const pendingProvider = getPendingAuthProvider(callback)
  const callbackFailed = callback?.state === 'failed' && !callbackDismissed
  const isGoogleLoading = flow.isGoogleLoading || pendingProvider === 'google'
  const isAppleLoading = flow.isAppleLoading || pendingProvider === 'apple'
  const isBusy = flow.isSubmitting || isGoogleLoading || isAppleLoading
  const errors = deriveLoginEmailErrors({
    isOnline: flow.isOnline, fieldError: flow.emailFieldError,
    errorKey: callbackFailed ? getAuthCallbackErrorKey(callback.provider) : flow.errorKey,
    errorMessage: callbackFailed ? t(getAuthCallbackErrorKey(callback.provider)) : flow.errorMessage,
  })
  const submit = () => {
    onDismissCallback()
    if (flow.email.trim()) void flow.sendCode()
    else flow.refuseEmptyEmail()
  }
  return {
    question: t('auth.email'),
    line: flow.fromOnboarding ? t('auth.line.plan', { count: flow.plannedHabitCount }) : null,
    options: (
      <View testID="login-providers" style={local.providers}>
        <LoginProviderActions disabled={isBusy || !flow.isOnline} isGoogleLoading={isGoogleLoading} isAppleLoading={isAppleLoading} isOnline={flow.isOnline}
          error={errors.provider} onSignInWithGoogle={() => { onDismissCallback(); void flow.signInWithGoogle() }}
          onSignInWithApple={() => { onDismissCallback(); void flow.signInWithApple() }} styles={styles} t={t} />
      </View>
    ),
    free: (
      <>
        <Input label={t('auth.email')} hideLabel value={flow.email} onChange={(email) => { onDismissCallback(); flow.setEmail(email) }} placeholder={t('auth.emailPlaceholder')}
          kind="email" name="email" focusRequest={flow.emailFocusRequest} autoComplete="email" disabled={isBusy} onSubmit={submit} error={errors.field ?? undefined} />
        {turnstileWidget}
        {flow.isOnline ? null : <LoginOfflineNotice t={t} styles={styles} tokens={tokens} />}
        {errors.send ? <Text accessibilityRole="alert" style={styles.error}>{errors.send}</Text> : null}
      </>
    ),
    primary: {
      label: flow.fromOnboarding ? t('auth.onboarding.continue') : t('auth.sendCode'),
      onPress: submit, loading: flow.isSubmitting, hint: refusalHint(flow, canSubmitTurnstile),
    },
    footer: <LoginLegalConsent styles={styles} onOpenTerms={flow.openTerms} onOpenPrivacy={flow.openPrivacyPolicy} />,
  }
}

/** The Orbit line of the code step: where the code went, or the state that stops the code. */
function codeLine(flow: LoginFlow, waiting: boolean) {
  if (waiting) return flow.t('auth.line.codeLocked', { time: formatLoginCountdown(flow.lockCountdown) })
  if (flow.codeFailure === 'expired') return flow.t('auth.line.codeExpired')
  return flow.t('auth.line.codeSent', { email: flow.email })
}

function codeStep({ flow, canSubmitTurnstile, turnstileWidget, tokens, styles }: GuidedLoginProps): FlowStepView & { footer: ReactNode } {
  const { t } = flow
  const locked = flow.codeFailure === 'locked'
  const waiting = locked && flow.lockCountdown > 0
  const expired = flow.codeFailure === 'expired'
  const fieldError = flow.isOnline && !locked && !expired ? flow.codeFieldError ?? flow.errorMessage ?? undefined : undefined
  return {
    question: t('auth.verificationCode'),
    line: codeLine(flow, waiting),
    lineKey: waiting ? 'locked' : expired ? 'expired' : 'sent',
    free: (
      <View style={local.codePath}>
        <LoginCodeField label={t('auth.verificationCode')} value={flow.codeDigits.join('')} onChange={flow.onCodeChange} onBlur={flow.onCodeBlur}
          focusRequest={flow.codeFocusRequest} error={fieldError} hint={!fieldError && !locked && !expired ? t('auth.codeHint') : undefined}
          disabled={flow.isSubmitting || expired || waiting} />
        {turnstileWidget}
        {flow.isOnline ? null : <LoginOfflineNotice t={t} styles={styles} tokens={tokens} />}
        <LoginSuccessMessage message={flow.successMessage} styles={styles} />
        {waiting ? null : <LoginResend ready={flow.canResend || expired} countdown={flow.resendCountdown}
          disabled={!flow.isOnline || flow.isSubmitting || !canSubmitTurnstile} loading={flow.isResending} onResend={() => void flow.resendCode()} styles={styles} t={t} />}
        {locked ? <View accessibilityLiveRegion="polite" style={local.stretch}><CapacityNotice message={t('auth.errors.tooManyAttempts')} /></View> : null}
      </View>
    ),
    primary: waiting || expired ? undefined : {
      label: t('auth.verify'), onPress: () => void flow.verifyCode(),
      loading: flow.isSubmitting && !flow.isResending, hint: refusalHint(flow, canSubmitTurnstile),
    },
    footer: null,
  }
}

function CodeBack({ onBackToEmail }: Readonly<{ onBackToEmail: () => void }>) {
  useBackToEmail(onBackToEmail)
  return null
}

/** Sign-in as a one-question flow: the email question with the two provider options, then the code question. Orbit is Parado and looks at the field in focus. */
function GuidedLogin(props: Readonly<GuidedLoginProps>) {
  const { flow, styles } = props
  const { t } = flow
  const insets = useSafeAreaInsets()
  const coding = flow.step === 'code'
  const view = coding ? codeStep(props) : emailStep(props)
  const position = coding ? 2 : 1
  return (
    <View testID="guided-login" style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {coding ? <CodeBack onBackToEmail={flow.backToEmail} /> : null}
      {Platform.OS !== 'ios' && flow.showReferralBanner ? <View style={local.banner}><ReferralBanner t={t} styles={styles} /></View> : null}
      <QuestionFlow
        flow="sign_in"
        stepKey={flow.step}
        position={position}
        total={2}
        direction={coding ? 1 : -1}
        progressLabel={t('habits.flow.progress', { position, total: 2 })}
        backLabel={t('auth.changeEmail')}
        onBack={coding && !flow.isSubmitting ? flow.backToEmail : undefined}
        question={view.question}
        line={view.line}
        lineKey={view.lineKey}
        options={view.options}
        primary={view.primary}
        footer={<>{view.footer}<LoginValidationMessage message={flow.validationGeneralError} isOnline={flow.isOnline} styles={styles} /></>}
      >
        {view.free}
      </QuestionFlow>
    </View>
  )
}

/** Reports the run as completed once the code or the provider verified the person. */
function useSignInCompletion(completed: boolean) {
  useLayoutEffect(() => {
    // WHY: a layout effect runs before the passive cleanup of the QuestionFlow that unmounts, so its tracker reads a completed run, not an abandoned one. https://react.dev/reference/react/useLayoutEffect
    if (completed) captureGuidedFlowCompleted('sign_in', 2, false)
  }, [completed])
}

/** The guided sign-in surface: the account that came back, or the two questions. */
export function GuidedLoginContent({ callback }: Readonly<{ callback?: LoginCallback }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const styles = useMemo(() => createLoginStyles(tokens), [tokens])
  const flow = useLoginFlow(Boolean(callback))
  const [callbackDismissed, setCallbackDismissed] = useState(false)
  const callbackAccount = callback?.state === 'account'
  const signedIn = useAuthStore((state) => state.isAuthenticated)
  useSignInCompletion(Boolean(flow.accountBack) || callbackAccount || signedIn)
  if (flow.accountBack || callbackAccount) {
    return <GuidedAccountBack t={flow.t} styles={styles} tokens={tokens} loading={flow.isSubmitting || callback?.loading}
      continueAccount={() => { if (callbackAccount) callback.onContinue(); else void flow.continueAccount() }} errorMessage={flow.errorMessage} />
  }
  const turnstileWidget = flow.turnstileSiteKey && flow.isOnline
    ? <TurnstileWidget key={flow.turnstileResetKey} siteKey={flow.turnstileSiteKey} resetKey={flow.turnstileResetKey} onToken={flow.onTurnstileToken} />
    : null
  return <GuidedLogin flow={flow} callback={callback} callbackDismissed={callbackDismissed} onDismissCallback={() => setCallbackDismissed(true)}
    canSubmitTurnstile={!flow.turnstileSiteKey || Boolean(flow.turnstileToken)} turnstileWidget={turnstileWidget} tokens={tokens} styles={styles} />
}

/** The account that came back: one centred block with Orbit in Parado and the one action into Hoje. */
function GuidedAccountBack({ t, styles, tokens, loading, continueAccount, errorMessage }: Readonly<{
  t: LoginFlow['t']; styles: LoginStyles; tokens: AppTokensV2; loading: boolean | undefined; continueAccount: () => void; errorMessage: string | null
}>) {
  const insets = useSafeAreaInsets()
  const size = useStateMascotSize()
  return (
    <View testID="guided-account-back" style={[styles.root, local.centred, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View testID="guided-account-back-block" style={local.block}>
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden><OrbitMascot size={size} /></View>
        <View style={local.text}>
          <Text accessibilityRole="header" style={[local.title, size === 128 ? local.titleWide : null, { color: tokens.fg1 }]}>{t('auth.accountBack.title')}</Text>
          <Text accessibilityLiveRegion="polite" style={[local.body, { color: tokens.fg2 }]}>{t('auth.accountBack.body')}</Text>
        </View>
        <View style={size === 128 ? local.actionWide : local.stretch}><PillButton onClick={continueAccount} loading={loading}>{t('auth.accountBack.action')}</PillButton></View>
        {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
      </View>
    </View>
  )
}

const local = StyleSheet.create({
  providers: { width: '100%', gap: 8 },
  codePath: { width: '100%', alignItems: 'center', gap: 12 },
  stretch: { alignSelf: 'stretch' },
  banner: { width: '100%', maxWidth: 592, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16 },
  centred: { alignItems: 'center', justifyContent: 'center' },
  block: { width: '100%', maxWidth: 592, alignItems: 'center', gap: 24, paddingHorizontal: 16, paddingVertical: 16 },
  text: { gap: 12 },
  title: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 28, lineHeight: 33, textAlign: 'center' },
  titleWide: { fontSize: 34, lineHeight: 39 },
  body: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  actionWide: { width: '100%', maxWidth: 360 },
})
