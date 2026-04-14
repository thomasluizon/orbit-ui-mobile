import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { resolveSystemLocale } from '@orbit/shared/utils'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const cookieLocale = cookieStore.get('i18n_locale')?.value
  const acceptLanguage = headerStore.get('accept-language')
  const validLocale =
    cookieLocale === 'en' || cookieLocale === 'pt-BR'
      ? cookieLocale
    : resolveSystemLocale(acceptLanguage)

  const messages = (await import(`@orbit/shared/i18n/${validLocale}.json`)).default

  return {
    locale: validLocale,
    messages,
    onError(error) {
      if (error.code === 'MISSING_MESSAGE') return
      // Swallow i18n errors in production -- do not log to console
    },
    getMessageFallback({ namespace: _namespace, key }) {
      return key
    },
  }
})
