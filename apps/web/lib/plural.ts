/**
 * Handle Vue i18n pipe-separated plural strings.
 * The i18n JSON files use "singular | plural" or "zero | singular | plural" format.
 * next-intl doesn't support this, so we handle it at runtime.
 */
export function plural(text: string, count: number): string {
  if (!text.includes(' | ')) return text
  const forms = text.split(' | ').map(s => s.trim())
  if (forms.length === 2) {
    return count === 1 ? forms[0]! : forms[1]!
  }
  if (forms.length === 3) {
    if (count === 0) return forms[0]!
    if (count === 1) return forms[1]!
    return forms[2]!
  }
  return text
}
