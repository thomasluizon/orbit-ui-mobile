import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { createApiClientError } from '../utils/error-utils'

export const destructiveFailureCases = [
  { kind: 'network', createError: (): Error => new TypeError('Failed to fetch'), key: null },
  { kind: '401', createError: (): Error => createApiClientError(401, null, 'Session expired'), key: null },
  { kind: '403', createError: (): Error => createApiClientError(403, null, 'Refused'), key: 'errors.api.edgeBlocked' },
  { kind: '429', createError: (): Error => createApiClientError(429, null, 'Rate limited'), key: 'toast.errors.tooManyRequests' },
  { kind: '500', createError: (): Error => createApiClientError(500, null, 'Private server detail'), key: 'toast.errors.server' },
]

export function destructiveActionMessage(locale: string, key: string): string {
  const catalog = locale === 'pt-BR' ? ptBR : en
  const message = key.split('.').reduce<unknown>((value, part) =>
    value && typeof value === 'object' ? Reflect.get(value, part) : undefined, catalog)
  if (typeof message !== 'string') throw new Error(`Missing message: ${key}`)
  return message
}
