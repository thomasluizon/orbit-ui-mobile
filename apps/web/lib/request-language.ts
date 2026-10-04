import { cookies, headers } from 'next/headers'
import { resolveRequestLanguage } from './resolve-request-language'

export async function getServerRequestLanguage(source?: { get: (name: string) => { value?: string } | undefined }): Promise<string> {
  const cookieStore = source ?? await cookies()
  const headerStore = await headers()
  return resolveRequestLanguage(cookieStore.get('i18n_locale')?.value, headerStore.get('accept-language'))
}
