const COMPLETE_CHAT_DIRECTIVE = /\[\[orbit:[a-z:]+\]\]/gi

const CHAT_DIRECTIVE_OPEN = '[[orbit:'

function isChatDirectivePrefix(candidate: string): boolean {
  const normalized = candidate.toLowerCase()
  if (CHAT_DIRECTIVE_OPEN.startsWith(normalized)) return true
  if (!normalized.startsWith(CHAT_DIRECTIVE_OPEN)) return false

  const body = normalized.slice(CHAT_DIRECTIVE_OPEN.length)
  const closingBracket = body.indexOf(']')
  const directiveBody = closingBracket === -1 ? body : body.slice(0, closingBracket)
  if (closingBracket !== -1 && closingBracket !== body.length - 1) return false

  return [...directiveBody].every((character) =>
    character === ':' || (character >= 'a' && character <= 'z'),
  )
}

function stripTrailingChatDirectivePrefix(content: string): string {
  const withoutTrailingWhitespace = content.trimEnd()
  const directiveStart = withoutTrailingWhitespace.lastIndexOf('[[')
  if (directiveStart >= 0) {
    const candidate = withoutTrailingWhitespace.slice(directiveStart)
    if (isChatDirectivePrefix(candidate)) {
      return withoutTrailingWhitespace.slice(0, directiveStart).trimEnd()
    }
  }
  return withoutTrailingWhitespace.endsWith('[')
    ? withoutTrailingWhitespace.slice(0, -1).trimEnd()
    : withoutTrailingWhitespace
}

/**
 * Removes `[[orbit:...]]` directives Astra emits to request rendered cards. The
 * server strips them from the final message, but streamed deltas still carry them
 * mid-flight. Complete directives are always removed; a partial trailing token is
 * removed only while the message is actively streaming.
 */
export function stripChatDirectives(content: string, isStreaming = false): string {
  const withoutCompleteDirectives = content.replace(COMPLETE_CHAT_DIRECTIVE, '')
  return isStreaming
    ? stripTrailingChatDirectivePrefix(withoutCompleteDirectives)
    : withoutCompleteDirectives.trimEnd()
}

export function hasChatProse(content: string): boolean {
  return content.split(/\r?\n/).some((line) => {
    const compact = line.replace(/[ \t]/g, '')
    return compact !== '' && !/^(?:-{3,}|\*{3,}|_{3,})$/.test(compact)
  })
}
