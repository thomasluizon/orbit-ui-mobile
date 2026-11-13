import { readFileSync } from 'node:fs'
import postcss, { type AtRule, type Node, type Rule } from 'postcss'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { orbitalMotion } from '@orbit/shared/theme'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckRow } from '@/components/ui/check-row'
import { ListRow } from '@/components/ui/list-row'
import { PageHeader } from '@/components/ui/page-header'
import { Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Toast } from '@/components/ui/toast'

vi.mock('next-intl', () => ({ useLocale: () => 'en-US', useTranslations: () => (key: string) => key }))
Object.defineProperty(Element.prototype, 'hasPointerCapture', { configurable: true, value: () => false })

const stylesheet = postcss.parse(readFileSync('app/globals.css', 'utf8'))

function media(rule: Rule): string[] {
  const conditions: string[] = []
  for (let parent: Node | undefined = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule') conditions.push(`${(parent as AtRule).name} ${(parent as AtRule).params}`)
  return conditions
}

/** Every rule that sets `property` for a selector that contains `fragment`, with its at-rule conditions. */
function rulesSetting(property: string, fragment: string): { selectors: string[]; value: string; conditions: string[] }[] {
  const found: { selectors: string[]; value: string; conditions: string[] }[] = []
  stylesheet.walkRules((rule) => {
    if (!rule.selectors.some((selector) => selector.includes(fragment))) return
    rule.walkDecls(property, (declaration) => { found.push({ selectors: rule.selectors, value: declaration.value, conditions: media(rule) }) })
  })
  return found
}

describe('press feedback that keeps the press target on web', () => {
  const contentLayers = [
    '.orbit-list-row-body > [data-slot="list-row-content"]',
    '.orbit-menu-content',
    '.orbit-press-content > :not([data-press-fill])',
    '.orbit-press-content > [data-press-fill] > *',
    '.orbit-tab > [data-tab-indicator] > :not([data-selection-motion])',
    '.orbit-tab > :not([data-tab-indicator])',
  ]

  it('scales only the content of a pressed row, item or small control, by the shared press scale, and only when motion is allowed', () => {
    const [press] = rulesSetting('scale', '.orbit-press-content:active')
    expect(press?.value).toBe(String(orbitalMotion.press.scale))
    expect(press?.conditions).toEqual(['media (prefers-reduced-motion: no-preference)'])
    expect(press?.selectors).toHaveLength(contentLayers.length)
    for (const selector of press!.selectors) {
      expect(selector, 'the scale lands on a child, never on the control that holds the press').toMatch(/:active.*>/)
    }
  })

  it('eases each content layer over the shared press duration on the enter curve', () => {
    const [transition] = rulesSetting('transition', '.orbit-press-content > :not([data-press-fill])')
    expect(transition?.selectors).toEqual(contentLayers)
    expect(transition?.value).toBe('scale var(--dur-press) var(--ease-out)')
  })

  it('scales the glyph of the pressed sheet close by the shared press scale, and never the close control that owns its fill and its target', () => {
    expect(rulesSetting('scale', '.orbit-sheet-close:active')).toEqual([
      { selectors: ['.orbit-sheet-close:active > svg'], value: String(orbitalMotion.press.scale), conditions: ['media (prefers-reduced-motion: no-preference)'] },
    ])
    expect(rulesSetting('transform', '.orbit-sheet-close')).toEqual([])
  })

  it('gives the row, check row, checkbox, slider thumb and select option a content layer under their unscaled press target', async () => {
    const view = render(<>
      <ListRow title="Frequency" onClick={vi.fn()} />
      <CheckRow label="Water" checked={false} onChange={vi.fn()} />
      <Checkbox label="Done" checked={false} onChange={vi.fn()} />
      <Slider label="Mood" value={2} valueText="2" min={1} max={5} step={1} onChange={vi.fn()} />
    </>)
    const row = screen.getByRole('button', { name: 'Frequency' })
    expect(row).toHaveClass('orbit-list-row-body')
    expect(row.querySelector(':scope > [data-slot="list-row-content"]')).not.toBeNull()
    for (const control of [screen.getByRole('checkbox', { name: 'Water' }), screen.getByRole('checkbox', { name: 'Done' }), screen.getByRole('slider', { name: 'Mood' })]) {
      expect(control).toHaveClass('orbit-press-content')
      expect(control.children.length).toBeGreaterThan(0)
    }
    view.unmount()
    const user = userEvent.setup()
    render(<Select label="Units" value="a" onChange={vi.fn()} options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} />)
    await user.click(screen.getByRole('combobox', { name: 'Units' }))
    expect(screen.getByRole('option', { name: 'Beta' })).toHaveClass('orbit-press-content')
  })

  it('scales and fills the pressed page header back control as the app bar back does', () => {
    render(<PageHeader title="Ajuda" backLabel="Voltar" onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('motion-safe:active:scale-[0.96]', 'active:bg-[var(--bg-hover)]', 'transition-[background-color,scale]')
  })

  it('scales the toast text action label inside its unscaled action', () => {
    render(<Toast kind="neutral" message="Deleted" actionLabel="Undo" onAction={vi.fn()} />)
    const action = screen.getByRole('button', { name: 'Undo' })
    expect(action).toHaveClass('orbit-press-content')
    expect(action.firstElementChild).toHaveTextContent('Undo')
  })
})
