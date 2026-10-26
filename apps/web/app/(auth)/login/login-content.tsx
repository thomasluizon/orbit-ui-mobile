'use client'

import { getPendingAuthProvider, getAuthCallbackErrorKey } from '@orbit/shared/utils'

import { useState } from 'react'
import { Lockup } from '@/components/ui/lockup'
import { PillButton } from '@/components/ui/pill-button'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import { EmailStep } from './email-step'
import { CodeStep } from './code-step'
import { useLoginFlow } from './use-login-flow'
import { LoginHeader, ReferralBanner, LoginStepStage, LoginValidationMessage } from './login-sections'

export interface LoginCallback {
  provider?: 'apple' | 'google'
  state: 'pending' | 'failed' | 'account'
  onContinue: () => void
  loading?: boolean
}

export function LoginContent({ callback }: Readonly<{ callback?: LoginCallback }>) {
  const flow = useLoginFlow(Boolean(callback))
  const { t } = flow
  const [callbackDismissed, setCallbackDismissed] = useState(false)
  function continueAccount() {
    if (callback?.state === 'account') callback.onContinue()
    else void flow.continueAccount()
  }
  const account = Boolean(flow.accountBack) || callback?.state === 'account'
  const canSubmitTurnstile = !flow.turnstileSiteKey || Boolean(flow.turnstileToken)
  const turnstileWidget = flow.turnstileSiteKey && flow.isOnline
    ? <TurnstileWidget key={flow.turnstileResetKey} siteKey={flow.turnstileSiteKey} resetKey={flow.turnstileResetKey} onToken={flow.onTurnstileToken} />
    : null
  return (
    <div data-field-surface="responsive-card" className="flex w-full flex-col gap-8 px-2 py-4 min-[336px]:px-4 md:w-[420px] md:rounded-[var(--r-card)] md:bg-[var(--bg-card)] md:p-8 md:shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
      {flow.referralCode && !account && <ReferralBanner t={t} />}
      <Lockup />
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{flow.successMessage}</p>
      {account ? <AccountBackState t={t} loading={flow.isSubmitting || callback?.loading} continueAccount={continueAccount} errorMessage={flow.errorMessage} /> : <LoginStepStage step={flow.step} motionPreset={flow.authStepMotion}>
        <div className="flex flex-col gap-6">
          {flow.step === 'email' && <LoginHeader step="email" t={t} fromOnboarding={flow.fromOnboarding} pendingHabitCount={flow.pendingHabitCount} />}
          {flow.step === 'email' ? <LoginEmailStep flow={flow} callback={callback} callbackDismissed={callbackDismissed}
            onDismissCallback={() => setCallbackDismissed(true)} canSubmitTurnstile={canSubmitTurnstile} turnstileWidget={turnstileWidget} />
            : <CodeStep email={flow.email} codeDigits={flow.codeDigits} isSubmitting={flow.isSubmitting} isResending={flow.isResending}
              canResend={flow.canResend} resendCountdown={flow.resendCountdown} codeFailure={flow.codeFailure}
              lockCountdown={flow.lockCountdown} fieldError={flow.codeFieldError} errorSignal={flow.errorMessage} onCodeBlur={flow.onCodeBlur} codeFocusRequest={flow.codeFocusRequest} successMessage={flow.successMessage}
              isOnline={flow.isOnline} onCodeChange={flow.onCodeChange} onBackToEmail={flow.backToEmail} t={t}
              canSubmitTurnstile={canSubmitTurnstile} turnstileWidget={turnstileWidget}
              onVerifyCode={() => void flow.verifyCode()} onResendCode={() => void flow.resendCode()} />}
        </div>
      </LoginStepStage>}
      <LoginValidationMessage message={flow.validationGeneralError} isOnline={flow.isOnline} />
    </div>
  )
}

function LoginEmailStep({ flow, callback, callbackDismissed, onDismissCallback, canSubmitTurnstile, turnstileWidget }: Readonly<{
  flow: ReturnType<typeof useLoginFlow>; callback: LoginCallback | undefined; callbackDismissed: boolean
  onDismissCallback: () => void; canSubmitTurnstile: boolean; turnstileWidget: React.ReactNode
}>) {
  const { t } = flow
  const pendingProvider = getPendingAuthProvider(callback)
  const callbackErrorKey = getAuthCallbackErrorKey(callback?.provider)
  const providerCallbackFailed = callback?.state === 'failed' && !callbackDismissed
  return <EmailStep email={flow.email} onEmailChange={(email) => { onDismissCallback(); flow.setEmail(email) }}
    isSubmitting={flow.isSubmitting} isGoogleLoading={flow.isGoogleLoading || pendingProvider === 'google'}
    isAppleLoading={flow.isAppleLoading || pendingProvider === 'apple'}
    errorKey={providerCallbackFailed ? callbackErrorKey : flow.errorKey}
    fieldError={flow.emailFieldError}
    errorMessage={providerCallbackFailed ? callback.provider === 'apple' ? t('auth.errors.appleError') : t('auth.errors.googleError') : flow.errorMessage}
    isOnline={flow.isOnline} t={t} emailFocusRequest={flow.emailFocusRequest}
    canSubmitTurnstile={canSubmitTurnstile} turnstileWidget={turnstileWidget}
    onSendCode={() => { onDismissCallback(); void flow.sendCode() }}
    onSignInWithApple={() => { onDismissCallback(); flow.signInWithApple() }}
    onSignInWithGoogle={() => { onDismissCallback(); flow.signInWithGoogle() }}
    sendCodeLabel={flow.fromOnboarding ? t('auth.onboarding.continue') : undefined} />
}

function AccountBackState({ t, loading, continueAccount, errorMessage }: Readonly<{
  t: ReturnType<typeof useLoginFlow>['t']; loading: boolean | undefined
  continueAccount: () => void; errorMessage: string | null
}>) {
  return <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-[22px] font-medium leading-[1.2] tracking-[-0.02em]">{t('auth.accountBack.title')}</h1>
      <p role="status" className="text-base leading-normal text-[var(--fg-2)]">{t('auth.accountBack.body')}</p>
    </div>
    <PillButton onClick={continueAccount} loading={loading}>{t('auth.accountBack.action')}</PillButton>
    {errorMessage && <p role="alert" className="text-sm text-[var(--status-bad-text)]">{errorMessage}</p>}
  </div>
}
