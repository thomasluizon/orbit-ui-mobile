import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { offScaleCss, checkSpacing } = require('../_spacing-contract.cjs')

describe('padding contract CSS guard', () => {
  it('keeps the shared scale equal to the granted canvas spacing tokens', () => {
    const definition = require('../../packages/shared/src/theme/spacing.json')
    const canvas = readFileSync(new URL('../../design/canvas/_ds/orbit-design-system-918bd5d7-839c-4dd0-811b-4a8781f60507/tokens/spacing.css', import.meta.url), 'utf8')
    const values = [...canvas.matchAll(/--s-\d+:(\d+)(?:px)?;/g)].map((match) => Number(match[1]))
    expect(Object.values(definition.scale)).toEqual(values)
    for (const role of Object.values(definition.roles)) expect(definition.scale).toHaveProperty(role)
  })
  it.each([
    ['.card { padding: 20px }', ['padding: 20px']],
    ['.row { margin: 0 0.375rem }', ['margin: 0.375rem']],
    ['.sheet { padding-inline: max(20px, env(safe-area-inset-left)) }', ['padding-inline: 20px']],
    ['.card { padding: var(--space-20, 20px) }', ['padding: 20px']],
    ['.code { padding: 0.15em 0.4em }', ['padding: 0.15em', 'padding: 0.4em']],
    ['.form-input { @apply px-4 py-3.5; }', ['@apply: py-3.5']],
    ['.row { @apply md:!m-5 p-px px-[20px]; }', ['@apply: md:!m-5', '@apply: p-px', '@apply: px-[20px]']],
    ['.row { @apply px-4 py-3 p-card-inset; }', []],
    ['.row { margin-inline: auto; padding: var(--orbit-space-16); padding-bottom: max(24px, env(safe-area-inset-bottom)) }', []],
    ['.row { padding: 0 8px 12px 16px; margin: -8px 1.5rem }', []],
  ])('checks %s', (source, findings) => {
    expect(offScaleCss(source)).toEqual(findings)
  })

  it('checks the whole source tree without a violation baseline and keeps aliases generated', () => {
    expect(checkSpacing()).toEqual([])
  })
})
