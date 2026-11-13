import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss, { type AtRule } from 'postcss'
import tailwind from '@tailwindcss/postcss'
import type { ReactElement } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { ListRow } from '@/components/ui/list-row'
import { Sheet } from '@/components/ui/sheet'
import { CalendarAgendaView } from '@/components/calendar/calendar-agenda-view'
import { MOTION_SAFE } from '@/__tests__/support/compiled-class-rules'

interface PressScaleRule { selectors: string[]; media: string[] }

/** An unescaped `:active`: Tailwind escapes the colons inside a class name such as `active\:scale-[0.96]`. */
const ACTIVE = /(?<!\\):active/g

/** Every compiled rule that scales an element while something is pressed, with the media queries that gate it. */
async function compilePressScaleRules(): Promise<PressScaleRule[]> {
  const source = resolve(process.cwd(), 'app/globals.css')
  const compiled = postcss.parse((await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css)
  const rules: PressScaleRule[] = []
  compiled.walkRules((rule) => {
    if (!new RegExp(ACTIVE.source).test(rule.selector)) return
    const scales = rule.nodes.some((node) => node.type === 'decl'
      && ((node.prop === 'scale' && node.value !== 'none') || (node.prop === 'transform' && /scale\(/.test(node.value))))
    if (!scales) return
    const media: string[] = []
    for (let parent = rule.parent; parent?.type === 'atrule'; parent = parent.parent) {
      if ((parent as AtRule).name === 'media') media.push((parent as AtRule).params)
    }
    rules.push({ selectors: rule.selectors, media })
  })
  return rules
}

/** The elements that a press on `control` scales. As in the browser, `:active` holds for the control and for each of its ancestors. */
function scaledWhilePressed(rules: readonly PressScaleRule[], control: Element) {
  const pressed: Element[] = []
  for (let element: Element | null = control; element; element = element.parentElement) pressed.push(element)
  for (const element of pressed) element.setAttribute('data-press-probe', '')
  try {
    return rules.flatMap(({ selectors, media }) => selectors.flatMap((selector) =>
      [...document.querySelectorAll(selector.replace(ACTIVE, '[data-press-probe]'))].map((element) => ({ element, media }))))
  } finally {
    for (const element of pressed) element.removeAttribute('data-press-probe')
  }
}

const agendaEntry: CalendarDayEntry = { habitId: 'agenda-0', title: 'Read 10 minutes', status: 'upcoming', isBadHabit: false, dueTime: '08:00', isOneTime: false }

const pressableRows: [string, () => ReactElement][] = [
  ['a button row', () => <ListRow title="Morning run" onClick={vi.fn()} />],
  ['a link row', () => <ListRow title="Account" href="/profile/account" />],
  ['a switch row', () => <ListRow title="Reminders" toggle={{ checked: false, onChange: vi.fn() }} />],
  ['a row with a trailing action', () => <ListRow title="Morning run" onClick={vi.fn()} action={{ icon: 'trash', label: 'Remove row', onPress: vi.fn() }} />],
  ['a column row', () => <ListRow title="Automatic import" placement="column" onClick={vi.fn()} />],
  ['a personal row with a split visual copy', () => <ListRow title="Ana Silva" description="ana@example.com" textMode="personal" personalExpanded={false} onClick={vi.fn()} />],
  ['a calendar Agenda row', () => <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <CalendarAgendaView startDate={new Date(2026, 9, 5)} dayMap={new Map([['2026-10-05', [agendaEntry]]])} displayTime={(time) => time}
      todayKey="2026-10-05" isLoading={false} loadingLabel={en.calendar.loading} />
  </NextIntlClientProvider>],
]

const stillRows: [string, () => ReactElement][] = [
  ['a disabled row', () => <ListRow title="Morning run" onClick={vi.fn()} disabled />],
  ['a switch row while its change is pending', () => <ListRow title="Reminders" toggle={{ checked: false, pending: true, onChange: vi.fn() }} />],
]

describe('list row press scale', () => {
  let rules: PressScaleRule[]
  beforeAll(async () => { rules = await compilePressScaleRules() })
  afterEach(cleanup)

  it.each(pressableRows)('scales the content of %s on press and never the control that owns its fill', (_name, row) => {
    render(row())
    const controls = document.querySelectorAll('.orbit-list-row-body')
    expect(controls).toHaveLength(1)
    const scaled = scaledWhilePressed(rules, controls[0]!)
    expect(scaled.map(({ element }) => element), 'the pressed row scales only its content, as the mobile row does').toEqual([document.querySelector('[data-slot="list-row-content"]')])
    expect(scaled.map(({ media }) => media), 'reduced motion removes the press scale').toEqual([[MOTION_SAFE]])
  })

  it.each(stillRows)('holds %s still on press', (_name, row) => {
    render(row())
    expect(scaledWhilePressed(rules, document.querySelector('.orbit-list-row-body')!)).toEqual([])
  })
})

describe('sheet close press scale', () => {
  let rules: PressScaleRule[]
  beforeAll(async () => { rules = await compilePressScaleRules() })
  afterEach(cleanup)

  it('scales the close glyph on press and never the close control that owns its fill and its 48px target', () => {
    render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><Sheet title="Options" onClose={vi.fn()}><p>Body</p></Sheet></NextIntlClientProvider>)
    const closes = document.querySelectorAll('.orbit-sheet-close')
    expect(closes).toHaveLength(1)
    const scaled = scaledWhilePressed(rules, closes[0]!)
    expect(scaled.map(({ element }) => element), 'the pressed close scales only its glyph').toEqual([closes[0]!.querySelector(':scope > svg')])
    expect(scaled.map(({ media }) => media), 'reduced motion removes the press scale').toEqual([[MOTION_SAFE]])
  })
})
