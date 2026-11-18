import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postcss, { type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const stylesheet = postcss.parse(readFileSync(join(__dirname, '..', '..', '..', 'app/globals.css'), 'utf8'))
const SELECTED = ':is(.orbit-selection-ring[data-selected], .orbit-selection-ring[aria-checked="true"], .orbit-selection-ring[aria-pressed="true"], .orbit-selection-ring[aria-selected="true"], .chip-active)'

function boxShadowOf(selector: string) {
  const values: string[] = []
  stylesheet.walkRules((rule) => { if (rule.selector === selector) rule.walkDecls('box-shadow', (declaration) => { values.push(declaration.value) }) })
  return values
}

describe('selection ring width on web', () => {
  it('keeps each control at its own width: 2px by default, 1.5px on the thin ring and the period chip, 1px on the chip', () => {
    const declared: { selector: string; value: string }[] = []
    stylesheet.walkDecls('--selection-ring-width', (declaration) => { declared.push({ selector: (declaration.parent as Rule).selector, value: declaration.value }) })
    expect(declared).toEqual([
      { selector: '.chip-active', value: '1px' },
      { selector: '.chip-period.chip-active', value: '1.5px' },
      { selector: '.orbit-selection-ring-thin', value: '1.5px' },
    ])
    expect(resolveWebThemeVariables('orange', 'dark')).not.toHaveProperty('--selection-ring-width')
  })

  it('rests the selected ring at the control width and keeps it under focus, directly inside the 2px focus ring', () => {
    expect(boxShadowOf(`${SELECTED}:not(:focus-visible):not(:has(:focus-visible)):not(:focus-visible *)`)).toEqual(['inset 0 0 0 var(--selection-ring-width, 2px) var(--selection-ring-color, var(--primary))'])
    expect(boxShadowOf(`${SELECTED}:is(:focus-visible, :has(:focus-visible), :focus-visible *)`)).toEqual(['inset 0 0 0 calc(2px + var(--selection-ring-width, 2px)) var(--selection-ring-color, var(--primary))'])
  })
})
