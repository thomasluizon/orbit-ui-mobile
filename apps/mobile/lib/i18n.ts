import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { resolveSystemLocale } from '@orbit/shared/utils'

function detectInitialLocale() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale
    return resolveSystemLocale(locale)
  } catch {
    return 'en'
  }
}

// i18next's instance method `.use()` is unrelated to the React 19 `use` hook
// the linter is suggesting — this is the standard i18next chain pattern.
// eslint-disable-next-line import/no-named-as-default-member
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'pt-BR': { translation: ptBR },
  },
  lng: detectInitialLocale(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
    prefix: '{',
    suffix: '}',
  },
})

export default i18n
