import { createRoot } from 'react-dom/client'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { LoginContent } from '../../app/(auth)/login/login-content'
import { AuthPageFrame } from '../../components/auth/auth-page-frame'

const locale = document.documentElement.lang === 'pt-BR' ? 'pt-BR' : 'en'

createRoot(document.getElementById('steady-sign-in-column-fixture')!).render(
  <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC">
    <AuthPageFrame><LoginContent /></AuthPageFrame>
  </NextIntlClientProvider>,
)
