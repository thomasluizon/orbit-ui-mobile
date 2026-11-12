import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { format } from 'date-fns'
import postcss, { type Rule } from 'postcss'
import tailwind from '@tailwindcss/postcss'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { weekStartDay: 0 } }),
}))

Element.prototype.scrollIntoView = vi.fn()

import { DateField } from '@/components/ui/date-field'
import { Sheet } from '@/components/ui/sheet'

describe('DateField', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the trigger button', () => {
    render(<DateField value="" onChange={vi.fn()} />)
    expect(screen.getByLabelText('common.selectDate')).toBeInTheDocument()
  })

  it('shows placeholder when no value', () => {
    render(<DateField value="" onChange={vi.fn()} placeholder="Pick date" />)
    expect(screen.getByText('Pick date')).toBeInTheDocument()
  })

  it('keeps the empty selection prompt in the accessible name with a field label', () => {
    render(<DateField label="End date" value="" onChange={vi.fn()} placeholder="31/12/2026" />)
    expect(screen.getByRole('button', { name: 'End date, common.selectDate' })).toBeInTheDocument()
  })

  it('shows formatted date when value is set', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    expect(screen.getByText('06/15/2025')).toBeInTheDocument()
  })

  it('opens calendar dialog on click', async () => {
    render(<DateField value="" onChange={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('common.selectDate'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it.each(['2025-06-15', ''])('focuses the roving day on open with value "%s"', async (value) => {
    render(<Sheet open title="Goal" onClose={vi.fn()}><DateField value={value} onChange={vi.fn()} /></Sheet>)
    const trigger = screen.getByRole('button', { name: value ? 'common.selectedDate' : 'common.selectDate' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'common.close' })).toHaveFocus())
    fireEvent.click(trigger)

    const day = document.querySelector<HTMLButtonElement>(`button[data-day="${value || format(new Date(), 'yyyy-MM-dd')}"]`)
    expect(day).toHaveAttribute('tabindex', '0')
    await waitFor(() => expect(day).toHaveFocus())
  })

  it('has previous and next month navigation', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByLabelText('common.previousMonth')).toBeInTheDocument()
    expect(screen.getByLabelText('common.nextMonth')).toBeInTheDocument()
  })

  it('calls onChange when a day is clicked', () => {
    const onChange = vi.fn()
    render(<DateField value="2025-06-15" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    const dayButtons = document.querySelectorAll('td button')
    expect(dayButtons.length).toBeGreaterThan(0)
    fireEvent.click(dayButtons[10]!)
    expect(onChange).toHaveBeenCalled()
  })

  it('closes calendar after selecting a day', async () => {
    const onChange = vi.fn()
    render(<DateField value="2025-06-15" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    const dayButtons = document.querySelectorAll('td button')
    fireEvent.click(dayButtons[10]!)
    await waitFor(() =>
      expect(screen.queryByLabelText('common.previousMonth')).not.toBeInTheDocument(),
    )
  })

  it('renders weekday headers', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const headers = document.querySelectorAll('th')
    expect(headers).toHaveLength(7)
  })

  /** Month controls fill their columns around the unchanged 32px visible circle. */
  it('gives every day control a 44 by 44 target around its 32px circle', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))

    const dayButtons = [...document.querySelectorAll<HTMLButtonElement>('td button')]
    expect(dayButtons.length).toBeGreaterThan(0)

    for (const button of dayButtons) {
      expect(button.style.width).toBe('100%')
      expect(button.className).toContain('min-h-[var(--month-grid-touch-min)]')
      expect(button.className).not.toContain('size-8')
      expect(button.firstElementChild?.className).toContain('size-8')
    }
  })

  it('marks selected date with aria-pressed', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const selected = document.querySelector('[aria-pressed="true"]')
    expect(selected).toBeInTheDocument()
  })

  it('always renders six weeks (42 day cells) regardless of month length', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(document.querySelectorAll('tbody tr')).toHaveLength(6)
    expect(document.querySelectorAll('td button')).toHaveLength(42)
  })

  it('has no year-skip arrows, only a tappable year', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByLabelText('common.previousYear')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('common.nextYear')).not.toBeInTheDocument()
    expect(screen.getByLabelText('common.selectYear')).toBeInTheDocument()
  })

  it('opens a year picker from the year label', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    expect(screen.getByRole('button', { name: '2030' })).toBeInTheDocument()
  })

  it('fills every 48px year hit area on a 52px row pitch', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByLabelText('common.selectYear'))

    const year = screen.getByRole('button', { name: '2030' })
    expect(year).toHaveClass('min-h-12', 'rounded-full', 'hover:bg-[var(--bg-hover)]')
    expect(year.firstElementChild).toBeNull()

    const grid = year.parentElement
    expect(grid?.style.gridAutoRows).toBe('minmax(48px, auto)')
    expect(grid?.style.rowGap).toBe('4px')
  })

  it('jumps to a chosen year from the year picker', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('June')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    fireEvent.click(screen.getByRole('button', { name: '2027' }))
    expect(screen.getByText('2027')).toBeInTheDocument()
    expect(screen.getByText('June')).toBeInTheDocument()
    expect(screen.getByLabelText('common.previousMonth')).toBeInTheDocument()
  })


  it('preserves the date through year mode and commits a day only after year selection', async () => {
    const onChange = vi.fn()
    render(<DateField value="2025-06-15" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    expect(screen.getByRole('button', { name: 'June 15, 2025' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByLabelText('common.selectYear'))
    fireEvent.click(screen.getByRole('button', { name: '2030' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('June')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '2030' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('common.previousMonth'))
    expect(screen.getByText('May')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('common.nextMonth'))
    fireEvent.click(screen.getByRole('button', { name: 'June 15, 2030' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('2030-06-15'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('steps to the previous and next month', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('June')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('common.previousMonth'))
    expect(screen.getByText('May')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('common.nextMonth'))
    fireEvent.click(screen.getByLabelText('common.nextMonth'))
    expect(screen.getByText('July')).toBeInTheDocument()
  })

  it('moves the roving focus target with arrow-key grid navigation', async () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const grid = await screen.findByRole('grid')

    await waitFor(() =>
      expect(document.querySelector('button[data-day][tabindex="0"]')?.getAttribute('data-day')).toBe('2025-06-15'),
    )

    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    expect(document.querySelector('button[data-day][tabindex="0"]')?.getAttribute('data-day')).toBe('2025-06-16')

    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    expect(document.querySelector('button[data-day][tabindex="0"]')?.getAttribute('data-day')).toBe('2025-06-23')

    fireEvent.keyDown(grid, { key: 'ArrowUp' })
    fireEvent.keyDown(grid, { key: 'ArrowLeft' })
    expect(document.querySelector('button[data-day][tabindex="0"]')?.getAttribute('data-day')).toBe('2025-06-15')
  })

  it('crosses month boundaries with PageUp/PageDown navigation', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const grid = screen.getByRole('grid')

    fireEvent.keyDown(grid, { key: 'PageUp' })
    expect(screen.getByText('May')).toBeInTheDocument()

    fireEvent.keyDown(grid, { key: 'PageDown' })
    fireEvent.keyDown(grid, { key: 'PageDown' })
    expect(screen.getByText('July')).toBeInTheDocument()
  })

  it('resyncs the visible month when the value prop changes', () => {
    const { rerender } = render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    rerender(<DateField value="2025-09-15" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('September')).toBeInTheDocument()
  })
})

it('focuses the calendar trigger after a caller removes its focused action', () => {
  const { rerender } = render(<DateField label="End date" value="2026-11-01" onChange={vi.fn()} />)
  rerender(<DateField label="End date" value="" onChange={vi.fn()} focusRequest={1} />)
  expect(screen.getByRole('button', { name: 'End date, common.selectDate' })).toHaveFocus()
})

interface CompiledRule { state: string; order: number; media: string[]; declarations: Map<string, string> }

const FINE_POINTER_HOVER = '(hover: hover) and (pointer: fine)'

function classSelector(name: string) {
  return `.${name.replace(/[^\w-]/g, (character) => `\\${character}`)}`
}

describe('DateField hover, press and perimeter paint compiled from app/globals.css', () => {
  const rulesByClass = new Map<string, CompiledRule[]>()

  beforeAll(async () => {
    const view = render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const names = new Set([...document.querySelectorAll('[class]')].flatMap((element) => [...element.classList]))
    view.unmount()
    const source = resolve(process.cwd(), 'app/globals.css')
    const stylesheet = `${readFileSync(source, 'utf8')}\n@source inline("${[...names].join(' ')}");`
    const compiled = postcss.parse((await postcss([tailwind()]).process(stylesheet, { from: source })).css)
    const mediaByRule = new Map<Rule, string[]>()
    compiled.walkAtRules('media', (query) => query.walkRules((rule) => { mediaByRule.set(rule, [...(mediaByRule.get(rule) ?? []), query.params]) }))
    let order = 0
    compiled.walkRules((rule) => {
      order += 1
      const media = mediaByRule.get(rule) ?? []
      const declarations = new Map<string, string>()
      rule.walkDecls((declaration) => { declarations.set(declaration.prop, declaration.value) })
      for (const name of names) {
        const selector = classSelector(name)
        if (!rule.selector.startsWith(selector)) continue
        const state = rule.selector.slice(selector.length)
        if (state && !/^[:.[\s]/.test(state)) continue
        rulesByClass.set(name, [...(rulesByClass.get(name) ?? []), { state, order, media, declarations }])
      }
    })
  }, 60_000)

  function rulesFor(element: Element) {
    return [...element.classList].flatMap((name) => rulesByClass.get(name) ?? []).sort((left, right) => left.order - right.order)
  }

  function declarationsIn(element: Element, state = '') {
    const merged = new Map<string, string>()
    for (const rule of rulesFor(element)) if (rule.state === state && rule.media.length === 0) for (const [property, value] of rule.declarations) merged.set(property, value)
    return merged
  }

  function hoverAndPress(element: Element, fill: string) {
    const rules = rulesFor(element).filter((rule) => rule.declarations.get('background-color') === fill)
    const hover = rules.filter((rule) => rule.state.includes(':hover'))
    const press = rules.filter((rule) => rule.state.includes(':active'))
    expect(hover).toHaveLength(1)
    expect(press).toHaveLength(1)
    expect(hover[0]!.media).toEqual([FINE_POINTER_HOVER])
    expect(press[0]!.media).toEqual([])
    expect(press[0]!.state).toBe(hover[0]!.state.replace(':hover', ':active'))
    expect(press[0]!.order).toBeGreaterThan(hover[0]!.order)
  }

  it('layers the opaque hover fill over the trigger field on a fine pointer hover and on every press', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    const trigger = screen.getByRole('button')
    expect(trigger).toHaveClass('relative', 'isolate', 'bg-[var(--bg-field)]')
    const fill = trigger.querySelector('[data-press-fill]')
    expect(fill).not.toBeNull()
    expect(fill).toHaveAttribute('aria-hidden', 'true')
    expect(trigger.lastElementChild).toBe(fill)
    expect(fill).toHaveClass('pointer-events-none', 'absolute', 'inset-0', '-z-10', 'rounded-[inherit]', 'bg-transparent')
    const rest = declarationsIn(fill!)
    expect(rest.get('transition-property')).toBe('background-color')
    expect(rest.get('transition-duration')).toBe('var(--dur-hover-control)')
    expect(rest.get('transition-timing-function')).toBe('var(--ease-standard)')
    hoverAndPress(fill!, 'var(--bg-hover-opaque)')
    expect(declarationsIn(fill!, ':is(:where(.group):disabled *)').get('display')).toBe('none')
  })

  it('draws the trigger perimeter with the control border above its fill and swaps it for the focus ring at once', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    const trigger = screen.getByRole('button')
    const painted = [trigger, ...trigger.querySelectorAll('*')].flatMap((element) => [...element.classList])
    expect(painted.filter((name) => name.includes('--hairline'))).toEqual([])
    const perimeter = declarationsIn(trigger, '::after')
    expect(perimeter.get('--tw-shadow')).toBe('inset 0 0 0 1px var(--tw-shadow-color, var(--border-control))')
    expect([perimeter.get('position'), perimeter.get('inset'), perimeter.get('border-radius'), perimeter.get('pointer-events')]).toEqual(['absolute', 'var(--orbit-space-0)', 'inherit', 'none'])
    expect(perimeter.has('transition-property')).toBe(false)
    expect(declarationsIn(trigger, ':focus-visible::after').get('--tw-shadow')).toBe('0 0 #0000')
    const focus = declarationsIn(trigger, ':focus-visible')
    expect([focus.get('outline-width'), focus.get('outline-offset'), focus.get('outline-color')]).toEqual(['2px', 'calc(2px * -1)', 'var(--primary)'])
    expect(declarationsIn(trigger).get('transition-property')).toBe('scale')
  })

  it('shows the hover fill as a press fill on every day cell and month control, so a touch press paints it', () => {
    render(<DateField value="2025-06-15" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    const days = [...document.querySelectorAll<HTMLButtonElement>('button[data-day]')]
    expect(days).toHaveLength(42)
    const controls = [...days, ...['common.previousMonth', 'common.selectYear', 'common.nextMonth'].map((label) => screen.getByLabelText(label))]
    for (const control of controls) {
      expect(declarationsIn(control).get('transition-property')).toContain('background-color')
      hoverAndPress(control, 'var(--bg-hover)')
    }
  })
})
