import { readFileSync } from 'node:fs'
import postcss, { type AtRule, type Node } from 'postcss'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { orbitalMotion } from '@orbit/shared/theme'
import { Composer } from '@/components/shell/composer'
import { scaleTransition } from '@/__tests__/support/press-transition'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const stylesheet = postcss.parse(readFileSync('app/globals.css', 'utf8'))
const words = { placeholder: 'Message', send: 'Send', clear: 'Clear', paste: 'Paste', nothingToPaste: 'Empty', actions: 'Actions', suggestionsLabel: 'Suggestions' }
const suggestions = ['Log your next habit', 'Move a habit to tonight', 'Review habit steps']
  .map((label, index) => ({ id: `chip-${index}`, label, onSelect: vi.fn() })) as unknown as ComposerSuggestions
const props: ComposerProps = { words, value: '', state: 'idle', suggestions, onChangeValue: vi.fn(), onSend: vi.fn() }

function chips() {
  return within(screen.getByRole('group', { name: words.suggestionsLabel })).getAllByRole('button')
}

function conditions(node: Node): string[] {
  const found: string[] = []
  for (let parent = node.parent; parent; parent = parent.parent) if (parent.type === 'atrule') found.push(`${(parent as AtRule).name} ${(parent as AtRule).params}`)
  return found
}

/** Every `scale` the stylesheet writes for a selector that contains `fragment`, with its at-rule conditions. */
function scales(fragment: string) {
  const found: { value: string; conditions: string[] }[] = []
  stylesheet.walkRules((rule) => {
    if (rule.selectors.some((selector) => selector.includes(fragment))) rule.walkDecls('scale', (declaration) => { found.push({ value: `${declaration.value}${declaration.important ? ' !important' : ''}`, conditions: conditions(rule) }) })
  })
  return found
}

describe('web suggestion chip press motion', () => {
  it('scales a pressed chip to the shared press scale on the press duration, and only when motion is allowed', () => {
    render(<Composer {...props} />)
    expect(chips()).toHaveLength(suggestions.length)
    for (const chip of chips()) {
      expect(chip.className.split(' ').filter((name) => name.includes('scale-[')), 'the only scale is the motion-safe press').toEqual([`motion-safe:active:scale-[${orbitalMotion.press.scale}]`])
      expect(scaleTransition(chip)).toBe('var(--dur-press) var(--ease-out)')
      expect(chip, 'the hit layer keeps the press target whole while the chip scales').toHaveClass('press-hit-layer')
    }
    expect(scales('.press-hit-layer:active::before')).toEqual([{ value: `calc(1 / ${orbitalMotion.press.scale})`, conditions: ['media (prefers-reduced-motion: no-preference)', 'layer components'] }])
  })

  it('keeps the press fill and the select, and drops the scale under reduced motion', () => {
    render(<Composer {...props} />)
    const [chip] = chips()
    expect(chip).toHaveClass('active:bg-[var(--bg-hover)]')
    expect(chip!.className).not.toMatch(/(^|\s)(enabled:)?active:scale-/)
    expect(scales(':is(button, a, [role="button"], [role="radio"], [role="tab"]):active')).toEqual([{ value: 'none !important', conditions: ['media (prefers-reduced-motion: reduce)'] }])
    fireEvent.click(chip!)
    expect(suggestions[0]!.onSelect).toHaveBeenCalledOnce()
  })
})
