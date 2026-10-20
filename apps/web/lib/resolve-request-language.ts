import { resolveSystemLocale } from '@orbit/shared/utils'

export function resolveRequestLanguage(selected: string | undefined, acceptLanguage: string | null): string {
  return selected === 'en' || selected === 'pt-BR' ? selected : resolveSystemLocale(acceptLanguage)
}
