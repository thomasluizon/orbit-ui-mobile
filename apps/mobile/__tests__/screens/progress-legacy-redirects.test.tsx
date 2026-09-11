import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import RetrospectiveRedirect from '@/app/retrospective'
import StreakRedirect from '@/app/streak'

vi.mock('expo-router', () => ({ Redirect: () => null }))

describe('legacy Progresso routes', () => {
  it.each([
    ['streak', StreakRedirect],
    ['retrospective', RetrospectiveRedirect],
  ])('redirects %s to Progresso', (_name, LegacyRedirect) => {
    expect(LegacyRedirect().props.href).toBe('/progress')
  })

  it('does not expose the removed achievements route', () => {
    const route = resolve(process.cwd(), 'app/achievements.tsx')

    expect(existsSync(route)).toBe(false)
  })

  it('does not retain the replaced standalone goal list components', () => {
    const replacedFiles = [
      'components/goal-card.tsx',
      'components/goals/goal-list.tsx',
      'components/goals/goal-metrics-panel.tsx',
    ]

    for (const file of replacedFiles) {
      expect(existsSync(resolve(process.cwd(), file))).toBe(false)
    }
  })
})
