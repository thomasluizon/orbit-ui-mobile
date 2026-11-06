import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { View } from 'react-native'
import type { OnboardingSchedule } from '@orbit/shared/utils'
import { i18n } from '@/lib/i18n'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'
import { OnboardingCreateHabit } from '@/components/onboarding/onboarding-create-habit'
import { MoveParentDialog, type MoveParentOption } from '@/components/habit-list/move-parent-dialog'
import { measureInteractionFills } from '../support/interaction-fill-geometry'
import { withFocusProvenance } from '../support/focus-provenance'

const TestRenderer = require('react-test-renderer')
const context = vi.hoisted(() => ({ theme: 'dark' }))

vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => undefined }, useTranslation: () => ({ t: i18n.t.bind(i18n), i18n }) }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'orange', currentTheme: context.theme }) }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: ({ label }: { label: string }) => <View testID="time-field" accessibilityLabel={label} style={{ minHeight: 78 }} /> }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

type JsonHost = { type: string; props: Record<string, unknown>; children: (JsonHost | string)[] | null }
type Part = ReturnType<typeof measureInteractionFills>[number]

function findHost(node: JsonHost | JsonHost[] | string | null, testID: string): JsonHost | null {
  if (!node || typeof node === 'string') return null
  if (Array.isArray(node)) return node.map((child) => findHost(child, testID)).find(Boolean) ?? null
  if (node.props.testID === testID) return node
  return (node.children ?? []).map((child) => findHost(child, testID)).find(Boolean) ?? null
}

function children(parts: Part[], parent: Part) {
  return parts.filter((part) => part.ancestors.at(-1) === parent.slot && part.height > 0).sort((first, second) => first.top - second.top)
}

function gaps(parts: Part[]) {
  return parts.slice(1).map((part, index) => part.top - parts[index]!.bottom)
}

function labelText(part: Part) {
  return (part.host.children ?? []).filter((child): child is string => typeof child === 'string').join('')
}

const CASES = [320, 1280].flatMap((width) => [1, 2].flatMap((scale) => (['en', 'pt-BR'] as const).flatMap((locale) => (['dark', 'light'] as const).map((mode) => ({ width, scale, locale, mode })))))

const SCHEDULES: Record<'fixed' | 'flexible' | 'interval', OnboardingSchedule> = {
  fixed: { frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 2, days: ['Monday', 'Thursday'], isGeneral: false, isFlexible: false, dueTime: '' },
  flexible: { frequencyUnit: 'Week', frequencyQuantity: 3, intervalWeeks: 1, days: [], isGeneral: false, isFlexible: true, dueTime: '' },
  interval: { frequencyUnit: 'Week', frequencyQuantity: 2, intervalWeeks: 1, days: [], isGeneral: false, isFlexible: false, dueTime: '' },
}

const onboardingProps = { title: 'Walk', emoji: '', proposed: false, correcting: true, canSaveRepeatWeeks: true, atLimit: false, allowance: 5, onCorrect: vi.fn(), onToggleDay: vi.fn(), onTimeChange: vi.fn(), onModeChange: vi.fn(), onFrequencyUnitChange: vi.fn(), onQuantityChange: vi.fn(), onIntervalWeeksChange: vi.fn() }

function option(index: number): MoveParentOption {
  return { id: `habit-${index}`, label: `Habit ${index}`, emoji: null, depth: 0, childCount: 0, disabled: false, reason: null }
}

afterEach(async () => {
  __resetTestHostConfig()
  await i18n.changeLanguage('en')
})

it.each(CASES.flatMap((matrix) => (['fixed', 'flexible', 'interval'] as const).map((schedule) => ({ ...matrix, schedule }))))(
  'asks the $schedule onboarding schedule in levels at $width and $scale in $locale/$mode', async ({ width, scale, locale, mode, schedule }) => {
    await i18n.changeLanguage(locale)
    context.theme = mode
    const column = Math.min(width, 412) - 32
    __setWindowDimensions({ width: Math.min(width, 412), height: 915, scale: 1, fontScale: scale })
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<OnboardingCreateHabit {...onboardingProps} schedule={SCHEDULES[schedule]} />) })
    try {
      const parts = measureInteractionFills(findHost(tree.toJSON(), 'onboarding-questions')!, column, false, scale)
      const root = parts.find((part) => part.host.props.testID === 'onboarding-questions')!
      const levels = children(parts, root)
      expect(levels).toHaveLength(schedule === 'fixed' ? 4 : 3)
      expect(levels.at(-1)!.host.props.accessibilityLabel).toBe(i18n.t('onboarding.flow.when.timeLabel'))
      for (const gap of gaps(levels)) expect(gap).toBeCloseTo(24, 3)
      const followUp = children(parts, levels[1]!)
      expect(followUp).toHaveLength(schedule === 'fixed' ? 2 : 3)
      for (const gap of gaps(followUp)) expect(gap).toBeCloseTo(12, 3)
      const expected = [i18n.t('onboarding.flow.when.scheduleMode'), i18n.t(schedule === 'fixed' ? 'onboarding.flow.when.daysLabel' : 'onboarding.flow.when.frequencyUnitLabel')]
      const questions = levels.slice(0, 2).map((level) => children(parts, level))
      expect(questions.map(([label]) => labelText(label!))).toEqual(expected)
      for (const [label, control] of questions) expect(control!.top - label!.bottom).toBeCloseTo(12, 3)
    } finally { TestRenderer.act(() => tree.unmount()) }
  })

it.each(CASES)('asks the move destination one group below its search at $width and $scale in $locale/$mode', async ({ width, scale, locale, mode }) => {
  await i18n.changeLanguage(locale)
  context.theme = mode
  const column = Math.min(width, 412) - 32
  __setWindowDimensions({ width: Math.min(width, 412), height: 915, scale: 1, fontScale: scale })
  const t = i18n.t.bind(i18n) as unknown as (key: string, params?: Record<string, unknown>) => string
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(withFocusProvenance(<MoveParentDialog t={t} visible isPending={false} movingHabitTitle="Exercise" movingHabitParentId={null}
      options={[{ ...option(0), id: null, label: t('habits.moveParent.toRoot') }, ...Array.from({ length: 9 }, (_, index) => option(index + 1))]}
      selectedMoveParentId={null} canSubmit={false} onClose={vi.fn()} onConfirm={vi.fn()} onSelectOption={vi.fn()} />))
  })
  try {
    const question = t('habits.moveParent.destinations', { count: 1 })
    expect(tree.root.findAll((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === question).length).toBeGreaterThan(0)
    const parts = measureInteractionFills(findHost(tree.toJSON(), 'move-parent-questions')!, column, false, scale)
    const root = parts.find((part) => part.host.props.testID === 'move-parent-questions')!
    const groups = children(parts, root).filter((part) => (part.style as { position?: string }).position !== 'absolute')
    const destinations = groups.findIndex((part) => part.host.props.testID === 'move-parent-destinations')
    expect(destinations).toBeGreaterThanOrEqual(2)
    for (const gap of gaps(groups.slice(0, destinations + 1))) expect(gap).toBeCloseTo(16, 3)
    const [label, list] = children(parts, groups[destinations]!)
    expect(labelText(label!)).toBe(question)
    expect((label!.host.props as { importantForAccessibility?: string }).importantForAccessibility).toBe('no-hide-descendants')
    expect(list!.top - label!.bottom).toBeCloseTo(8, 3)
  } finally { TestRenderer.act(() => tree.unmount()) }
})
