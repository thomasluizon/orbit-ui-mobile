type DescriptionPart = { text: string; href?: string; offset: number }

function descriptionLinkDestination(text: string): string | undefined {
  if (!/^https?:\/\/[^/?#\\]/i.test(text) || /\\|%(?![\da-f]{2})/i.test(text)) return
  try {
    const destination = new URL(text)
    if (!destination.hostname.startsWith('[') || destination.hostname.includes('%')) {
      const hostname = decodeURIComponent(destination.hostname)
      if (Array.from(hostname).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || '#%/:<>?@[\\]^|'.includes(character))) return
    }
    if ((destination.protocol === 'http:' || destination.protocol === 'https:') && destination.hostname) return text
  } catch {
    return
  }
}

function trimDescriptionLink(text: string): string {
  let end = text.length
  while (end > 0 && ".,;!?'“”".includes(text[end - 1]!)) end -= 1
  const pairs = [
    { opening: '(', closing: ')', balance: 0 },
    { opening: '[', closing: ']', balance: 0 },
    { opening: '{', closing: '}', balance: 0 },
  ]
  for (let index = 0; index < end; index += 1) {
    for (const pair of pairs) {
      if (text[index] === pair.opening) pair.balance += 1
      else if (text[index] === pair.closing) pair.balance -= 1
    }
  }
  for (const pair of pairs) {
    while (end > 0 && text[end - 1] === pair.closing && pair.balance < 0) {
      end -= 1
      pair.balance += 1
    }
  }
  return text.slice(0, end)
}

export function splitDescriptionLinks(description: string): DescriptionPart[] {
  const parts: DescriptionPart[] = []
  let cursor = 0
  for (const token of description.matchAll(/\S+/g)) {
    const match = /^[([{'"<]*(https?:\/\/[^\s<>"`]+)/i.exec(token[0])
    if (!match) continue
    const offset = token.index + match[0].length - match[1]!.length
    const text = trimDescriptionLink(match[1]!)
    const href = descriptionLinkDestination(text)
    if (!href) continue
    if (offset > cursor) parts.push({ text: description.slice(cursor, offset), offset: cursor })
    parts.push({ text, href, offset })
    cursor = offset + text.length
  }
  if (cursor < description.length) parts.push({ text: description.slice(cursor), offset: cursor })
  return parts
}
