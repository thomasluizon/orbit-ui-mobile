import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { redirectSystemPath } from '@/app/+native-intent'

describe('legacy Progresso routes', () => {
  it.each(['streak', 'achievements', 'insights', 'retrospective'])(
    'does not expose the removed %s route',
    (routeName) => {
      const route = resolve(process.cwd(), `app/${routeName}.tsx`)

      expect(existsSync(route)).toBe(false)
    },
  )

  it.each([
    ['/streak', '/progress/streak'],
    ['/streak?source=saved#freezes', '/progress/streak?source=saved#freezes'],
    ['orbit://streak', '/progress/streak'],
    ['orbit:///streak', '/progress/streak'],
    ['https://app.useorbit.org/streak?source=saved#freezes', '/progress/streak?source=saved#freezes'],
    ['orbit-staging://streak?source=saved#freezes', '/progress/streak?source=saved#freezes'],
    ['/achievements?earned=latest#first', '/progress/achievements?earned=latest#first'],
    ['/goals?status=Active#goal-1', '/progress/goals?status=Active#goal-1'],
  ])('redirects the saved link %s to its detail', (path, destination) => {
    expect(redirectSystemPath({ path, initial: true })).toBe(destination)
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
  it.each(['/progress', '/streaks', 'orbit://profile'])(
    'preserves the current system path %s',
    (path) => {
      expect(redirectSystemPath({ path, initial: false })).toBe(path)
    },
  )
})
