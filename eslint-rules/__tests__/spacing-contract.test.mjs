import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { offScaleCss, checkSpacing } = require('../_spacing-contract.cjs')

describe('padding contract CSS guard', () => {
  it.each([
    ['.card { padding: 20px }', ['padding: 20px']],
    ['.row { margin: 0 0.375rem }', ['margin: 0.375rem']],
    ['.sheet { padding-inline: max(20px, env(safe-area-inset-left)) }', ['padding-inline: 20px']],
    ['.card { padding: var(--space-20, 20px) }', ['padding: 20px']],
    ['.code { padding: 0.15em 0.4em }', ['padding: 0.15em', 'padding: 0.4em']],
    ['.row { margin-inline: auto; padding: var(--orbit-space-16); padding-bottom: max(24px, env(safe-area-inset-bottom)) }', []],
    ['.row { padding: 0 8px 12px 16px; margin: -8px 1.5rem }', []],
  ])('checks %s', (source, findings) => {
    expect(offScaleCss(source)).toEqual(findings)
  })

  it('checks the whole source tree without a violation baseline and keeps aliases generated', () => {
    expect(checkSpacing()).toEqual([])
  })
})
