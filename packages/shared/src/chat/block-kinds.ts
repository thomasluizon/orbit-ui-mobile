export const CHAT_BLOCK_KINDS = [
  'habitList',
  'goalList',
  'metrics',
  'periodTotal',
  'periodComparison',
  'periodInsight',
  'daySummary',
  'streak',
  'gamification',
  'calendar',
  'recordList',
  'accountRows',
  'choice',
  'pickList',
  'question',
  'habitRanking',
  'habitMonth',
  'habitSuggestions',
] as const

export type ChatBlockKind = typeof CHAT_BLOCK_KINDS[number]

export function createChatBlockRegistry<Registry extends Record<ChatBlockKind, unknown>>(renderers: Registry): Pick<Registry, ChatBlockKind> {
  for (const kind of CHAT_BLOCK_KINDS) {
    if (typeof renderers[kind] !== 'function') throw new Error(`Missing chat block renderer: ${kind}`)
  }
  return Object.fromEntries(CHAT_BLOCK_KINDS.map(kind => [kind, renderers[kind]])) as Pick<Registry, ChatBlockKind>
}
