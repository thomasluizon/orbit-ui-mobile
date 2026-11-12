import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { classNamesIn, compileClassRules, expectHoverAndPress, FINE_POINTER_HOVER, MOTION_SAFE, type CompiledClassRules } from '@/__tests__/support/compiled-class-rules'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/lockup', () => ({ Lockup: () => <div>Orbit</div> }))

import { Select } from '@/components/ui/select'
import { ShellWide } from '@/components/shell/shell-wide'

const items = [
  { id: 'hoje', href: '/', label: 'Hoje', icon: 'hoje' },
  { id: 'calendario', href: '/calendar', label: 'Calendário', icon: 'calendario' },
]

function Fixtures() {
  return <>
    <Select label="Units" value="a" options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} onChange={vi.fn()} />
    <ShellWide astraRow={{ label: 'Astra', onOpen: vi.fn() }} items={items} activeId="hoje" navLabel="Navigation"
      onPalette={vi.fn()} paletteLabel="Search" paletteHint="Ctrl K" account="Ada Lovelace" accountEmail="ada@example.com" />
    <input aria-label="Search options" className="form-input orbit-field-hover" />
  </>
}

const FIELD_TRIGGERS = [
  { name: 'select trigger', find: () => screen.getByRole('combobox', { name: 'Units' }), press: ':enabled:active' },
  { name: 'sidebar search', find: () => screen.getByRole('button', { name: 'Search' }), press: ':active' },
] as const

const SIDEBAR_ROWS = [
  { name: 'destination link', find: () => screen.getByRole('link', { name: 'Hoje' }) },
  { name: 'Astra row', find: () => screen.getByRole('button', { name: 'Astra' }) },
  { name: 'account row', find: () => screen.getByRole('button', { name: 'Ada Lovelace, ada@example.com' }) },
] as const

describe('field triggers and sidebar rows compiled from app/globals.css', () => {
  let rules: CompiledClassRules

  beforeAll(async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: 1352 >= Number(query.match(/min-width: (\d+)px/)?.[1]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    const view = render(<Fixtures />)
    const names = classNamesIn(document)
    view.unmount()
    rules = await compileClassRules(names)
  }, 60_000)

  it.each(FIELD_TRIGGERS)('draws the $name perimeter with the control border above its fill and swaps it for the focus outline at once', ({ find }) => {
    render(<Fixtures />)
    const trigger = find()
    expect([...trigger.classList].filter((name) => name.includes('--hairline'))).toEqual([])
    expect(rules.declarationsIn(trigger, '::after').get('--tw-shadow')).toBe('inset 0 0 0 1px var(--tw-shadow-color, var(--border-control))')
    expect(rules.declarationsIn(trigger, ':focus-visible::after').get('--tw-shadow')).toBe('0 0 #0000')
    const focus = rules.declarationsIn(trigger, ':focus-visible')
    expect([focus.get('outline-width'), focus.get('outline-offset'), focus.get('outline-color')]).toEqual(['2px', 'calc(2px * -1)', 'var(--primary)'])
    const rest = rules.declarationsIn(trigger)
    expect(rest.get('background-color')).toBe('var(--bg-field)')
    expect(rest.get('transition-property')).not.toMatch(/box-shadow|background-color/)
  })

  it.each(FIELD_TRIGGERS)('layers the opaque hover fill over the $name field on a fine pointer hover and on every press, and never replaces the field fill', ({ find }) => {
    render(<Fixtures />)
    const trigger = find()
    const fill = trigger.lastElementChild!
    expect(fill).toHaveAttribute('data-press-fill', '')
    expect(fill).toHaveAttribute('aria-hidden', 'true')
    expectHoverAndPress(rules, fill, 'var(--bg-hover-opaque)')
    expect(rules.declarationsIn(fill).get('transition-duration')).toBe('var(--dur-hover-control)')
    expect(rules.rulesFor(trigger).filter((rule) => /:hover|:active/.test(rule.state) && rule.declarations.has('background-color'))).toEqual([])
  })

  it.each(FIELD_TRIGGERS)('presses the $name with the scale token over the press duration on the out curve, gated by reduced motion', ({ find, press }) => {
    render(<Fixtures />)
    const trigger = find()
    const rest = rules.declarationsIn(trigger)
    const properties = rest.get('transition-property')!.split(',')
    expect(properties.at(-1)).toBe('scale')
    expect(rest.get('transition-duration')!.split(',')).toHaveLength(properties.length)
    expect(rest.get('transition-duration')!.split(',').at(-1)).toBe('var(--dur-press)')
    expect(rest.get('transition-timing-function')!.split(',').at(-1)).toBe('var(--ease-out)')
    expect(rules.declarationsIn(trigger, press, [MOTION_SAFE]).get('scale')).toBe('0.96')
  })

  it('promotes the select chevron to fg-2 while the fill shows, timed like the fill', () => {
    render(<Fixtures />)
    const chevron = screen.getByRole('combobox', { name: 'Units' }).querySelector('svg')!
    expectHoverAndPress(rules, chevron, 'var(--fg-2)', 'color')
    expect(rules.declarationsIn(chevron).get('transition-duration')).toBe('var(--dur-hover-control)')
  })

  it('promotes the sidebar search label on hover and on press, so the pressed fill keeps it legible', () => {
    render(<Fixtures />)
    const search = screen.getByRole('button', { name: 'Search' })
    const declared = (state: string, media: readonly string[], property: string) => rules.declarationsIn(search, state, media).get(property)
    expect(declared(':hover', [FINE_POINTER_HOVER], 'color')).toBe('var(--fg-1)')
    expect(declared(':active', [], 'color')).toBe('var(--fg-1)')
    expect(declared(':hover', [FINE_POINTER_HOVER], '--fg-3')).toBe('var(--fg-2)')
    expect(declared(':active', [], '--fg-3')).toBe('var(--fg-2)')
    expect(rules.declarationsIn(search).get('transition-property')).toBe('color,scale')
  })

  it.each(SIDEBAR_ROWS)('eases the $name press scale on the press token instead of snapping on a transform transition', ({ find }) => {
    render(<Fixtures />)
    const row = find()
    const rest = rules.declarationsIn(row)
    expect(rest.get('transition-property')).toBe('background-color,color,scale')
    expect(rest.get('transition-duration')).toBe('var(--dur-hover-control),var(--dur-hover-control),var(--dur-press)')
    expect(rest.get('transition-timing-function')).toBe('var(--ease-standard),var(--ease-standard),var(--ease-out)')
    expect(rules.declarationsIn(row, ':active').get('scale')).toBe('0.96')
    expectHoverAndPress(rules, row, 'var(--bg-hover)')
  })
})

describe('shared form input compiled from app/globals.css', () => {
  it('rings the shared form input with the control border and shows the focus ring at once', async () => {
    render(<input aria-label="Search options" className="form-input orbit-field-hover" />)
    const input = screen.getByRole('textbox', { name: 'Search options' })
    const rules = await compileClassRules(input.classList)
    const formInput = rules.rulesFor(input).filter((rule) => rule.state === '' && rule.declarations.has('min-height'))
    expect(formInput).toHaveLength(1)
    expect(formInput[0]!.declarations.get('box-shadow')).toBe('inset 0 0 0 1px var(--border-control)')
    expect([...formInput[0]!.declarations.keys()].filter((property) => property.startsWith('transition'))).toEqual([])
    expect(rules.declarationsIn(input, ':focus').get('box-shadow')).toBe('inset 0 0 0 2px var(--primary)')
    expect(rules.rulesFor(input).filter((rule) => rule.state.startsWith(':is(:focus-within') && rule.declarations.get('transition') === 'none')).toHaveLength(1)
  }, 60_000)
})
