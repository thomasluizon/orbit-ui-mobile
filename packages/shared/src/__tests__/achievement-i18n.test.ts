import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'
import { achievementEmoji } from '../utils/achievement-emoji'

const BACKEND_ACHIEVEMENT_KEYS = [
  'first_orbit',
  'liftoff',
  'mission_control',
  'onboarding_complete',
  'week_warrior',
  'fortnight_focus',
  'monthly_master',
  'quarter_champion',
  'centurion',
  'year_of_discipline',
  'half_year_hero',
  'streak_titan',
  'getting_momentum',
  'building_habits',
  'dedicated',
  'relentless',
  'legendary',
  'goal_setter',
  'goal_crusher',
  'overachiever',
  'dream_maker',
  'perfect_day',
  'perfect_week',
  'perfect_month',
  'early_bird',
  'night_owl',
  'comeback',
  'bad_habit_breaker',
  'first_cheer',
] as const

interface AchievementCopy {
  name: string
  description: string
}

function achievementCopy(
  bundle: typeof en | typeof ptBR,
  key: string,
): AchievementCopy | undefined {
  const achievements = bundle.gamification.achievements as Record<
    string,
    AchievementCopy | undefined
  >
  return achievements[key]
}

describe('achievement i18n coverage', () => {
  it.each(BACKEND_ACHIEVEMENT_KEYS)(
    'has en name and description for "%s"',
    (key) => {
      const copy = achievementCopy(en, key)
      expect(copy?.name?.trim()).toBeTruthy()
      expect(copy?.description?.trim()).toBeTruthy()
    },
  )

  it.each(BACKEND_ACHIEVEMENT_KEYS)(
    'has pt-BR name and description for "%s"',
    (key) => {
      const copy = achievementCopy(ptBR, key)
      expect(copy?.name?.trim()).toBeTruthy()
      expect(copy?.description?.trim()).toBeTruthy()
    },
  )

  it.each(BACKEND_ACHIEVEMENT_KEYS)(
    'resolves a distinct emoji (not the fallback) for "%s"',
    (key) => {
      expect(achievementEmoji(key)).not.toBe('✨')
    },
  )
})
