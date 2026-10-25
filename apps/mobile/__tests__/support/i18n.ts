import { createInstance, type i18n } from 'i18next'
import ICUCommonJs from 'i18next-icu/cjs'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'

const ICU = typeof ICUCommonJs === 'function' ? ICUCommonJs : ICUCommonJs.default

export const testI18n: i18n = createInstance()
void testI18n.use(ICU).init({
  resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
  lng: 'en', fallbackLng: 'en', initAsync: false,
})
