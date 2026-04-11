/**
 * Curated accent color presets for habits. Keep aligned with
 * apps/web/lib/habit-color-palette.ts.
 */
export const HABIT_COLOR_PRESETS: readonly string[] = [
  '#8b5cf6', // violet
  '#6366f1', // indigo
  '#3b82f6', // blue
  '#0ea5e9', // sky
  '#06b6d4', // cyan
  '#14b8a6', // teal
  '#10b981', // emerald
  '#84cc16', // lime
  '#eab308', // yellow
  '#f59e0b', // amber
  '#f97316', // orange
  '#ef4444', // red
  '#ec4899', // pink
  '#a855f7', // purple
] as const

export function isValidHabitColor(value: string | null | undefined): value is string {
  return !!value && /^#[0-9a-f]{6}$/i.test(value)
}
