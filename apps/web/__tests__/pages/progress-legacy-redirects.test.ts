import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getLegacyRedirects } from '../../next.config'

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }))

vi.mock('next/navigation', () => ({ redirect }))

import RetrospectiveRedirect from '@/app/(app)/retrospective/page'

describe('legacy Progresso routes', () => {
  beforeEach(() => {
    redirect.mockReset()
  })

  it('redirects retrospective to Progresso', () => {
    RetrospectiveRedirect()

    expect(redirect).toHaveBeenCalledWith('/progress')
  })

  it.each(['streak', 'achievements'])(
    'does not expose the removed %s route',
    (routeName) => {
      const route = resolve(process.cwd(), `app/(app)/${routeName}/page.tsx`)

      expect(existsSync(route)).toBe(false)
    },
  )

  it('redirects saved streak links through the Next.js route table', () => {
    expect(getLegacyRedirects()).toContainEqual({
      source: '/streak',
      destination: '/progress',
      permanent: true,
    })
  })
})
