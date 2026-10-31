import { createRoot } from 'react-dom/client'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { EmailStep } from '../../app/(auth)/login/email-step'
import { CodeStep } from '../../app/(auth)/login/code-step'
import { TurnstileWidget } from '../../components/auth/turnstile-widget'

const locale = document.documentElement.lang === 'pt-BR' ? 'pt-BR' : 'en'
const noop = () => {}

function SignInGapFixture() {
  const t = useTranslations()
  return <>{[false, true].flatMap(quiet => (['email', 'code'] as const).map(step => {
    const fixture = createLoginScreenFixture(step, locale)
    const turnstileWidget = <TurnstileWidget siteKey="layout-site-key" resetKey={0} quiet={quiet} onToken={noop} />
    return <section key={`${step}-${quiet}`} data-auth-step={step} data-quiet={String(quiet)} style={{ maxWidth: 420 }}>
      {step === 'email'
        ? <EmailStep {...fixture} t={t} emailFocusRequest={0} onEmailChange={noop} canSubmitTurnstile
          turnstileWidget={turnstileWidget} onSendCode={noop} onSignInWithGoogle={noop} />
        : <CodeStep {...fixture} t={t} errorSignal={null} canSubmitTurnstile turnstileWidget={turnstileWidget}
          isResending={false} onVerifyCode={noop} onCodeChange={noop} onBackToEmail={noop} onResendCode={noop} />}
    </section>
  }))}</>
}

createRoot(document.getElementById('sign-in-gap-fixture')!).render(
  <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC">
    <SignInGapFixture />
  </NextIntlClientProvider>,
)
