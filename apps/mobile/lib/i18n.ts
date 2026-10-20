import i18next from 'i18next'
import ICUCommonJs from 'i18next-icu/cjs'
import { initReactI18next } from 'react-i18next'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { resolveSystemLocale } from '@orbit/shared/utils'

export const i18n = i18next

const ICU = typeof ICUCommonJs === 'function'
  ? ICUCommonJs
  : ICUCommonJs.default

function detectInitialLocale() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale
    return resolveSystemLocale(locale)
  } catch {
    return 'en'
  }
}

void i18n.use(ICU).use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'pt-BR': { translation: ptBR },
  },
  lng: detectInitialLocale(),
  fallbackLng: 'en',
})
