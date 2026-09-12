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

  it('does not retain the replaced standalone goal list components', () => {
    const replacedFiles = [
      'components/goals/goal-card.tsx',
      'components/goals/goal-list.tsx',
      'components/goals/goal-metrics-panel.tsx',
      'components/goals/goal-status-badge.tsx',
    ]

    for (const file of replacedFiles) {
      expect(existsSync(resolve(process.cwd(), file))).toBe(false)
    }
  })
})
