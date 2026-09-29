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

const RETIRED_EARNED_ACHIEVEMENT_KEYS = [
  'team_player',
  'mission_accomplished',
  'battle_buddy',
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
  it.each([
    { locale: 'en', bundle: en, gettingStarted: 'Getting started', together: 'Together' },
    { locale: 'pt-BR', bundle: ptBR, gettingStarted: 'Primeiros passos', together: 'Em grupo' },
  ])('uses sentence case for achievement categories in $locale', ({ bundle, gettingStarted, together }) => {
    expect(bundle.gamification.categories.GettingStarted).toBe(gettingStarted)
    expect(bundle.gamification.categories.Together).toBe(together)
    for (const category of Object.values(bundle.gamification.categories)) {
      expect(category).not.toMatch(/\p{Ll}\s+\p{Lu}/u)
    }
  })

  it.each([
    { locale: 'en', bundle: en, legend: ['day active', 'day frozen', 'day missed'] },
    { locale: 'pt-BR', bundle: ptBR, legend: ['dia ativo', 'dia congelado', 'dia sem registro'] },
  ])('uses the drawn streak legend in $locale', ({ bundle, legend }) => {
    expect([bundle.progressScreen.streak.active, bundle.progressScreen.streak.frozen, bundle.progressScreen.streak.missed]).toEqual(legend)
  })

  it.each(BACKEND_ACHIEVEMENT_KEYS)(
    'has en name and description for "%s"',
    (key) => {
      const copy = achievementCopy(en, key)
      expect(copy?.name.trim()).toBeTruthy()
      expect(copy?.description.trim()).toBeTruthy()
    },
  )

  it.each(BACKEND_ACHIEVEMENT_KEYS)(
    'has pt-BR name and description for "%s"',
    (key) => {
      const copy = achievementCopy(ptBR, key)
      expect(copy?.name.trim()).toBeTruthy()
      expect(copy?.description.trim()).toBeTruthy()
    },
  )

  it.each(BACKEND_ACHIEVEMENT_KEYS)(
    'resolves a distinct emoji (not the fallback) for "%s"',
    (key) => {
      expect(achievementEmoji(key)).not.toBe('✨')
    },
  )

  it.each(RETIRED_EARNED_ACHIEVEMENT_KEYS)(
    'retains en and pt-BR copy for earned retired achievement "%s"',
    (key) => {
      for (const locale of [en, ptBR]) {
        const copy = achievementCopy(locale, key)
        expect(copy?.name.trim()).toBeTruthy()
        expect(copy?.description.trim()).toBeTruthy()
      }
    },
  )
})
