import { getRequestConfig } from 'next-intl/server'
import { IntlErrorCode } from 'next-intl'
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

  const messagesModule = (await import(`@orbit/shared/i18n/${validLocale}.json`)) as {
    default: typeof import('@orbit/shared/i18n/en.json')
  }
  const messages = messagesModule.default

  return {
    locale: validLocale,
    messages,
    onError(error) {
      if (error.code === IntlErrorCode.MISSING_MESSAGE) return
    },
    getMessageFallback({ namespace: _namespace, key }) {
      return key
    },
  }
})
