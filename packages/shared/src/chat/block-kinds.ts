export const CHAT_BLOCK_KINDS = [
  'habitList',
  'goalList',
  'metrics',
  'periodTotal',
  'periodComparison',
  'periodInsight',
  'daySummary',
  'streak',
  'calendar',
  'recordList',
  'accountRows',
  'choice',
  'pickList',
  'habitRanking',
  'habitMonth',
] as const

export type ChatBlockKind = typeof CHAT_BLOCK_KINDS[number]
