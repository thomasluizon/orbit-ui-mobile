import React from 'react'
import { StyleSheet } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CalendarDayDetail } from '@/app/(tabs)/calendar/_components/calendar-day-detail'
import { createTokensV2 } from '@/lib/theme'
import { i18n } from '@/lib/i18n'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import type { CalendarSyncEvent } from '@orbit/shared'
import { calendarDayCardDate, makeCalendarDayCardEntries } from '@orbit/shared/test-support/calendar-day-card-fixtures'
import { CheckRow } from '@/components/ui/check-row'

vi.unmock('react-i18next')
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
const TestRenderer = require('react-test-renderer')
afterEach(async () => { await i18n.changeLanguage('en') })

function replayTextLayout(tree: ReturnType<typeof TestRenderer.create>, width: number, scale: number) {
  const measured = measureProfileRow(tree.toJSON(), width, scale)
  for (const text of tree.root.findAllByType('Text')) {
    if (!text.props.onTextLayout) continue
    const label = text.props.children as string
    const available = measured.controls.find((control) => control.labels.includes(label))!.width - 32
    const style = { ...StyleSheet.flatten(text.props.style), opacity: 1, width: undefined }
    const lines: string[] = []
    let current = ''
    for (const word of label.split(/(?<=\s)/u)) {
      const candidate = current + word
      const bounds = measureProfileRow({ type: 'Text', props: { style }, children: [candidate] }, 10_000, scale).texts[0]!
      if (current && bounds.width > available) { lines.push(current); current = word }
      else current = candidate
    }
    if (current) lines.push(current)
    TestRenderer.act(() => text.props.onTextLayout({ nativeEvent: { lines: lines.map((text, index) => ({ text, x: 0, y: index * Number(style.fontSize) * 1.4 * scale, width: available, height: Number(style.fontSize) * 1.4 * scale, ascender: Number(style.fontSize) * scale, descender: 0, baseline: Number(style.fontSize) * scale, capHeight: Number(style.fontSize) * scale, xHeight: Number(style.fontSize) * scale })) } }))
  }
}

const events: CalendarSyncEvent[] = Array.from({ length: 21 }, (_, index) => ({
  id: `event-${index}`, title: index === 0 ? '1:1 FutureProofing Engineering' : `Evento ${index}`,
  description: null, startDate: '2026-09-12', startTime: '09:00', endTime: null,
  isRecurring: false, recurrenceRule: null, reminders: [], calendarName: 'Trabalho',
}))

function expectDefaultScaleGeometry(
  measured: ReturnType<typeof measureProfileRow>, width: number, loggable: boolean,
  eventTexts: ReturnType<typeof measureProfileRow>['texts'],
  habitTexts: ReturnType<typeof measureProfileRow>['texts'],
  habitRow: ReturnType<typeof measureProfileRow>['controls'][number],
) {
  const route = measured.controls.find((control) => control.accessibilityLabel === i18n.t('calendar.goToDay'))!
  const routeLabel = measured.texts.find((text) => text.label === i18n.t('calendar.goToDay'))!
  expect(routeLabel.lines, JSON.stringify(routeLabel)).toBe(1)
  expect(routeLabel.clipped).toBe(false)
  expect(routeLabel.left).toBe(route.left + 16 + 28 + 12)
  expect(Math.abs(routeLabel.top + routeLabel.height / 2 - route.top - route.height / 2)).toBeLessThanOrEqual(1)
  expect(routeLabel.right).toBeLessThanOrEqual(route.right - 16)
  expect(route.left).toBe(24)
  expect(route.right).toBe(width - 32 - 24)
  for (const text of eventTexts) expect(text.clipped).toBe(false)
  expect(habitTexts.reduce((count, text) => count + text.lines, 0)).toBe(2)
  expect(habitRow.height + (loggable ? 24 : 0)).toBeGreaterThanOrEqual(loggable ? 48 : 68)
  expect(measured.texts.find((text) => text.label === i18n.t('calendar.dayDetail.viewAllEventsLabel'))!.lines).toBe(1)
}

describe('Android day card geometry', () => {
  it.each([412, 1352].flatMap((width) => [false, true].flatMap((loggable) => ['en', 'pt-BR'].map((locale) => ({ width, loggable, locale })))))('keeps every habit row at the drawn floor at $width with loggable=$loggable in $locale', async ({ width, loggable, locale }) => {
    await i18n.changeLanguage(locale)
    const entries = makeCalendarDayCardEntries()
    expect(entries.map((entry) => entry.habitId)).toEqual(['parent-0', 'parent-1', 'parent-2', 'child-0', 'child-1'])
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarDayDetail selectedDate={calendarDayCardDate} title="Hoje"
      filteredEntries={entries} completedCount={2} calendarEvents={[]} calendarEventsState="ready" loggable={loggable} pendingEntryStates={new Map()}
      onEntryChange={() => null} onRetryCalendarEvents={vi.fn()} onReconnectCalendarEvents={vi.fn()} onOpenCalendarImport={vi.fn()} onViewPro={vi.fn()} onGoToDay={vi.fn()}
      displayTime={(time) => time} t={i18n.t} tokens={createTokensV2('orange', 'dark')} />) })
    try {
      const heights: number[][] = []
      for (const scale of [1, 2]) {
        replayTextLayout(tree, Math.min(width, 740) - 32, scale)
        const hostRows = tree.toJSON().children[1].children
        const measured = measureProfileRow(tree.toJSON(), Math.min(width, 740) - 32, scale)
        heights.push(hostRows.map((host: Parameters<typeof measureProfileRow>[0]) => measureProfileRow(host, Math.min(width, 740) - 80, scale).height))
        hostRows.forEach((host: { props: { style: object | ((state: { pressed: boolean }) => object) } }, index: number) => {
          const style = typeof host.props.style === 'function' ? host.props.style({ pressed: false }) : host.props.style
          expect(StyleSheet.flatten(style).minHeight).toBe(68)
          expect(heights.at(-1)![index]).toBeGreaterThanOrEqual(68)
        })
        entries.forEach((entry) => {
          const row = measured.controls.find((control) => control.accessibilityLabel?.startsWith(entry.title))!
          expect(row.height, JSON.stringify(row)).toBeGreaterThanOrEqual(68)
          const metadata = measured.texts.find((text) => text.label === (entry.dueTime ?? i18n.t('calendar.timeGrid.noSetTime')) && text.top >= row.top - 1 && text.bottom <= row.bottom + 1)!
          expect(metadata, JSON.stringify({ entry, row, texts: measured.texts })).toBeDefined()
          expect(metadata.height).toBeCloseTo(16.8 * scale)
          expect(metadata.clipped).toBe(false)
          expect(metadata.left).toBeGreaterThanOrEqual(row.left)
          expect(metadata.right).toBeLessThanOrEqual(row.right)
        })
      }
      for (const index of [0, 1, 3, 4]) {
        expect(heights[0]![index]).toBeCloseTo(68)
        expect(heights[1]![index]).toBeGreaterThan(heights[0]![index]!)
      }
    } finally { TestRenderer.act(() => tree.unmount()) }
    let calendarTree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { calendarTree = TestRenderer.create(<CheckRow label="Family calendar" textMode="personal" onOpenLabel={vi.fn()} checked={false} onChange={vi.fn()} />) })
    try { expect(StyleSheet.flatten(calendarTree.toJSON().props.style).minHeight).toBe(52) }
    finally { TestRenderer.act(() => calendarTree.unmount()) }
  })
  it.each([320, 360].flatMap((width) => [false, true].flatMap((loggable) => ['en', 'pt-BR'].map((locale) => ({ width, loggable, locale })))))('fits titles at $width with loggable=$loggable in $locale using Android styles and fonts', async ({ width, loggable, locale }) => {
    await i18n.changeLanguage(locale)
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<CalendarDayDetail selectedDate="2026-09-12" title="Hoje, 12 de setembro"
      filteredEntries={[{ habitId: 'habit-1', title: 'Caminhar pelo bairro depois do trabalho', status: 'completed', isBadHabit: false, dueTime: '08:00', isOneTime: false }, { habitId: 'habit-2', title: 'Ler', status: 'upcoming', isBadHabit: false, dueTime: null, isOneTime: false }]}
      calendarEvents={events} showEventSource calendarEventsState="ready" loggable={loggable} pendingEntryStates={new Map()} completedCount={1}
      onEntryChange={() => null} onRetryCalendarEvents={vi.fn()} onReconnectCalendarEvents={vi.fn()} onOpenCalendarImport={vi.fn()} onViewPro={vi.fn()} onGoToDay={vi.fn()}
      displayTime={(time) => time} t={i18n.t} tokens={createTokensV2('purple', 'dark')} />) })
    try {
      const host = tree.toJSON()
      const cardStyle = StyleSheet.flatten(host.props.style)
      expect(cardStyle).toMatchObject({ paddingHorizontal: 24, paddingVertical: 24, gap: 16 })
      expect(cardStyle.borderWidth ?? 0).toBe(0)
      const copy = host.children[0]
      expect(StyleSheet.flatten(copy.props.style)).toMatchObject({ gap: 4 })
      expect(StyleSheet.flatten(copy.props.style).paddingHorizontal).toBeUndefined()
      expect(StyleSheet.flatten(copy.children[1].props.style)).toMatchObject({ fontFamily: 'GeistMono_400Regular', fontSize: 12, color: createTokensV2('purple', 'dark').fg3 })
      expect(StyleSheet.flatten(host.children[1].props.style).gap ?? 0).toBe(0)
      if (loggable) {
        const target = host.children[1].children[0]
        expect(StyleSheet.flatten(target.props.style)).toMatchObject({ minHeight: 68, paddingVertical: 12, paddingHorizontal: 16 })
      }
      for (const scale of [1, 2]) {
        replayTextLayout(tree, width - 32, scale)
        const measured = measureProfileRow(tree.toJSON(), width - 32, scale)
        if (loggable && scale === 1) {
          const label = measured.controls.find((control) => control.accessibilityLabel === 'Caminhar pelo bairro depois do trabalho')!
          expect(label.height + 24).toBeGreaterThanOrEqual(48)
        }
        const eventRow = measured.controls.find((control) => control.labels.includes(events[0]!.title))!
        const eventTexts = measured.texts.filter((text) => text.top >= eventRow.top && text.bottom <= eventRow.bottom && events[0]!.title.includes(text.label.trim()))
        const habitRow = measured.controls.find((control) => control.labels.includes('Caminhar pelo bairro depois do trabalho'))!
        const habitTexts = measured.texts.filter((text) => text.top >= habitRow.top && text.bottom <= habitRow.bottom && 'Caminhar pelo bairro depois do trabalho'.includes(text.label.trim()))
        expect(measured.texts.find((text) => text.label === 'Hoje, 12 de setembro')!.left).toBe(24)
        expect(measured.texts.find((text) => text.label === 'Hoje, 12 de setembro')!.top).toBe(24)
        expect(Math.abs(measured.height - measured.controls.at(-1)!.bottom - 24)).toBeLessThanOrEqual(1)
        const disclosure = measured.controls.find((control) => control.labels.includes(i18n.t('calendar.dayDetail.viewAllEventsLabel')))!
        expect(measured.texts.find((text) => text.label === '(21)')!.lines).toBe(1)
        expect(disclosure.inlineClearance).toBeGreaterThanOrEqual(8)
        expect(eventTexts.reduce((count, text) => count + text.lines, 0), JSON.stringify(eventTexts)).toBeLessThanOrEqual(2)
        if (scale === 1) {
          expectDefaultScaleGeometry(measured, width, loggable, eventTexts, habitTexts, habitRow)
        }
        for (const text of measured.texts) {
          expect(text.left, JSON.stringify(text)).toBeGreaterThanOrEqual(0)
          expect(text.right, JSON.stringify(text)).toBeLessThanOrEqual(width - 32)
        }
      }
      expect(cardStyle).toMatchObject({ outlineWidth: 1, outlineOffset: -1, outlineStyle: 'solid', outlineColor: createTokensV2('purple', 'dark').hairlineGhost })
      expect(cardStyle.boxShadow).toBeUndefined()
    } finally { TestRenderer.act(() => tree.unmount()) }
  })
})
