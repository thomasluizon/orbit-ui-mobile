'use client'

import { AnimatePresence, motion } from 'motion/react'
import { AppLogo } from '@/components/ui/app-logo'
import { EmailStep } from './email-step'
import { CodeStep } from './code-step'
import { useLoginFlow } from './use-login-flow'

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
      <div
        className="flex flex-col"
        style={{ padding: '40px 28px 24px', gap: 18 }}
      >
        <div
          className="flex flex-col items-center"
          style={{ gap: 14, paddingBottom: 4 }}
        >
          <AppLogo size={64} />
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              lineHeight: 1,
              color: 'var(--fg-1)',
            }}
          >
            Orbit
          </div>
        </div>

        <div className="flex flex-col text-center" style={{ gap: 6 }}>
          <h2
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
              color: 'var(--fg-1)',
              margin: 0,
            }}
          >
            {step === 'email' ? t('auth.signIn') : t('auth.enterCode')}
          </h2>
          {step === 'email' && (
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                lineHeight: 1.55,
                color: 'var(--fg-2)',
                margin: 0,
              }}
            >
              {t('auth.signInSubtitle')}
            </p>
          )}
        </div>

        {referralCode && (
          <motion.div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="flex items-center justify-center"
            style={{
              padding: '8px 14px',
              borderTop: '1px solid var(--hairline)',
              borderBottom: '1px solid var(--hairline)',
            }}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: {
                duration: feedbackMotion.enterDuration / 1000,
                ease: feedbackMotion.enterEasing,
              },
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--fg-1)',
                letterSpacing: '0.06em',
              }}
            >
              {t('referral.loginBanner')}
            </span>
          </motion.div>
        )}

        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            className="text-center"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              lineHeight: 1.55,
              color: 'var(--status-overdue)',
            }}
          >
            {errorMessage}
          </div>
        )}

        <AnimatePresence initial={false} mode="popLayout">
          {successMessage ? (
            <motion.div
              key={successMessage}
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="text-center"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                lineHeight: 1.55,
                color: 'var(--fg-2)',
              }}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                transition: {
                  duration: feedbackMotion.enterDuration / 1000,
                  ease: feedbackMotion.enterEasing,
                },
              }}
              exit={{
                opacity: 0,
                y: -4,
                scale: 0.99,
                transition: {
                  duration: feedbackMotion.exitDuration / 1000,
                  ease: feedbackMotion.exitEasing,
                },
              }}
            >
              {successMessage}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={step}
            initial={{
              opacity: 0,
              x: step === 'email' ? -authStepMotion.shift : authStepMotion.shift,
              scale: authStepMotion.scaleFrom,
            }}
            animate={{
              opacity: 1,
              x: 0,
              scale: authStepMotion.scaleTo,
              transition: {
                duration: authStepMotion.enterDuration / 1000,
                ease: authStepMotion.enterEasing,
              },
            }}
            exit={{
              opacity: 0,
              x:
                step === 'email'
                  ? authStepMotion.shift * 0.4
                  : -authStepMotion.shift * 0.4,
              scale: 0.99,
              transition: {
                duration: authStepMotion.exitDuration / 1000,
                ease: authStepMotion.exitEasing,
              },
            }}
          >
            {step === 'email' ? (
              <EmailStep
                email={email}
                onEmailChange={setEmail}
                isSubmitting={isSubmitting}
                isGoogleLoading={isGoogleLoading}
                onSendCode={sendCode}
                onSignInWithGoogle={signInWithGoogle}
                t={t}
              />
            ) : (
              <CodeStep
                email={email}
                codeDigits={codeDigits}
                isSubmitting={isSubmitting}
                canResend={canResend}
                resendCountdown={resendCountdown}
                codeInputRefs={codeInputRefs}
                onVerifyCode={verifyCode}
                onCodeInput={onCodeInput}
                onCodeKeydown={onCodeKeydown}
                onCodePaste={onCodePaste}
                onBackToEmail={backToEmail}
                onResendCode={resendCode}
                t={t}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
