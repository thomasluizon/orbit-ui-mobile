const ACHIEVEMENT_EMOJI: Record<string, string> = {
  first_orbit: '🪐',
  liftoff: '🚀',
  mission_control: '🛰️',
  week_warrior: '🔥',
  fortnight_focus: '📅',
  monthly_master: '🗓️',
  quarter_champion: '🏅',
  centurion: '💯',
  year_of_discipline: '🏆',
  getting_momentum: '🌀',
  building_habits: '🧱',
  dedicated: '💪',
  relentless: '🏔️',
  legendary: '🌟',
  goal_setter: '🎯',
  goal_crusher: '🏁',
  overachiever: '🥇',
  dream_maker: '💫',
  perfect_day: '🌞',
  perfect_week: '⚡',
  perfect_month: '👑',
  early_bird: '🌅',
  night_owl: '🦉',
  comeback: '☄️',
  bad_habit_breaker: '🛡️',
}

/** Emoji for an achievement tile, keyed by the API's `iconKey`. */
export function achievementEmoji(iconKey: string): string {
  return ACHIEVEMENT_EMOJI[iconKey] ?? '✨'
}
