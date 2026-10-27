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
