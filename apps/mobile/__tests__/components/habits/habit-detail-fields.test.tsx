import { Pressable, StyleSheet, Text, TextInput, type StyleProp, type ViewStyle } from 'react-native'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeHabitDetailScopedChild } from '@orbit/shared/test-support/habit-detail-fixtures'
import { HabitDetailFields, HabitDetailSchedule } from '@/components/habits/habit-detail-fields'
import { createTokensV2 } from '@/lib/theme'

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (time: string | null) => time ?? '', uses24HourClock: true }),
}))

vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))

const preferences = vi.hoisted(() => ({ weekStartDay: 1, locale: 'keys' }))

vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: true, weekStartDay: preferences.weekStartDay } }) }))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: translate, i18n: { language: preferences.locale } }),
}))

function translate(key: string) {
  const messages = preferences.locale === 'pt-BR' ? ptBR : en
  if (preferences.locale === 'keys') return key
  const translated = key.split('.').reduce<unknown>((value, segment) => typeof value === 'object' && value !== null ? Reflect.get(value, segment) : undefined, messages)
  return typeof translated === 'string' ? translated : key
}

beforeEach(() => { preferences.weekStartDay = 1; preferences.locale = 'keys' })

vi.mock('@/components/habits/habit-checklist', () => ({ HabitChecklist: () => null }))

vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => null }))

vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => null }))

vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({ ReminderSection: () => null }))

vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: () => null }))

type PressableNode = Readonly<{
  props: {
    children?: unknown
    value?: string
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityState?: { checked?: boolean; selected?: boolean; expanded?: boolean }
    style: (state: { pressed: boolean }) => StyleProp<ViewStyle>
    onPress: () => void
  }
}>

type TestTree = Readonly<{
  root: {
    findAllByType(type: unknown): PressableNode[]
    findByProps(props: Record<string, unknown>): { props: { onClick: () => void } }
    findAll(predicate: (node: { props: { children?: unknown; onClick?: () => void } }) => boolean): { props: { onClick: () => void } }[]
  }
}>

const renderer = require('react-test-renderer') as {
  create(element: React.ReactElement): TestTree
  act(callback: () => Promise<void>): Promise<void>
  act(callback: () => void): void
}

const tokens = createTokensV2('purple', 'dark')

function renderScheduleEditor(onPatch: (patch: unknown) => Promise<boolean>, daily = false, open = !daily) {
  let tree: TestTree | undefined
  renderer.act(() => {
    tree = renderer.create(
      <HabitDetailSchedule
        habit={{ ...makeHabitDetailScopedChild('2026-09-29'), frequencyQuantity: daily ? 1 : 2 }}
        summary="Every day"
        open={open}
        tokens={tokens}
        onSave={(patch) => { void onPatch(patch) }}
        onToggle={() => {}}
        onCancel={() => {}}
      />,
    )
  })
  if (!tree) throw new Error('The renderer produced no tree')
  return tree
}

function control(tree: TestTree, label: string) {
  const found = tree.root.findAllByType(Pressable).find((node) => node.props.accessibilityLabel === label)
  if (!found) throw new Error(`Missing control: ${label}`)
  return found
}

function fill(tree: TestTree, label: string, pressed: boolean) {
  return StyleSheet.flatten(control(tree, label).props.style({ pressed }))
}

describe('HabitDetailSchedule schedule chips', () => {
  it.each([false, true])('announces the daily cadence editor expanded state %s', (open) => {
    const tree = renderScheduleEditor(vi.fn().mockResolvedValue(true), true, open)
    expect(tree.root.findAllByType(Pressable)[0]!.props.accessibilityState).toMatchObject({ expanded: open })
  })

  it('fills a pressed frequency unit inside its pill and keeps the chosen unit marked', () => {
    const tree = renderScheduleEditor(vi.fn().mockResolvedValue(true))

    expect(control(tree, 'habits.form.unitDay').props.accessibilityState).toMatchObject({ checked: true })
    expect(fill(tree, 'habits.form.unitDay', false)).toMatchObject({ borderRadius: 999, overflow: 'hidden', borderColor: tokens.primary, backgroundColor: tokens.primaryDim })
    expect(fill(tree, 'habits.form.unitWeek', false)).toMatchObject({ borderRadius: 999, overflow: 'hidden', borderColor: tokens.hairline, backgroundColor: tokens.bgWell })
    expect(fill(tree, 'habits.form.unitWeek', true).backgroundColor).toBe(tokens.bgHover)
    expect(fill(tree, 'habits.form.unitDay', true).backgroundColor).toBe(tokens.bgHover)
  })

  it('fills a pressed weekday inside its pill and saves the days left selected', async () => {
    const onPatch = vi.fn().mockResolvedValue(true)
    const tree = renderScheduleEditor(onPatch, true)

    renderer.act(() => control(tree, 'dates.daysLong.sunday').props.onPress())
    expect(fill(tree, 'dates.daysLong.sunday', false)).toMatchObject({ borderRadius: 999, overflow: 'hidden', borderColor: tokens.primary, backgroundColor: tokens.primaryDim })
    expect(fill(tree, 'dates.daysLong.monday', false)).toMatchObject({ borderRadius: 999, overflow: 'hidden', borderColor: tokens.primary, backgroundColor: tokens.primaryDim })
    expect(fill(tree, 'dates.daysLong.sunday', true).backgroundColor).toBe(tokens.bgHover)
    expect(fill(tree, 'dates.daysLong.monday', true).backgroundColor).toBe(tokens.bgHover)

    await renderer.act(async () => { await Promise.resolve() })
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({
      frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    }))
  })
})


describe('HabitDetailFields disclosure labels', () => {
  it.each(['field', 'picker'])('normalizes the stored exact time in the %s', async (surface) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 7, 28, 9, 15))
    try {
      let tree!: TestTree
      await renderer.act(async () => {
        tree = renderer.create(<HabitDetailFields habit={{ ...makeHabitDetailScopedChild('2026-08-28'), dueTime: '21:00:00' }} hasProAccess relationshipControlsAvailable={false} tokens={tokens} onItemsChange={vi.fn()} onPatch={vi.fn().mockResolvedValue(true)} onUpgrade={vi.fn()} />)
        await Promise.resolve()
      })
      if (surface === 'field') {
        const input = tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === 'habits.form.exactTime')
        expect(input?.props.value).toBe('21:00')
      } else {
        await renderer.act(async () => {
          control(tree, 'habits.form.exactTime: common.selectTime').props.onPress()
          await Promise.resolve()
        })
        expect(control(tree, '21').props.accessibilityState).toMatchObject({ checked: true })
        const selected = tree.root.findAllByType(Pressable).filter((node) => node.props.accessibilityRole === 'radio' && node.props.accessibilityState?.checked)
        expect(selected.map((node) => node.props.accessibilityLabel)).toEqual(['21', '00'])
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses the same secondary field label role as create and edit', () => {
    let tree!: TestTree
    renderer.act(() => {
      tree = renderer.create(<HabitDetailFields habit={makeHabitDetailScopedChild('2026-08-29')} hasProAccess relationshipControlsAvailable={false} tokens={tokens} onItemsChange={vi.fn()} onPatch={vi.fn().mockResolvedValue(true)} onUpgrade={vi.fn()} />)
    })
    const headings = tree.root.findAllByType(Text).filter((node) => node.props.accessibilityRole === 'header')
    expect(headings.map((node) => node.props.children)).toEqual(['habits.form.reminders', 'habits.form.checklist', 'habits.form.endDate'])
    for (const heading of headings) {
      expect(StyleSheet.flatten(heading.props.style)).toMatchObject({ fontSize: 14, fontFamily: 'Geist_500Medium', color: tokens.fg2 })
    }
  })
})


describe.each(['en', 'pt-BR'])('HabitDetailSchedule weekday preference in %s', (locale) => {
  it.each([0, 1].flatMap((weekStartDay) => [false, true].flatMap((open) => [[], ['Monday']].map((days) => ({ weekStartDay, open, days })))))('orders and saves weekdays with week start $weekStartDay, editor $open and selected $days', async ({ weekStartDay, open, days }) => {
    preferences.weekStartDay = weekStartDay
    preferences.locale = locale
    const onSave = vi.fn()
    let tree!: TestTree
    renderer.act(() => {
      tree = renderer.create(<HabitDetailSchedule habit={{ ...makeHabitDetailScopedChild('2026-09-29'), frequencyQuantity: 1, days }} summary="Every day" open={open} tokens={tokens} onSave={onSave} onToggle={vi.fn()} onCancel={vi.fn()} />)
    })
    const orderedDays = weekStartDay === 1
      ? ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      : ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const labels = orderedDays.map((day) => translate(`dates.daysLong.${day}`))
    const chips = tree.root.findAllByType(Pressable).filter((node) => labels.includes(node.props.accessibilityLabel ?? ''))
    expect(chips.map((node) => node.props.accessibilityLabel)).toEqual(labels)
    expect(chips.map((node) => node.props.accessibilityState?.selected)).toEqual(orderedDays.map((day) => days.length === 0 || day === 'monday'))
    renderer.act(() => control(tree, translate('dates.daysLong.monday')).props.onPress())
    if (open) renderer.act(() => tree.root.findByProps({ children: translate('common.save'), variant: 'secondary' }).props.onClick())
    await renderer.act(async () => { await Promise.resolve() })
    expect(onSave).toHaveBeenCalledWith({ frequencyUnit: 'Day', frequencyQuantity: 1, days: days.length === 0 ? ['Sunday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] : [] })
  })
})
