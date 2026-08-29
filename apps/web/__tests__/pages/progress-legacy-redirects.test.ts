import { beforeEach, describe, expect, it, vi } from 'vitest'

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }))

vi.mock('next/navigation', () => ({ redirect }))

import AchievementsRedirect from '@/app/(app)/achievements/page'
import RetrospectiveRedirect from '@/app/(app)/retrospective/page'
import StreakRedirect from '@/app/(app)/streak/page'

describe('legacy Progresso routes', () => {
  beforeEach(() => {
    redirect.mockReset()
  })

  it.each([
    ['streak', StreakRedirect],
    ['achievements', AchievementsRedirect],
    ['retrospective', RetrospectiveRedirect],
  ])('redirects %s to Progresso', (_name, LegacyRedirect) => {
    LegacyRedirect()

    expect(redirect).toHaveBeenCalledWith('/progress')
  })
})
