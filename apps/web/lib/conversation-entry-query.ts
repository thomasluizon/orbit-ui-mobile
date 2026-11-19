export type ConversationEntry = 'open' | 'proactive'

const WRITTEN_PARAM = 'orbit'
const PARAM_CARRIED_BY_STORED_LINKS = 'astra'

function isConversationEntry(value: string | null): value is ConversationEntry {
  return value === 'open' || value === 'proactive'
}

export function readConversationEntry(params: Pick<URLSearchParams, 'get'>): ConversationEntry | null {
  const written = params.get(WRITTEN_PARAM)
  if (isConversationEntry(written)) return written
  const carried = params.get(PARAM_CARRIED_BY_STORED_LINKS)
  return isConversationEntry(carried) ? carried : null
}

export function buildConversationEntryHref(entry: ConversationEntry): string {
  return `/?${WRITTEN_PARAM}=${entry}`
}
