'use client'

import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { EmailStep } from './email-step'
import { CodeStep } from './code-step'
import { useLoginFlow } from './use-login-flow'
import {
  LoginHeader,
  ReferralBanner,
  LoginSuccessMessage,
  LoginStepStage,
} from './login-sections'

export default function LoginPage() {
  const {
    t,
    step,
    email,
    setEmail,
    isSubmitting,
    isGoogleLoading,
    errorMessage,
    successMessage,
    referralCode,
    fromOnboarding,
    pendingHabitCount,
    isOnline,
    authStepMotion,
    feedbackMotion,
    codeDigits,
    codeInputRefs,
    canResend,
    resendCountdown,
    onCodeInput,
    onCodeKeydown,
    onCodePaste,
    sendCode,
    verifyCode,
    resendCode,
    backToEmail,
    signInWithGoogle,
  } = useLoginFlow()

  return (
    <div className="w-full max-w-[26rem] min-[480px]:min-w-[22rem]">
      {referralCode && <ReferralBanner motionPreset={feedbackMotion} t={t} />}
      <div
        className="flex flex-col"
        style={{ padding: '40px 28px 24px', gap: 18 }}
      >
        <LoginHeader
          step={step}
          t={t}
          fromOnboarding={fromOnboarding}
          pendingHabitCount={pendingHabitCount}
        />

        <LoginSuccessMessage message={successMessage} motionPreset={feedbackMotion} />

        {!isOnline && (
          <OfflineUnavailableState
            title={t('offline.title')}
            description={t('offline.description')}
            compact
          />
        )}

        <LoginStepStage
          step={step}
          motionPreset={authStepMotion}
          emailStep={
            <EmailStep
              email={email}
              onEmailChange={setEmail}
              isSubmitting={isSubmitting}
              isGoogleLoading={isGoogleLoading}
              isOnline={isOnline}
              onSendCode={sendCode}
              onSignInWithGoogle={signInWithGoogle}
              t={t}
            />
          }
          codeStep={
            <CodeStep
              email={email}
              codeDigits={codeDigits}
              isSubmitting={isSubmitting}
              canResend={canResend}
              resendCountdown={resendCountdown}
              codeInputRefs={codeInputRefs}
              errorSignal={errorMessage}
              isOnline={isOnline}
              onVerifyCode={verifyCode}
              onCodeInput={onCodeInput}
              onCodeKeydown={onCodeKeydown}
              onCodePaste={onCodePaste}
              onBackToEmail={backToEmail}
              onResendCode={resendCode}
              t={t}
            />
          }
        />
      </div>
    </div>
  )
}
