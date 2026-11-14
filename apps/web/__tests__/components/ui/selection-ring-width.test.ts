import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postcss, { type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'
import { SELECTION_RING_WIDTH } from '@orbit/shared/theme'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const stylesheet = postcss.parse(readFileSync(join(__dirname, '..', '..', '..', 'app/globals.css'), 'utf8'))
const SELECTED = ':is(.orbit-selection-ring[data-selected], .orbit-selection-ring[aria-checked="true"], .orbit-selection-ring[aria-pressed="true"], .orbit-selection-ring[aria-selected="true"], .chip-active)'

function boxShadowOf(selector: string) {
  const values: string[] = []
  stylesheet.walkRules((rule) => { if (rule.selector === selector) rule.walkDecls('box-shadow', (declaration) => { values.push(declaration.value) }) })
  return values
}

describe('one selection ring on web', () => {
  it('draws every selection ring at the shared width, which only the root declares', () => {
    const declared: { selector: string; value: string }[] = []
    stylesheet.walkDecls('--selection-ring-width', (declaration) => { declared.push({ selector: (declaration.parent as Rule).selector, value: declaration.value }) })
    expect(declared).toEqual([{ selector: ':root', value: `${SELECTION_RING_WIDTH}px` }])
    expect(resolveWebThemeVariables('orange', 'dark')['--selection-ring-width']).toBe(`${SELECTION_RING_WIDTH}px`)
  })

  it('rests the selected ring at the shared width and keeps it under focus, directly inside the 2px focus ring', () => {
    expect(boxShadowOf(`${SELECTED}:not(:focus-visible):not(:has(:focus-visible)):not(:focus-visible *)`)).toEqual(['inset 0 0 0 var(--selection-ring-width) var(--selection-ring-color, var(--primary))'])
    expect(boxShadowOf(`${SELECTED}:is(:focus-visible, :has(:focus-visible), :focus-visible *)`)).toEqual(['inset 0 0 0 calc(2px + var(--selection-ring-width)) var(--selection-ring-color, var(--primary))'])
  })
})
