import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getLegacyRedirects } from '../../next.config'

describe('legacy Perfil settings routes', () => {
  it.each(['preferences', 'advanced', 'ai-settings'])('redirects a saved /%s link to Perfil', (routeName) => {
    expect(existsSync(resolve(process.cwd(), `app/(app)/${routeName}/page.tsx`))).toBe(false)
    expect(getLegacyRedirects()).toContainEqual({
      source: `/${routeName}`,
      destination: '/profile',
      permanent: true,
    })
  })
})
