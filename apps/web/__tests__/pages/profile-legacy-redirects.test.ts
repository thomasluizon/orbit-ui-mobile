import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getLegacyRedirects } from '../../next.config'

describe('legacy Perfil settings routes', () => {
  it.each([['preferences', '/profile/preferences'], ['advanced', '/profile/astra'], ['ai-settings', '/profile/astra']])('redirects a saved /%s link to its sub-screen', (routeName, destination) => {
    expect(existsSync(resolve(process.cwd(), `app/(app)/${routeName}/page.tsx`))).toBe(false)
    expect(getLegacyRedirects()).toContainEqual({
      source: `/${routeName}`,
      destination,
      permanent: true,
    })
  })
})
