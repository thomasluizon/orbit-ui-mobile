import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getLegacyRedirects } from '../../next.config'

describe('legacy Progresso routes', () => {
  it.each(['streak', 'achievements', 'insights', 'retrospective'])(
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
