'use client'
import type { AuthCallbackState } from '@orbit/shared/utils/auth-callback-failure'

import { useState } from 'react'
import { LazyMotion, domMin } from 'motion/react'
import { TurnstileWidget } from '@/components/auth/turnstile-widget'
import { GuidedAccountBack, GuidedLogin, useSignInCompletion } from './guided-login'
import { useLoginFlow } from './use-login-flow'

export interface LoginCallback {
  provider?: 'apple' | 'google'
  state: AuthCallbackState
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
  useSignInCompletion((account || flow.signedIn))
  const canSubmitTurnstile = !flow.turnstileSiteKey || Boolean(flow.turnstileToken)
  const turnstileWidget = flow.turnstileSiteKey && flow.isOnline
    ? <TurnstileWidget key={flow.turnstileResetKey} siteKey={flow.turnstileSiteKey} resetKey={flow.turnstileResetKey} onToken={flow.onTurnstileToken} />
    : null
  return (
    <LazyMotion features={domMin}>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{flow.successMessage}</p>
      {account
        ? <GuidedAccountBack t={t} loading={flow.isSubmitting || callback?.loading} continueAccount={continueAccount} errorMessage={flow.errorMessage} />
        : <GuidedLogin flow={flow} callback={callback} callbackDismissed={callbackDismissed} onDismissCallback={() => setCallbackDismissed(true)}
          canSubmitTurnstile={canSubmitTurnstile} turnstileWidget={turnstileWidget} />}
    </LazyMotion>
  )
}
