import React from 'react'
import { act } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { i18n } from '@/lib/i18n'
import { createTokensV2 } from '@/lib/theme'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { CalendarAgendaView } from '@/app/(tabs)/calendar/_components/calendar-agenda-view'
import { CalendarEntryDetails } from '@/app/(tabs)/calendar/_components/calendar-entry-details'
import { ListRow } from '@/components/ui/list-row'
import { StatusRing } from '@/components/ui/status-ring'
import { buildCalendarDayMap, createTimeDisplay, parseAPIDate } from '@orbit/shared/utils'
import { createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'

vi.unmock('react-i18next')
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

const titles = ['Ler 10 minutos', 'Beber água', 'Evitar distrações', 'Preparar tudo para uma caminhada tranquila com cada coisa no seu lugar']
const dayMap = buildCalendarDayMap({
  habits: titles.map((title, index) => createMockHabitScheduleItem({
    id: `agenda-${index}`, title, dueDate: '2026-10-05', scheduledDates: ['2026-10-05'],
    children: [], hasSubHabits: false, dueTime: index === 0 ? '21:00' : index === 1 ? '08:00' : null, isBadHabit: index === 2,
  })),
  logs: { 'agenda-2': [{ id: 'avoid-log', date: '2026-10-05', value: 1, createdAtUtc: '2026-10-05T10:00:00Z' }] },
}, { from: '2026-10-05', to: '2026-10-11' }, new Date('2026-10-05T15:00:00Z'))

interface NativeNode {
  type: unknown
  props: React.ComponentProps<typeof ListRow> & {
    size?: number
    status?: string
    accessibilityRole?: string
    importantForAccessibility?: string
    entries: CalendarDayEntry[]
    style: (state: { pressed: boolean }) => StyleProp<ViewStyle>
    onPress: () => void
    onFocus: (event: { target: number; currentTarget: number }) => void
    onBlur: (event: { target: number; currentTarget: number }) => void
    onHoverIn: () => void
    onHoverOut: () => void
  }
  findAll: (predicate: (node: NativeNode) => boolean) => NativeNode[]
  findAllByType: (type: unknown) => NativeNode[]
  findByType: (type: unknown) => NativeNode
}
interface AgendaTree {
  root: NativeNode
  toJSON: () => Parameters<typeof measureProfileRow>[0]
  unmount: () => void
}
const TestRenderer = require('react-test-renderer') as { create: (element: React.ReactElement) => AgendaTree }
let tree: AgendaTree | undefined
afterEach(async () => { if (tree) await act(() => tree!.unmount()); tree = undefined; await i18n.changeLanguage('en') })

for (const locale of ['pt-BR', 'en'] as const) {
  it.each([
    { outcome: 'completed', logged: true, bad: false, upcoming: false, dueTime: '08:00', en: 'done', pt: 'feito' },
    { outcome: 'missed', logged: false, bad: false, upcoming: false, dueTime: '08:00', en: 'not logged', pt: 'sem registro' },
    { outcome: 'upcoming', logged: false, bad: false, upcoming: true, dueTime: '08:00', en: 'scheduled', pt: 'agendado' },
    { outcome: 'indulged', logged: true, bad: true, upcoming: false, dueTime: '08:00', en: 'indulged', pt: 'cedeu' },
    { outcome: 'resisted', logged: false, bad: true, upcoming: false, dueTime: '08:00', en: 'resisted', pt: 'resistiu' },
    { outcome: 'untimed', logged: false, bad: false, upcoming: true, dueTime: null, en: 'scheduled', pt: 'agendado' },
  ])(`announces the full title, visible value and $outcome outcome in ${locale}`, async (scenario) => {
    await i18n.changeLanguage(locale)
    const day = '2026-10-05'
    const title = 'A full habit title with every preparation step and the complete destination '.repeat(8).trim()
    const entries = buildCalendarDayMap({
      habits: [createMockHabitScheduleItem({ id: scenario.outcome, title, scheduledDates: [day], dueTime: scenario.dueTime, isBadHabit: scenario.bad })],
      logs: scenario.logged ? { [scenario.outcome]: [{ id: 'log', date: day, value: 1, createdAtUtc: '2026-10-05T12:00:00Z' }] } : {},
    }, { from: day, to: day }, new Date(2026, 9, scenario.upcoming ? 5 : 6, 12))
    await act(() => { tree = TestRenderer.create(<CalendarAgendaView startDate={parseAPIDate(day)} dayMap={entries}
      displayTime={createTimeDisplay(locale, locale === 'pt-BR').displayTime} todayKey={day} isLoading={false} loadingLabel={i18n.t('common.loading')} />) })
    const value = scenario.dueTime ? locale === 'en' ? '8:00 AM' : '08:00' : locale === 'en' ? 'No set time' : 'Sem hora certa'
    const controls = tree!.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button')
    expect(controls).toHaveLength(1)
    expect(controls[0]!.props.accessibilityLabel).toBe(`${title}, ${value}, ${locale === 'en' ? scenario.en : scenario.pt}`)
    expect(tree!.root.findByType(ListRow).props.value).toBe(value)
    const decorativeRing = controls[0]!.findAll((node) => node.props.importantForAccessibility === 'no-hide-descendants' && node.findAllByType(StatusRing).length === 1)
    expect(decorativeRing.length).toBeGreaterThan(0)
    expect(tree!.root.findAllByType(CalendarEntryDetails)).toHaveLength(0)
  })

  it.each([412, 1100, 1352])(`lays out the drawn Agenda rows with real ${locale} messages at %i`, async (width) => {
    await i18n.changeLanguage(locale)
    await act(() => { tree = TestRenderer.create(<CalendarAgendaView startDate={parseAPIDate('2026-10-05')} dayMap={dayMap}
      displayTime={createTimeDisplay(locale, true).displayTime} todayKey="2026-10-05" isLoading={false} loadingLabel={i18n.t('common.loading')} />) })
    const rows = tree!.root.findAllByType(ListRow)
    expect(rows.map((row) => row.props.title)).toEqual([titles[2], titles[3], titles[1], titles[0]])
    expect(rows.map((row) => row.props.value)).toEqual([i18n.t('calendar.timeGrid.noSetTime'), i18n.t('calendar.timeGrid.noSetTime'), '08:00', '21:00'])
    for (const row of rows) {
      expect(row.props.chevron).toBe(false)
      expect(row.findAllByType(StatusRing)).toHaveLength(1)
      expect(row.findByType(StatusRing).props.size).toBe(24)
      const control = row.findAll((node) => node.type === 'Pressable')[0]!
      expect(StyleSheet.flatten(control.props.style({ pressed: false }))).toMatchObject({ minHeight: 68, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 })
      expect(StyleSheet.flatten(control.props.style({ pressed: true })).backgroundColor).toBe(createTokensV2('purple', 'dark').bgHover)
    }
    expect(rows[0]!.findByType(StatusRing).props.status).toBe('bad')
    expect(tree!.root.findAll((node) => node.type === 'X')).toHaveLength(1)
    expect(tree!.root.findAll((node) => node.type === 'ChevronRight')).toHaveLength(0)
    const measured = measureProfileRow(tree!.toJSON(), width, 1)
    const headings = measured.texts.filter((text) => text.label.includes('outubro') || text.label.includes('October'))
    expect(headings[0]!.label).toBe(locale === 'pt-BR' ? 'Hoje, segunda-feira, 5 de outubro' : 'Today, Monday, October 5')
    expect(headings[1]!.label).toBe(locale === 'pt-BR' ? 'Terça-feira, 6 de outubro' : 'Tuesday, October 6')
    const values = measured.texts.filter((text) => [i18n.t('calendar.timeGrid.noSetTime'), '08:00', '21:00'].includes(text.label))
    const names = measured.texts.filter((text) => titles.includes(text.label))
    expect(names).toHaveLength(4); expect(values).toHaveLength(4)
    for (const [index, name] of names.entries()) {
      expect(measured.controls[index]!.height).toBeGreaterThanOrEqual(67)
      expect(name.left - measured.controls[index]!.left).toBe(16)
      if (index) expect(Math.abs(name.top - values[index - 1]!.bottom - 24)).toBeLessThanOrEqual(1)
    }
    const control = rows[1]!.findAll((node) => node.type === 'Pressable')[0]!
    await act(() => control.props.onPress())
    expect(tree!.root.findByType(CalendarEntryDetails).props.entries[0]!.title).toBe(titles[3])
  })
}

it('paints the Agenda row fill on keyboard focus and pointer hover', async () => {
  await act(() => { tree = TestRenderer.create(<CalendarAgendaView startDate={parseAPIDate('2026-10-05')} dayMap={dayMap}
    displayTime={(time) => time} todayKey="2026-10-05" isLoading={false} loadingLabel={i18n.t('common.loading')} />) })
  const control = () => tree!.root.findAll((node) => node.type === 'Pressable')[0]!
  await act(() => control().props.onFocus({ target: 1, currentTarget: 1 }))
  expect(StyleSheet.flatten(control().props.style({ pressed: false })).backgroundColor).toBe(createTokensV2('purple', 'dark').bgHover)
  await act(() => control().props.onBlur({ target: 1, currentTarget: 1 }))
  await act(() => control().props.onHoverIn())
  expect(StyleSheet.flatten(control().props.style({ pressed: false })).backgroundColor).toBe(createTokensV2('purple', 'dark').bgHover)
  await act(() => control().props.onHoverOut())
  expect(StyleSheet.flatten(control().props.style({ pressed: false })).backgroundColor).toBeUndefined()
})
