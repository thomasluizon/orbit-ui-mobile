import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { typeRoles } from '../theme/type-roles'

const root = resolve(import.meta.dirname, '../../../..')
const canvas = readFileSync(resolve(root, 'design/canvas/_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens/typography.css'), 'utf8')
const web = readFileSync(resolve(root, 'apps/web/app/globals.css'), 'utf8')

function sizes(source: string) {
  return Object.fromEntries([...source.matchAll(/(--fs-[\w-]+)\s*:\s*(\d+)px/g)].map((match) => [match[1], Number(match[2])]))
}

describe('granted typography', () => {
  it('keeps the complete web scale equal to the canvas', () => {
    expect(sizes(web)).toEqual(sizes(canvas))
  })

  it.each([
    ['hero', 'hero', 60], ['display', 'display', 44], ['h1', 'h1', 28],
    ['h2', 'h2', 22], ['row', 'row', 17], ['body', 'body', 16],
    ['secondary', 'secondary', 14], ['meta', 'meta', 12],
    ['eyebrow', 'eyebrow', 12], ['num-xl', 'numXl', 44],
  ] as const)('keeps %s at its drawn size on both platforms', (webRole, sharedRole, expected) => {
    const rule = web.match(new RegExp(`\\.t-${webRole}\\s*\\{([^}]+)\\}`))?.[1]
    const token = rule?.match(/font-size:\s*var\((--fs-[\w-]+)\)/)?.[1]
    expect(token).toBeDefined()
    expect(sizes(web)[token!]).toBe(expected)
    expect(typeRoles[sharedRole].size).toBe(expected)
  })
})
