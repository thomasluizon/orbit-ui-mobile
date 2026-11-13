import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getLegacyRedirects } from '../../next.config'

describe('legacy Perfil settings routes', () => {
  it.each([['preferences', '/profile/preferences'], ['advanced', '/profile/ai'], ['ai-settings', '/profile/ai']])('redirects a saved /%s link to its sub-screen', (routeName, destination) => {
    expect(existsSync(resolve(process.cwd(), `app/(app)/${routeName}/page.tsx`))).toBe(false)
    expect(getLegacyRedirects()).toContainEqual({
      source: `/${routeName}`,
      destination,
      permanent: true,
    })
  })

  it('redirects the old AI settings slug to the new one and ships no page at the old slug', () => {
    expect(existsSync(resolve(process.cwd(), 'app/(app)/profile/astra/page.tsx'))).toBe(false)
    expect(existsSync(resolve(process.cwd(), 'app/(app)/profile/ai/page.tsx'))).toBe(true)
    expect(getLegacyRedirects()).toContainEqual({ source: '/profile/astra', destination: '/profile/ai', permanent: true })
  })
})
