import { StyleSheet } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { ReminderSection } from '@/components/habits/habit-form-fields/reminder-section'
import { ScheduledReminderSection } from '@/components/habits/habit-form-fields/scheduled-reminder-section'
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { RepeatReminderSection } from '@/components/habits/habit-form-fields/repeat-reminder-section'
import { HabitRow } from '@/components/habits/habit-row'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { createTimeDisplay } from '@orbit/shared/utils'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'
import { measureInteractionFills } from '../../support/interaction-fill-geometry'
const TestRenderer = require('react-test-renderer')
const context = vi.hoisted(() => ({ locale: 'en', theme: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: context.theme }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: true, timeZone: 'UTC' } }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, toggleReminder: () => void) => ({ toggleReminder, showNotice: false, openSettings: vi.fn() }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ ...createTimeDisplay(context.locale, true), displayReminderClock: createTimeDisplay(context.locale, true, 'UTC').displayClock }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: context.locale }, t: (key: string, values?: Record<string, string | number>) => {
  const messages = context.locale === 'en' ? en : ptBR
  const template = key.split('.').reduce<unknown>((current, part) => (current as Record<string, unknown>)[part], messages)
  return typeof template === 'string' ? new IntlMessageFormat(template, context.locale).format(values) as string : key
} }) }))
afterEach(() => __resetTestHostConfig())
it.each([320, 360, 384, 412].flatMap(width => ['en', 'pt-BR'].flatMap(locale => ['dark', 'light'].map(theme => ({ width, locale, theme })))))('fits native repeat controls and whole next-time tokens at $width in $locale/$theme', ({ width, locale, theme }) => {
  context.locale = locale
  context.theme = theme
  __setWindowDimensions({ width, height: 2200, scale: 1, fontScale: 1 })
  const messages = locale === 'en' ? en : ptBR
  const repeat = { intervalMinutes: 480, activeStart: '20:00', activeEnd: '06:00', startAtUtc: '2026-10-29T00:00:00Z' }
  let form: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { form = TestRenderer.create(<RepeatReminderSection value={repeat} enabled general={false} timeZone="UTC" onChange={vi.fn()} onToggle={vi.fn()} />) })
  const fields = measureInteractionFills(form!.toJSON(), width - 32, false)
  const labels = new Set([messages.habits.form.repeatStart, messages.habits.form.repeatActiveStart, messages.habits.form.repeatActiveEnd])
  const measuredLabels = fields.filter(part => part.host.type === 'Text' && labels.has(part.host.children?.filter((child): child is string => typeof child === 'string').join('') ?? ''))
  expect(measuredLabels).toHaveLength(3)
  for (const label of measuredLabels) { expect(label.left).toBeGreaterThanOrEqual(0); expect(label.right).toBeLessThanOrEqual(width - 32); expect(label.height).toBeLessThanOrEqual(24) }
  TestRenderer.act(() => form.unmount())
  let row: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { row = TestRenderer.create(<HabitRow habit={createMockHabit({ repeatReminder: repeat, nextReminderAtUtc: '2026-10-29T04:00:00Z' })} depth={1} structuralColumn actions={{ onEdit: vi.fn() }} />) })
  const initial = measureInteractionFills(row!.toJSON(), width - 32, false)
  const content = initial.find(part => part.host.props.testID === 'habit-row-title-block')!
  const tokenBounds = initial.filter(part => part.host.props.testID === 'habit-row-meta-token')
  TestRenderer.act(() => {
    row.root.findByProps({ testID: 'habit-row-title-block' }).props.onLayout({ nativeEvent: { layout: { width: content.width } } })
    row.root.findAllByType('View').filter((node: { props: { testID?: string } }) => node.props.testID === 'habit-row-meta-token').forEach((node: { props: { onLayout: (event: { nativeEvent: { layout: { width: number } } }) => void } }, index: number) => node.props.onLayout({ nativeEvent: { layout: { width: tokenBounds[index]!.width } } }))
    const initialNext = initial.find(part => part.host.type === 'Text' && part.host.children?.includes(messages.habits.nextReminder.replace('{time}', '04:00')))!
    const text = row.root.findAllByType('Text').find((node: { props: { onTextLayout?: unknown } }) => typeof node.props.onTextLayout === 'function')
    text.props.onTextLayout({ nativeEvent: { lines: Array.from({ length: Math.round(initialNext.height / 16.8) }, (_, index) => ({ ascender: 12, capHeight: 12, descender: 4, height: 16.8, text: '', width: initialNext.width, x: 0, xHeight: 8, y: index * 16.8 })), target: 0 } })

  })
  const measured = measureInteractionFills(row!.toJSON(), width - 32, false)
  const next = measured.find(part => part.host.type === 'Text' && part.host.children?.includes(messages.habits.nextReminder.replace('{time}', '04:00')))!
  expect(next).toBeDefined()
  expect(next.height).toBeCloseTo(16.8, 1)
  expect(next.left).toBeGreaterThanOrEqual(0)
  expect(next.right).toBeLessThanOrEqual(width - 32)
  TestRenderer.act(() => row.unmount())
})

it.each([320, 1280].flatMap(width => [1, 2].flatMap(scale => (['dark', 'light'] as const).map(mode => ({ width, scale, mode })))) )('insets reminder remove paint and reserves the chip bottom at $width and $scale in $mode', ({ width, scale, mode }) => {
  context.locale = 'en'
  context.theme = mode
  const tokens = createTokensV2('orange', mode)
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<RepeatReminderSection value={null} enabled general={false} onToggle={vi.fn()} onChange={vi.fn()}><ReminderSection tokens={tokens} reminderEnabled reminderTimes={[15, 30]} reminderLabel={String} onReminderTimesChange={vi.fn()} /><ScheduledReminderSection tokens={tokens} reminderEnabled scheduledReminders={[{ when: 'day_before', time: '18:00' }]} onSetScheduledReminders={vi.fn()} onValidationError={vi.fn()} /></RepeatReminderSection>) })
  for (const label of [en.habits.form.removeReminder, en.habits.form.removeScheduledReminder]) {
    const remove = tree!.root.findAllByType('Pressable').find((node: { props: { accessibilityLabel: string } }) => node.props.accessibilityLabel === label)!
    let chipNode = remove.parent
    while (!StyleSheet.flatten(chipNode.props.style)?.paddingVertical) chipNode = chipNode.parent
    const chip = StyleSheet.flatten(chipNode.props.style)
    let rowNode = chipNode.parent
    while (StyleSheet.flatten(rowNode.props.style)?.flexWrap !== 'wrap') rowNode = rowNode.parent
    const row = StyleSheet.flatten(rowNode.props.style)
    expect(chip.paddingVertical).toBeGreaterThanOrEqual(8)
    expect(chip.paddingHorizontal).toBeGreaterThanOrEqual(8)
    expect(chip.maxWidth).toBe('100%')
    expect(row.paddingBottom).toBeGreaterThanOrEqual(8)
  }
  const bounds = measureInteractionFills(tree!.toJSON(), width - 32, true, scale)
  const control = bounds.find(part => 'accessibilityRole' in part.host.props && part.host.props.accessibilityRole === 'switch' && part.host.props.accessibilityLabel === en.habits.form.reminder)!
  expect(control.left).toBe(0)
  expect(control.right).toBe(width - 32)
  const fill = bounds.find(part => part.host.props['data-slot'] === 'list-row-body')!
  expect(fill.left).toBe(0)
  expect(fill.right).toBe(width - 32)
  TestRenderer.act(() => tree!.unmount())
})

it('starts the add-time row at the group edge when only clock reminders remain', () => {
  context.locale = 'en'
  context.theme = 'dark'
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ReminderSection tokens={createTokensV2()} reminderEnabled reminderTimes={[]} scheduledReminderCount={1} reminderLabel={String} onReminderTimesChange={vi.fn()} />) })
  const bounds = measureInteractionFills(tree!.toJSON(), 288, true)
  const fill = bounds.find(part => part.host.props['data-slot'] === 'list-row-body')!
  expect(fill.top).toBeLessThanOrEqual(4)
  TestRenderer.act(() => tree!.unmount())
})

it.each(['dark', 'light'] as const)('keeps the Portuguese add-time caption whole at 200% text in %s', (mode) => {
  context.locale = 'pt-BR'
  context.theme = mode
  __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: 2 })
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<ReminderSection tokens={createTokensV2('orange', mode)} reminderEnabled reminderTimes={[]} scheduledReminderCount={1} reminderLabel={String} onReminderTimesChange={vi.fn()} />) })
  const bounds = measureInteractionFills(tree!.toJSON(), 288, true, 2)
  const title = bounds.find(part => part.host.type === 'Text' && part.host.props['data-slot'] === 'list-row-title' && part.host.children?.includes(ptBR.habits.form.reminderAdd))!
  expect(title.host.props.numberOfLines).toBeUndefined()
  expect(title.height).toBeGreaterThan(48)
  expect(title.left).toBeGreaterThanOrEqual(0)
  expect(title.right).toBeLessThanOrEqual(288)
  TestRenderer.act(() => tree!.unmount())
})
