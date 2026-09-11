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
    '/streak',
    '/streak?source=saved',
    'orbit://streak',
    'orbit:///streak',
    'https://app.useorbit.org/streak',
  ])('redirects the saved streak link %s to Progresso', (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe('/progress')
  })

  it.each(['/progress', '/streaks', 'orbit://profile'])(
    'preserves the current system path %s',
    (path) => {
      expect(redirectSystemPath({ path, initial: false })).toBe(path)
    },
  )
})
