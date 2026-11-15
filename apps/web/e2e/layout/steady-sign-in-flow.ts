import { createTranslator } from 'next-intl'
import { createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const locale = document.documentElement.lang === 'pt-BR' ? 'pt-BR' : 'en'
const step = document.documentElement.dataset.authStep === 'code' ? 'code' : 'email'
const noop = () => {}
const flow = {
  ...createLoginScreenFixture(step, locale),
  t: createTranslator({ locale, messages: locale === 'en' ? en : ptBR }),
  turnstileSiteKey: 'layout-site-key', turnstileToken: null, turnstileResetKey: 0, onTurnstileToken: noop,
  setEmail: noop, sendCode: noop, verifyCode: noop, resendCode: noop, backToEmail: noop, onCodeChange: noop,
  signInWithGoogle: noop, signInWithApple: noop, continueAccount: noop,
}

export function useLoginFlow() {
  return flow
}
