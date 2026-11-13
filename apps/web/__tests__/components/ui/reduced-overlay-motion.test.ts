import { readFileSync } from 'node:fs'
import postcss, { type AtRule } from 'postcss'
import { describe, expect, it } from 'vitest'

const stylesheet = postcss.parse(readFileSync('app/globals.css', 'utf8'))

/** Every declaration of `property` inside a reduced-motion query, keyed by the rule's selector list. */
function reducedDeclarations(property: string): Map<string, string[]> {
  const found = new Map<string, string[]>()
  stylesheet.walkAtRules('media', (media: AtRule) => {
    if (media.params !== '(prefers-reduced-motion: reduce)') return
    media.walkRules((rule) => {
      rule.walkDecls(property, (declaration) => {
        const key = rule.selectors.join(', ')
        found.set(key, [...(found.get(key) ?? []), `${declaration.value}${declaration.important ? ' !important' : ''}`])
      })
    })
  })
  return found
}

describe('overlay motion under reduced motion on web', () => {
  it('makes every stylesheet transition and animation instant, the still variant the Android overlays use', () => {
    expect(reducedDeclarations('transition-duration').get('*, *::before, *::after')).toEqual(['0.01ms !important'])
    expect(reducedDeclarations('animation-duration').get('*, *::before, *::after')).toEqual(['0.01ms !important'])
  })

  it('removes the travel of the sheet, the menu and the select popup', () => {
    expect(reducedDeclarations('transform').get('.orbit-sheet-panel, .orbit-sheet-panel[data-starting-style], .orbit-sheet-panel[data-ending-style]')).toEqual(['none'])
    expect(reducedDeclarations('animation').get('.orbit-menu-panel, .orbit-select-panel')).toEqual(['none'])
    expect(reducedDeclarations('animation').get('.orbit-menu-panel[data-state="closed"], .orbit-menu-panel[data-ending-style], .orbit-select-panel[data-state="closed"]')).toEqual(['orbit-menu-fade-out var(--motion-menu-exit) linear'])
  })
})
