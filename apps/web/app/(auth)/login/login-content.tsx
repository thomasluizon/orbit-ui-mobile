'use client'

import { useState } from 'react'
import { Lockup } from '@/components/ui/lockup'
import { PillButton } from '@/components/ui/pill-button'
import { EmailStep } from './email-step'
import { CodeStep } from './code-step'
import { useLoginFlow } from './use-login-flow'
import { LoginHeader, ReferralBanner, LoginStepStage } from './login-sections'

export interface LoginCallback {
  state: 'pending' | 'failed' | 'account'
  onContinue: () => void
  loading?: boolean
}

export function LoginContent({ callback }: Readonly<{ callback?: LoginCallback }>) {
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
  return (
    <div className="flex w-full flex-col gap-8 px-2 pb-4 pt-8 min-[336px]:px-4 md:w-[420px] md:rounded-[var(--r-card)] md:bg-[var(--bg-card)] md:p-8 md:shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
      {flow.referralCode && !account && <ReferralBanner t={t} />}
      <Lockup />
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{flow.successMessage}</p>
      {account ? <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[22px] font-medium leading-[1.2] tracking-[-0.02em]">{t('auth.accountBack.title')}</h1>
          <p role="status" className="text-base leading-normal text-[var(--fg-2)]">{t('auth.accountBack.body')}</p>
        </div>
        <PillButton onClick={continueAccount}
          loading={flow.isSubmitting || callback?.loading}>{t('auth.accountBack.action')}</PillButton>
        {flow.errorMessage && <p role="alert" className="text-sm text-[var(--status-bad-text)]">{flow.errorMessage}</p>}
      </div> : <LoginStepStage step={flow.step} motionPreset={flow.authStepMotion}>
        <div className="flex flex-col gap-6">
          <LoginHeader step={flow.step} t={t} fromOnboarding={flow.fromOnboarding} pendingHabitCount={flow.pendingHabitCount} />
          {flow.step === 'email' ? <EmailStep email={flow.email} onEmailChange={(email) => { setCallbackDismissed(true); flow.setEmail(email) }}
            isSubmitting={flow.isSubmitting} isGoogleLoading={flow.isGoogleLoading || googlePending}
            errorKey={googleFailed ? 'auth.errors.googleError' : flow.errorKey}
            errorMessage={googleFailed ? t('auth.errors.googleError') : flow.errorMessage}
            isOnline={flow.isOnline} t={t}
            onSendCode={() => { setCallbackDismissed(true); void flow.sendCode() }}
              onSignInWithGoogle={() => { setCallbackDismissed(true); void flow.signInWithGoogle() }}
            sendCodeLabel={flow.fromOnboarding ? t('auth.onboarding.continue') : undefined} />
            : <CodeStep email={flow.email} codeDigits={flow.codeDigits} isSubmitting={flow.isSubmitting}
              canResend={flow.canResend} resendCountdown={flow.resendCountdown} codeFailure={flow.codeFailure}
              lockCountdown={flow.lockCountdown} errorSignal={flow.errorMessage} successMessage={flow.successMessage}
              isOnline={flow.isOnline} onCodeChange={flow.onCodeChange} onBackToEmail={flow.backToEmail} t={t}
              onVerifyCode={() => void flow.verifyCode()} onResendCode={() => void flow.resendCode()} />}
        </div>
      </LoginStepStage>}
    </div>
  )
}
