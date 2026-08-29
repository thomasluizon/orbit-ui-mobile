import { describe, expect, it, vi } from 'vitest'
import AchievementsRedirect from '@/app/achievements'
import RetrospectiveRedirect from '@/app/retrospective'
import StreakRedirect from '@/app/streak'

vi.mock('expo-router', () => ({ Redirect: () => null }))

describe('legacy Progresso routes', () => {
  it.each([
    ['streak', StreakRedirect],
    ['achievements', AchievementsRedirect],
    ['retrospective', RetrospectiveRedirect],
  ])('redirects %s to Progresso', (_name, LegacyRedirect) => {
    expect(LegacyRedirect().props.href).toBe('/progress')
  })
})
