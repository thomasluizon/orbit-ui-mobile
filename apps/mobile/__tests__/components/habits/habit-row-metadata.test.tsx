import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatAPIDate, normalizeHabitQueryData } from '@orbit/shared/utils'
import { makeMonthlyChildDaySchedule } from '@orbit/shared/test-support/habit-detail-fixtures'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitRow } from '@/components/habits/habit-row'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'
import { measureInteractionFills } from '@/__tests__/support/interaction-fill-geometry'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { StyleSheet } from 'react-native'

vi.unmock('@/components/ui/icons')
const TestRenderer = require('react-test-renderer')
const locale = vi.hoisted(() => ({ value: 'en' }))
const theme = vi.hoisted(() => ({ value: 'dark' }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: theme.value }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, string | number>) => {
  const messages = locale.value === 'en' ? en : ptBR
  if (key === 'habits.nextReminder') return messages.habits.nextReminder.replace('{time}', String(values?.time))
  if (key === 'habits.statusDot.skip') return messages.habits.statusDot.skip
  if (key === 'calendar.dayCell.notScheduled') return messages.calendar.dayCell.notScheduled
  if (key === 'habits.form.typeHabit') return messages.habits.form.typeHabit
  if (key === 'habits.rowTypeTask') return messages.habits.rowTypeTask
  if (key === 'habits.form.checklist') return messages.habits.form.checklist
  if (key === 'habits.rowProgress' && values) return messages.habits.rowProgress.replace('{done}', String(values.done)).replace('{total}', String(values.total))
  return key
}, i18n: { language: locale.value } }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value, displayReminderClock: () => '04:00' }) }))
vi.mock('@/lib/motion', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/motion')>(),
  getPrefersReducedMotion: () => Promise.resolve(true),
  usePrefersReducedMotion: () => true,
}))
afterEach(() => { __resetTestHostConfig(); locale.value = 'en'; theme.value = 'dark' })

describe('integrated native row metadata', () => {
  it.each([true, false])('applies unavailable completion only inside a day scope, skipped=%s', (skipped) => {
    const schedule = makeMonthlyChildDaySchedule()
    schedule.children[0]!.isSkippedOnDate = skipped
    const habit = normalizeHabitQueryData([schedule]).habitsById.get('child-1')!
    const onLog = vi.fn()
    const date = new Date('2026-11-01T12:00:00')
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={habit} selectedDate={date} today="2026-11-01" actions={{ onLog }} />) })
    const status = skipped ? en.habits.statusDot.skip : en.calendar.dayCell.notScheduled
    expect(JSON.stringify(tree!.toJSON())).toContain(status)
    const check = () => tree!.root.findAllByType('Pressable').find((node: import('react-test-renderer').ReactTestInstance) => node.props.accessibilityRole === 'button' && String(node.props.accessibilityLabel).includes(`: ${habit.title}`))!
    expect(check().props.disabled).toBe(true)
    TestRenderer.act(() => check().props.onPress())
    expect(onLog).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.update(<HabitRow habit={habit} today="2026-11-01" actions={{ onLog }} />))
    expect(JSON.stringify(tree!.toJSON())).not.toContain(status)
    expect(tree!.root.findAllByProps({ testID: 'habit-check' }).length).toBeGreaterThan(0)
    expect(check().props.disabled).toBe(false)
    TestRenderer.act(() => check().props.onPress())
    expect(onLog).toHaveBeenCalledOnce()
    TestRenderer.act(() => tree.unmount())
  })

  it.each([2, 2.5])('keeps the Portuguese not-due token and its text inside a child card at %s text', (scale) => {
    locale.value = 'pt-BR'
    __setWindowDimensions({ width: 320, height: 915, scale: 1, fontScale: scale })
    const schedule = makeMonthlyChildDaySchedule()
    schedule.children[0]!.isSkippedOnDate = false
    const habit = normalizeHabitQueryData([schedule]).habitsById.get('child-1')!
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={habit} depth={1} selectedDate={new Date('2026-11-01T12:00:00')} today="2026-11-01" />) })
    const geometry = measureInteractionFills(tree!.toJSON(), 288, false, scale)
    const row = geometry.find((part) => part.host.props.testID === 'habit-row')!
    const status = geometry.find((part) => part.host.type === 'Text' && part.host.children?.includes(ptBR.calendar.dayCell.notScheduled))!
    const text = tree!.root.findAllByType('Text').find((node: import('react-test-renderer').ReactTestInstance) => node.props.children === ptBR.calendar.dayCell.notScheduled)!
    const tokenView = tree!.root.findAllByType('View').find((node: import('react-test-renderer').ReactTestInstance) => node.props.testID === 'habit-row-meta-token' && node.findAllByType('Text').some((part: import('react-test-renderer').ReactTestInstance) => part.props.children === ptBR.calendar.dayCell.notScheduled))!
    expect(StyleSheet.flatten(tokenView.props.style)).toMatchObject({ minWidth: 0, maxWidth: '100%', flexShrink: 1 })
    expect(StyleSheet.flatten(text.props.style)).toMatchObject({ minWidth: 0, flexShrink: 1 })
    expect(text.props.numberOfLines).toBeUndefined()
    expect(status.left).toBeGreaterThanOrEqual(row.left)
    expect(status.right).toBeLessThanOrEqual(row.right)
    expect(status.bottom).toBeLessThanOrEqual(row.bottom)
    for (const token of geometry.filter((part) => part.host.props.testID === 'habit-row-meta-token')) {
      expect(token.left).toBeGreaterThanOrEqual(row.left)
      expect(token.right).toBeLessThanOrEqual(row.right)
      expect(token.bottom).toBeLessThanOrEqual(row.bottom)
    }
    TestRenderer.act(() => tree.unmount())
  })

  it('preserves actual checklist values across schedules and completion states', () => {
    const schedules: Partial<NormalizedHabit>[] = [{ frequencyUnit: null }, { isGeneral: true }, { isFlexible: true, frequencyUnit: 'Week' }, { frequencyUnit: 'Day' }]
    for (const schedule of schedules) for (const flags of [{ isCompleted: true }, { isOverdue: true }, { isBadHabit: true }, {}]) {
      const onLog = vi.fn()
      let tree: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={createMockHabit({ ...schedule, ...flags, title: 'Read', checklistItems: [{ text: 'Page', isChecked: true }, { text: 'Page', isChecked: false }] })}
        completionReadOnly completionStatusUnavailable structuralColumn isSelectMode actions={{ onLog }} />) })
      const checklist = tree!.root.findAllByType('View').find((node: import('react-test-renderer').ReactTestInstance) => node.props.testID === 'habit-row-checklist')!
      expect(checklist.findByType('Text').props.children).toBe('1/2')
      expect(tree!.root.findAllByType('Text').filter((node: import('react-test-renderer').ReactTestInstance) => node.props.testID === 'habit-row-type')).toHaveLength(1)
      expect(onLog).not.toHaveBeenCalled()
      TestRenderer.act(() => tree.unmount())
    }
  })

  it.each(['en', 'pt-BR'].flatMap((language) => [1, 2, 2.5].map((scale) => ({ language, scale }))))(
    'leads with one type and retains actual checklist progress in $language at $scale text', ({ language, scale }) => {
      locale.value = language
      __setWindowDimensions({ width: 320, height: 892, scale: 1, fontScale: scale })
      const habit = createMockHabit({ title: 'Read pages', description: 'Read before breakfast.', checklistItems: Array.from({ length: 5 }, (_, index) => ({ text: 'Page', isChecked: index < 2 })) })
      let tree: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={habit} hasChildren childrenDone={1} childrenTotal={3} />) })
      const strips = tree!.root.findAllByType('View').filter((node: import('react-test-renderer').ReactTestInstance) => node.props.testID === 'habit-row-meta')
      expect(strips, 'single View metadata flow').toHaveLength(1)
      const strip = strips[0]!
      expect(strip.findAllByType('Text').filter((node: import('react-test-renderer').ReactTestInstance) => node.props.testID === 'habit-row-type')).toHaveLength(1)
      const checklist = strip.findByProps({ testID: 'habit-row-checklist' })
      expect(checklist.type).not.toBe('Text')
      expect(checklist.props.onPress).toBeUndefined()
      expect(checklist.findByType('Text').props.children).toBe('2/5')
      expect(checklist.findAllByType('Svg')).toHaveLength(1)
      const svg = checklist.findByType('Svg')
      expect(svg.props.width).toBe(scale > 1.3 ? 24 : 16)
      expect(svg.props.strokeWidth).toBe(1.5)
      expect(checklist.findAllByType('Path').map((node: import('react-test-renderer').ReactTestInstance) => node.props.d)).toContain('M3.5 5.5l1.5 1.5l2.5 -2.5')
      expect(strip.props.importantForAccessibility).toBe('no-hide-descendants')
      const body = tree!.root.findAllByType('Pressable').find((node: import('react-test-renderer').ReactTestInstance) => node.props.delayLongPress === 500)!
      const label = body.props.accessibilityLabel as string
      expect(label.split(language === 'en' ? 'Habit' : 'Hábito')).toHaveLength(2)
      expect(label.split(language === 'en' ? 'Checklist, 2 of 5' : 'Checklist, 2 de 5')).toHaveLength(2)
      expect(label).toContain(language === 'en' ? '1 of 3' : '1 de 3')
      expect(body.props.accessibilityHint).toContain(habit.description)
      TestRenderer.act(() => tree.unmount())
    },
  )

  it.each([[0, 0], [0, 1], [0, 5], [2, 5], [5, 5], [50, 50]])('renders honest %s/%s counts without changing actions or items', (done, total) => {
    const checklistItems = Array.from({ length: total }, (_, index) => ({ text: 'Same page', isChecked: index < done }))
    const original = structuredClone(checklistItems)
    const onLog = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={createMockHabit({ title: 'Read', checklistItems })} actions={{ onLog }} />) })
    const checklists = tree!.root.findAllByType('View').filter((node: import('react-test-renderer').ReactTestInstance) => node.props.testID === 'habit-row-checklist')
    if (total) expect(checklists[0]?.findByType('Text').props.children).toBe(`${done}/${total}`)
    else expect(checklists).toHaveLength(0)
    expect(checklistItems).toEqual(original)
    expect(onLog).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.unmount())
  })

  it.each([false, true])('updates received checked values and names selection once, unavailable=%s', (completionStatusUnavailable) => {
    const actions = { onLog: vi.fn(), onToggleSelection: vi.fn() }
    const habit = createMockHabit({ title: 'Read', frequencyUnit: null, checklistItems: [{ text: 'Page', isChecked: false }] })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={habit} structuralColumn isSelectMode completionStatusUnavailable={completionStatusUnavailable} actions={actions} />) })
    TestRenderer.act(() => tree.update(<HabitRow habit={{ ...habit, checklistItems: [{ text: 'Page', isChecked: true }] }} structuralColumn isSelectMode completionStatusUnavailable={completionStatusUnavailable} actions={actions} />))
    const checklist = tree!.root.findAllByType('View').find((node: import('react-test-renderer').ReactTestInstance) => node.props.testID === 'habit-row-checklist')!
    expect(checklist?.findByType('Text').props.children).toBe('1/1')
    const buttons = tree!.root.findAllByType('Pressable')
    const selection = buttons.find((node: import('react-test-renderer').ReactTestInstance) => node.props.accessibilityRole === 'checkbox')!
    expect(selection.props.accessibilityLabel).toBe('Read, Task, Checklist, 1 of 1')
    const body = buttons.find((node: import('react-test-renderer').ReactTestInstance) => node.props.delayLongPress === 500)!
    expect(body.props.accessibilityLabel).toContain('Checklist, 1 of 1')
    TestRenderer.act(() => body.props.onPress())
    expect(actions.onToggleSelection).toHaveBeenCalledOnce()
    expect(actions.onLog).not.toHaveBeenCalled()
    TestRenderer.act(() => tree.unmount())
  })

  it.each(['light', 'dark'].flatMap((mode) => ['en', 'pt-BR'].flatMap((language) => [320, 412, 1352].flatMap((width) => [1, 2, 2.5].flatMap((scale) => [0, 1].map((depth) => ({ mode, language, width, scale, depth: depth as 0 | 1 })))))))(
    'keeps whole maximum tokens inside $width/$scale depth=$depth in $mode/$language', ({ width, scale, depth, mode, language }) => {
      theme.value = mode
      locale.value = language
      __setWindowDimensions({ width, height: 892, scale: 1, fontScale: scale })
      const habit = createMockHabit({ scheduledDates: [formatAPIDate(new Date())], title: 'Read pages', description: 'Read before breakfast.', checklistItems: Array.from({ length: 50 }, () => ({ text: 'Page', isChecked: true })) })
      let tree: ReturnType<typeof TestRenderer.create>
      TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={habit} depth={depth} structuralColumn hasChildren childrenDone={1} childrenTotal={3} actions={{ onEdit: vi.fn(), onToggleExpand: vi.fn() }} />) })
      const initial = measureInteractionFills(tree!.toJSON(), width - 32, false, scale)
      const content = initial.find((part) => part.host.props.testID === 'habit-row-title-block')!
      const tokenBounds = initial.filter((part) => part.host.props.testID === 'habit-row-meta-token')
      TestRenderer.act(() => {
        tree!.root.findByProps({ testID: 'habit-row-title-block' }).props.onLayout({ nativeEvent: { layout: { width: content.width } } })
        tree!.root.findAllByType('View').filter((node: import('react-test-renderer').ReactTestInstance) => node.props.testID === 'habit-row-meta-token').forEach((node: import('react-test-renderer').ReactTestInstance, index: number) => (node.props.onLayout as (event: { nativeEvent: { layout: { width: number } } }) => void)({ nativeEvent: { layout: { width: tokenBounds[index]!.width } } }))
      })
      const geometry = measureInteractionFills(tree!.toJSON(), width - 32, false, scale)
      const strip = geometry.find((part) => part.host.props.testID === 'habit-row-meta')!
      const type = geometry.find((part) => part.host.props.testID === 'habit-row-type')!
      const checklist = geometry.find((part) => part.host.props.testID === 'habit-row-checklist')!
      expect(type, 'type measured').toBeDefined()
      expect(checklist, 'checklist measured').toBeDefined()
      const primary = geometry.find((part) => part.host.type === 'Pressable' && 'delayLongPress' in part.host.props)!
      const row = geometry.find((part) => part.host.props.testID === 'habit-row')!
      const supporting = scale > 1.3 || (width === 320 && depth === 1)
      expect(strip.ancestors.includes(primary.slot)).toBe(!supporting)
      if (supporting) expect(primary).toMatchObject({ left: row.left, right: row.right, top: row.top, bottom: row.bottom })
      const check = geometry.find((part) => part.host.props.testID === 'habit-check')!
      const target = geometry.find((part) => check.ancestors.includes(part.slot) && part.width === 48)!
      expect(check).toMatchObject({ width: 28, height: 28 })
      expect(target.height).toBeGreaterThanOrEqual(48)
      expect(Math.abs((check.left + check.right - target.left - target.right) / 2)).toBeLessThanOrEqual(1)
      expect(Math.abs((check.top + check.bottom - target.top - target.bottom) / 2)).toBeLessThanOrEqual(1)
      if (supporting) expect(target.top - row.top).toBe(depth ? 4 : 8)
      else expect(Math.abs((target.top + target.bottom - row.top - row.bottom) / 2)).toBeLessThanOrEqual(1)
      const count = geometry.find((part) => part.host.type === 'Text' && part.host.children?.includes('50/50'))!
      expect(count.height).toBeCloseTo(16.8 * scale, 1)
      for (const token of [type, checklist]) {
        expect(token.left).toBeGreaterThanOrEqual(strip.left)
        expect(token.right).toBeLessThanOrEqual(strip.right + 1)
      }
      TestRenderer.act(() => tree.unmount())
    },
  )
})

  it.each(['en', 'pt-BR'])('shows only the supplied next reminder instant in %s', (language) => {
    locale.value = language
    const habit = createMockHabit({ repeatReminder: { intervalMinutes: 30 }, nextReminderAtUtc: '2026-10-29T04:00:00Z' })
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitRow habit={habit} />) })
    expect(JSON.stringify(tree!.toJSON())).toContain(language === 'en' ? 'Next at 04:00' : 'Próximo às 04:00')
    TestRenderer.act(() => tree.update(<HabitRow habit={{ ...habit, nextReminderAtUtc: null }} />))
    expect(JSON.stringify(tree!.toJSON())).not.toContain('04:00')
    TestRenderer.act(() => tree.unmount())
  })
