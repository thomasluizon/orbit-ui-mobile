import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

export function formatConjunctionList(values: readonly string[], locale: string): string {
  const ListFormat = Intl.ListFormat
  if (typeof ListFormat === 'function') {
    return new ListFormat(locale, { style: 'long', type: 'conjunction' }).format(values)
  }

  // WHY: Android Hermes lacks ListFormat, so shared callers also work before polyfill startup. https://github.com/thomasluizon/orbit-tickets/issues/32
  const canonicalLocale = Intl.getCanonicalLocales(locale)[0]!
  const patterns = canonicalLocale.startsWith('pt') ? ptBR.listFormatting : en.listFormatting
  if (values.length < 2) return values[0] ?? ''
  const pattern = values.length === 2 || canonicalLocale === 'en-GB' ? patterns.pair : patterns.end
  const parts = { first: values.slice(0, -1).join(', '), last: values[values.length - 1]! }
  return pattern.replace(/\{(first|last)\}/g, (_, key: 'first' | 'last') => parts[key])
}
