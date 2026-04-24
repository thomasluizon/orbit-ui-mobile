export const DEFAULT_HABIT_EMOJI = '✨'

export const HABIT_EMOJI_OPTIONS = [
  '✨',
  '🌱',
  '💧',
  '🏃',
  '🧘',
  '📚',
  '✍️',
  '🎯',
  '🔥',
  '💪',
  '🥗',
  '😴',
  '☀️',
  '🌙',
  '🧠',
  '🎵',
  '🧹',
  '💊',
  '🪴',
  '❤️',
  '🚭',
  '🍎',
  '🕯️',
  '🧊',
] as const

export type HabitEmojiOption = (typeof HABIT_EMOJI_OPTIONS)[number]

export function resolveHabitEmoji(emoji: string | null | undefined): string {
  const normalized = emoji?.trim()
  return normalized && normalized.length > 0 ? normalized : DEFAULT_HABIT_EMOJI
}
