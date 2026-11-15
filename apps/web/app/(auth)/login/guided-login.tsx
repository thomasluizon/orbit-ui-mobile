'use client'

import type { FlowStepView } from '@orbit/shared/contracts/flow'
import { deriveLoginEmailErrors, formatLoginCountdown, getAuthCallbackErrorKey, getPendingAuthProvider } from '@orbit/shared/utils'
import type { ReactNode } from 'react'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Input } from '@/components/ui/input'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { PillButton } from '@/components/ui/pill-button'
import { QuestionFlow } from '@/components/ui/question-flow'
import { LoginCodeField, LoginResend } from './code-step'
import { LoginLegalConsent, LoginProviderActions } from './email-step'
import type { LoginCallback } from './login-content'
import { LoginOfflineNotice, LoginValidationMessage, ReferralBanner } from './login-sections'
import type { useLoginFlow } from './use-login-flow'

type LoginFlow = ReturnType<typeof useLoginFlow>

interface GuidedLoginProps {
  flow: LoginFlow
  callback: LoginCallback | undefined
  callbackDismissed: boolean
  onDismissCallback: () => void
  canSubmitTurnstile: boolean
  turnstileWidget: ReactNode
}

/** The reason a press on the continue action does nothing. The offline notice and the wait of the human check show it. */
function refusalHint(flow: LoginFlow, canSubmitTurnstile: boolean) {
  if (!flow.isOnline) return flow.t('auth.errors.offline')
  return canSubmitTurnstile ? undefined : flow.t('auth.turnstileLoading')
}

function emailStep({ flow, callback, callbackDismissed, onDismissCallback, canSubmitTurnstile, turnstileWidget }: GuidedLoginProps): FlowStepView & { footer: ReactNode } {
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
    line: flow.fromOnboarding ? t('auth.line.plan', { count: flow.pendingHabitCount }) : null,
    options: (
      <div data-login-providers="" className="col-span-2 flex flex-col gap-2 text-center">
        <LoginProviderActions disabled={isBusy || !flow.isOnline} isGoogleLoading={isGoogleLoading} isAppleLoading={isAppleLoading} isOnline={flow.isOnline}
          error={errors.provider} onSignInWithGoogle={() => { onDismissCallback(); flow.signInWithGoogle() }}
          onSignInWithApple={() => { onDismissCallback(); flow.signInWithApple() }} t={t} />
      </div>
    ),
    free: (
      <form noValidate className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <Input label={t('auth.email')} hideLabel value={flow.email} onChange={(email) => { onDismissCallback(); flow.setEmail(email) }} kind="email" name="email"
          focusRequest={flow.emailFocusRequest} autoComplete="email" placeholder={t('auth.emailPlaceholder')} disabled={isBusy}
          error={errors.field ?? undefined} onSubmit={submit} />
        {turnstileWidget}
        {flow.isOnline ? null : <LoginOfflineNotice t={t} />}
        {errors.send ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{errors.send}</p> : null}
      </form>
    ),
    primary: {
      label: flow.fromOnboarding ? t('auth.onboarding.continue') : t('auth.sendCode'),
      onPress: submit, loading: flow.isSubmitting, hint: refusalHint(flow, canSubmitTurnstile),
    },
    footer: <LoginLegalConsent t={t} />,
  }
}

/** The Orbit line of the code step: where the code went, or the state that stops the code. */
function codeLine(flow: LoginFlow, waiting: boolean) {
  if (waiting) return flow.t('auth.line.codeLocked', { time: formatLoginCountdown(flow.lockCountdown) })
  if (flow.codeFailure === 'expired') return flow.t('auth.line.codeExpired')
  return flow.t('auth.line.codeSent', { email: flow.email })
}

function codeStep({ flow, canSubmitTurnstile, turnstileWidget }: GuidedLoginProps): FlowStepView & { footer: ReactNode } {
  const { t } = flow
  const locked = flow.codeFailure === 'locked'
  const waiting = locked && flow.lockCountdown > 0
  const expired = flow.codeFailure === 'expired'
  const fieldError = flow.isOnline && !locked && !expired ? flow.codeFieldError ?? flow.errorMessage ?? undefined : undefined
  const code = flow.codeDigits.join('')
  return {
    question: t('auth.verificationCode'),
    line: codeLine(flow, waiting),
    lineKey: waiting ? 'locked' : expired ? 'expired' : 'sent',
    free: (
      <div className="flex flex-col items-center gap-3 text-center">
        <form className="flex w-full flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void flow.verifyCode() }}>
          <LoginCodeField label={t('auth.verificationCode')} value={code} onChange={flow.onCodeChange} onBlur={flow.onCodeBlur}
            focusRequest={flow.codeFocusRequest} error={fieldError} hint={!fieldError && !locked && !expired ? t('auth.codeHint') : undefined}
            disabled={flow.isSubmitting || expired || waiting} expired={expired} />
          {turnstileWidget}
          {flow.isOnline ? null : <LoginOfflineNotice t={t} />}
        </form>
        {flow.successMessage ? <p aria-hidden className="font-mono text-xs text-[var(--fg-3)]">{flow.successMessage}</p> : null}
        {waiting ? null : <LoginResend ready={flow.canResend || expired} countdown={flow.resendCountdown}
          disabled={!flow.isOnline || flow.isSubmitting || !canSubmitTurnstile} loading={flow.isResending} onResend={() => void flow.resendCode()} t={t} />}
        {locked ? <div role="status" className="w-full text-start"><CapacityNotice message={t('auth.errors.tooManyAttempts')} /></div> : null}
      </div>
    ),
    primary: waiting || expired ? undefined : {
      label: t('auth.verify'), onPress: () => void flow.verifyCode(),
      loading: flow.isSubmitting && !flow.isResending, hint: refusalHint(flow, canSubmitTurnstile),
    },
    footer: null,
  }
}

/** Sign-in as a one-question flow: the email question with the two provider options, then the code question. Orbit is Parado and looks at the field in focus. */
export function GuidedLogin(props: Readonly<GuidedLoginProps>) {
  const { flow } = props
  const { t } = flow
  const coding = flow.step === 'code'
  const view = coding ? codeStep(props) : emailStep(props)
  const position = coding ? 2 : 1
  return (
    <div data-guided-login="" className="flex w-full flex-1 flex-col">
      {flow.referralCode ? <div className="mx-auto w-full max-w-[592px] px-4 pt-4"><ReferralBanner t={t} /></div> : null}
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
        footer={<>{view.footer}<LoginValidationMessage message={flow.validationGeneralError} isOnline={flow.isOnline} /></>}
      >
        {view.free}
      </QuestionFlow>
    </div>
  )
}

/** The account that came back: one centred block with Orbit in Parado and the one action into Hoje. */
export function GuidedAccountBack({ t, loading, continueAccount, errorMessage }: Readonly<{
  t: LoginFlow['t']; loading: boolean | undefined; continueAccount: () => void; errorMessage: string | null
}>) {
  const size = useStateMascotSize()
  return (
    <div data-account-back="" className="flex w-full max-w-[592px] flex-col items-center gap-6 px-4 py-4 text-center">
      <OrbitMascot size={size} />
      <div className="flex flex-col gap-3">
        <h1 className="orbit-flow-question text-balance font-display text-[28px] leading-[1.18] text-[var(--fg-1)] lg:text-[34px] lg:leading-[1.15]">{t('auth.accountBack.title')}</h1>
        <p role="status" className="text-base leading-6 text-[var(--fg-2)]">{t('auth.accountBack.body')}</p>
      </div>
      <div className="w-full lg:max-w-[360px]"><PillButton onClick={continueAccount} loading={loading}>{t('auth.accountBack.action')}</PillButton></div>
      {errorMessage ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{errorMessage}</p> : null}
    </div>
  )
}
