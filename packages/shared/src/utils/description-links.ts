type DescriptionPart = { text: string; href?: string; offset: number }

function descriptionLinkDestination(text: string): string | undefined {
  if (!/^https?:\/\/[^/?#\\]/i.test(text) || /\\|%(?![\da-f]{2})/i.test(text)) return
  try {
    const destination = new URL(text)
    if ((destination.protocol === 'http:' || destination.protocol === 'https:') && destination.hostname) return text
  } catch {
    return
  }
}

export function splitDescriptionLinks(description: string): DescriptionPart[] {
  const parts: DescriptionPart[] = []
  let cursor = 0
  for (const token of description.matchAll(/\S+/g)) {
    const match = /^[([{'"<]*(https?:\/\/[^\s<>"`]+)/i.exec(token[0])
    if (!match) continue
    const offset = token.index + match[0].length - match[1]!.length
    let text = match[1]!.replace(/[.,;!?'“”]+$/, '')
    for (const [opening, closing] of [['(', ')'], ['[', ']'], ['{', '}']] as const) {
      while (text.endsWith(closing) && text.split(closing).length > text.split(opening).length) text = text.slice(0, -1)
    }
    const href = descriptionLinkDestination(text)
    if (!href) continue
    if (offset > cursor) parts.push({ text: description.slice(cursor, offset), offset: cursor })
    parts.push({ text, href, offset })
    cursor = offset + text.length
  }
  if (cursor < description.length) parts.push({ text: description.slice(cursor), offset: cursor })
  return parts
}
