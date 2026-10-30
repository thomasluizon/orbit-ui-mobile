import { ActionRow } from '@/components/ui/action-row'
import React from 'react'
import type { ReactTestInstance } from 'react-test-renderer'
import { beforeEach, expect, it, vi } from 'vitest'
import { View } from 'react-native'
import { RepeatReminderDetail } from '@/components/habits/repeat-reminder-detail'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { createTimeDisplay } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import { renderedText } from '../../support/react-test-renderer'
const TestRenderer = require('react-test-renderer')
const mutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }))
vi.mock('@/hooks/use-correct-habit-dose', () => ({ useCorrectHabitDose: () => mutation }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'America/Sao_Paulo', uses24HourClock: true } }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayReminderClock: createTimeDisplay('en', true, 'America/Sao_Paulo').displayClock }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string, values?: { time: string }) => {
  const template = key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], en)
  return typeof template === 'string' ? template.replace('{time}', values?.time ?? '') : key
} }) }))
vi.mock('@/components/ui/sheet', () => ({ Sheet: ({ children, actions }: { children: React.ReactNode; actions: React.ReactNode }) => <View testID="dose-dialog">{children}{actions}</View>, useSheetHost: () => ({ sheetRef: { current: null }, closeSheet: (action?: () => void) => action?.() }) }))
const log = { id: 'log-1', date: '2026-10-28', value: 1, createdAtUtc: '2026-10-29T02:30:00Z', takenAtUtc: '2026-10-29T02:30:00Z', reminderAtUtc: '2026-10-29T02:00:30.125Z' }
const habit = createMockHabit({ repeatReminder: { intervalMinutes: 30 }, nextReminderAtUtc: '2026-10-29T03:00:00Z' })
function press(root: ReactTestInstance, label: string) {
  const button = root.findAll((node) => String(node.type) === 'Pressable').find((node) => (node.props.accessibilityLabel ?? renderedText(node)) === label)
  if (!button) throw new Error(`Missing action ${label}`)
  const onPress = button.props.onPress
  if (typeof onPress !== 'function') throw new Error(`Missing press ${label}`)
  onPress()
}
beforeEach(() => { mutation.mutateAsync.mockReset().mockResolvedValue(undefined) })
it('shows supplied next time and corrects a dose with the reminder instant across midnight', async () => {
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<RepeatReminderDetail habit={habit} logs={[log]} />) })
  expect(renderedText(tree!.root)).toContain('Next at 00:00')
  expect(renderedText(tree!.root)).toContain('Done at 23:30')
  TestRenderer.act(() => press(tree.root, 'Change time'))
  TestRenderer.act(() => press(tree.root, 'Use reminder time'))
  await TestRenderer.act(async () => { press(tree.root, 'Save'); await Promise.resolve() })
  expect(mutation.mutateAsync).toHaveBeenCalledExactlyOnceWith({ logId: log.id, takenAtUtc: '2026-10-29T02:00:30.125Z' })
  TestRenderer.act(() => tree.update(<RepeatReminderDetail habit={{ ...habit, nextReminderAtUtc: '2026-10-29T06:00:00Z' }} logs={[{ ...log, takenAtUtc: log.reminderAtUtc }]} />))
  expect(renderedText(tree!.root)).toContain('Next at 03:00')
  expect(renderedText(tree!.root)).toContain('Done at 23:00')
  TestRenderer.act(() => tree.update(<></>))
})
it('retains the editor and error after a refused correction', async () => {
  mutation.mutateAsync.mockRejectedValue(new Error('Offline'))
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<RepeatReminderDetail habit={habit} logs={[log]} />) })
  TestRenderer.act(() => press(tree.root, 'Change time'))
  await TestRenderer.act(async () => { press(tree.root, 'Save'); await Promise.resolve() })
  expect(renderedText(tree!.root)).toContain(en.habits.doseSaveError)
  expect(tree!.root.findAllByProps({ testID: 'dose-dialog' }).length).toBeGreaterThan(0)
  TestRenderer.act(() => tree.update(<></>))
})

it('uses a visible small ghost Cancel before Save', () => {
  let tree!: import('react-test-renderer').ReactTestRenderer
  TestRenderer.act(() => { tree = TestRenderer.create(<RepeatReminderDetail habit={habit} logs={[log]} />) })
  TestRenderer.act(() => press(tree.root, en.habits.changeTakenAt))
  const cancel = tree.root.findAll((node) => String(node.type) === 'Pressable').find((node) => (node.props.accessibilityLabel ?? renderedText(node)) === en.common.cancel)!
  expect(renderedText(cancel)).toBe(en.common.cancel)
  expect(cancel.props.testID).toBe('button-ghost-sm')
  const actions = tree.root.findAll((node) => node.type === ActionRow)[0]!
  expect(actions.findAll((node) => String(node.type) === 'Pressable').map(renderedText)).toEqual([en.common.cancel, en.common.save])
  TestRenderer.act(() => tree.update(<></>))
})

it('offers the reminder time as a named clock icon action', () => {
  let tree!: import('react-test-renderer').ReactTestRenderer
  TestRenderer.act(() => { tree = TestRenderer.create(<RepeatReminderDetail habit={habit} logs={[log]} />) })
  TestRenderer.act(() => press(tree.root, en.habits.changeTakenAt))
  const button = tree.root.findAll((node) => String(node.type) === 'Pressable').find((node) => node.props.accessibilityLabel === en.habits.useReminderTime)!
  expect(button).toBeDefined()
  expect(renderedText(button)).toBe('')
  TestRenderer.act(() => tree.update(<></>))
})
