import { readFileSync } from 'node:fs'
import postcss, { list } from 'postcss'
import { describe, expect, it } from 'vitest'
import { motionEasings, motionPresets } from '@orbit/shared/theme'
import { resolveWebMotionVariables } from '@/lib/theme-dom'

const stylesheet = postcss.parse(readFileSync('app/globals.css', 'utf8'))

/** The declarations of the one rule whose selector list is exactly `selectors`. */
function declarationsOf(...selectors: string[]): Record<string, string> {
  const found: Record<string, string>[] = []
  stylesheet.walkRules((rule) => {
    if (rule.selectors.join(',') !== selectors.join(',')) return
    const declarations: Record<string, string> = {}
    rule.walkDecls((declaration) => { declarations[declaration.prop] = list.comma(declaration.value).join(', ') })
    found.push(declarations)
  })
  expect(found, selectors.join(', ')).toHaveLength(1)
  return found[0]!
}

describe('selection settle on web', () => {
  it('publishes the selection preset and the standard curve to the stylesheet', () => {
    const variables = resolveWebMotionVariables()
    expect(variables['--motion-selection-enter']).toBe(`${motionPresets.selection.enterDuration}ms`)
    expect(variables['--motion-selection-exit']).toBe(`${motionPresets.selection.exitDuration}ms`)
    expect(variables['--motion-ease-standard']).toBe(`cubic-bezier(${motionEasings.standard.join(',')})`)
  })

  it('eases a selection ring in on the selection preset and out on its shorter exit, keeping the hover and press timing', () => {
    expect(declarationsOf('.orbit-selection-ring')).toEqual({
      'transition-property': 'box-shadow, background-color, color, scale',
      'transition-duration': 'var(--motion-selection-exit), var(--dur-hover-control), var(--dur-hover-control), var(--dur-press)',
      'transition-timing-function': 'var(--motion-ease-exit), var(--ease-standard), var(--ease-standard), var(--ease-out)',
    })
    expect(declarationsOf(':is(.orbit-selection-ring[data-selected], .orbit-selection-ring[aria-checked="true"], .orbit-selection-ring[aria-pressed="true"], .orbit-selection-ring[aria-selected="true"])')).toEqual({
      'transition-duration': 'var(--motion-selection-enter), var(--dur-hover-control), var(--dur-hover-control), var(--dur-press)',
      'transition-timing-function': 'var(--motion-ease-standard), var(--ease-standard), var(--ease-standard), var(--ease-out)',
    })
  })

  it('settles the chip ring the same way while its fill, colour and press keep their timing', () => {
    expect(declarationsOf('.chip').transition).toBe('background-color var(--dur-hover-control) var(--ease-standard), color var(--dur-hover-control) var(--ease-standard), transform var(--dur-press) var(--ease-out), box-shadow var(--motion-selection-exit) var(--motion-ease-exit)')
    const active: Record<string, string>[] = []
    stylesheet.walkRules('.chip-active', (rule) => {
      const declarations: Record<string, string> = {}
      rule.walkDecls(/^transition/, (declaration) => { declarations[declaration.prop] = list.comma(declaration.value).join(', ') })
      if (Object.keys(declarations).length) active.push(declarations)
    })
    expect(active).toEqual([{
      'transition-duration': 'var(--dur-hover-control), var(--dur-hover-control), var(--dur-press), var(--motion-selection-enter)',
      'transition-timing-function': 'var(--ease-standard), var(--ease-standard), var(--ease-out), var(--motion-ease-standard)',
    }])
  })

  it('settles the checkbox fill in on the selection preset as it fills and out on its shorter exit as it clears', () => {
    expect(declarationsOf('.orbit-checkbox-box')).toEqual({ transition: 'background-color var(--motion-selection-exit) var(--motion-ease-exit)' })
    expect(declarationsOf('.orbit-checkbox-box[data-filled]')).toEqual({
      'transition-duration': 'var(--motion-selection-enter)',
      'transition-timing-function': 'var(--motion-ease-standard)',
    })
  })
})
