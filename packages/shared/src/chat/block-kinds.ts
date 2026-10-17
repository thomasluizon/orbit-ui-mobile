export const CHAT_BLOCK_KINDS = [
  'habitList',
  'goalList',
  'metrics',
  'periodInsight',
  'daySummary',
  'streak',
  'calendar',
  'recordList',
  'accountRows',
] as const

export type ChatBlockKind = typeof CHAT_BLOCK_KINDS[number]
