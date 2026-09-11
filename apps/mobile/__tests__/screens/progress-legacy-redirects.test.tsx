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
})
