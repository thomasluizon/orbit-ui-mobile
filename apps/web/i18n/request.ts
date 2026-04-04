import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const locale = cookieStore.get('i18n_locale')?.value ?? 'en'
  const validLocale = locale === 'pt-BR' ? 'pt-BR' : 'en'

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
