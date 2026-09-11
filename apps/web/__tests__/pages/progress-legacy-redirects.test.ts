import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }))

vi.mock('next/navigation', () => ({ redirect }))

import RetrospectiveRedirect from '@/app/(app)/retrospective/page'
import StreakRedirect from '@/app/(app)/streak/page'

describe('legacy Progresso routes', () => {
  beforeEach(() => {
    redirect.mockReset()
  })

  it.each([
    ['streak', StreakRedirect],
    ['retrospective', RetrospectiveRedirect],
  ])('redirects %s to Progresso', (_name, LegacyRedirect) => {
    LegacyRedirect()

    expect(redirect).toHaveBeenCalledWith('/progress')
  })

  it('does not expose the removed achievements route', () => {
    const route = resolve(process.cwd(), 'app/(app)/achievements/page.tsx')

    expect(existsSync(route)).toBe(false)
  })
})
