/**
 * Handle pipe-separated plural strings from shared i18n JSON files.
 * Format: "singular | plural" or "zero | singular | plural".
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
