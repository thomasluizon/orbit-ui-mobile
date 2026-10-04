import React from 'react'
import { StyleSheet } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useHabitForm, type HabitFormHelpers } from '@/hooks/use-habit-form'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import type { HabitFormProposal } from '@orbit/shared/utils'

const TestRenderer = require('react-test-renderer')
const useWatchMock = vi.fn()
const formLocale = vi.hoisted(() => ({ language: 'en' }))
const mockProfileState = vi.hoisted(() => ({ aiMessagesUsed: 0, hasProAccess: false }))
const SETUP_PROPOSAL: HabitFormProposal = { setup: true, checklist: false, subHabits: false, checklistItems: 0, subHabitItems: 0 }
const CHECKLIST_PROPOSAL: HabitFormProposal = { setup: false, checklist: true, subHabits: false, checklistItems: 1, subHabitItems: 0 }
const SUB_HABIT_PROPOSAL: HabitFormProposal = { setup: false, checklist: false, subHabits: true, checklistItems: 0, subHabitItems: 1 }
const COMBINED_PROPOSAL: HabitFormProposal = { setup: true, checklist: true, subHabits: true, checklistItems: 1, subHabitItems: 1 }

const testTranslations: Record<string, string> = {
  'dates.daysValue.monday': 'Monday',
  'habits.form.understoodDaily': 'every day',
  'habits.form.understoodDailyAt': 'every day at {time}',
  'habits.form.understoodDayAt': 'every {days} at {time}',
  'habits.form.understoodCountAt': '{count} times a week, any day, at {time}',
  'habits.form.understoodTime': 'At {time}',
}

function translateTestValue(key: string, values?: Record<string, unknown>): string {
  const messages = formLocale.language === 'en' ? en : ptBR
  const template = key === 'habits.form.startDateValue' ? messages.habits.form.startDateValue : testTranslations[key]
  if (!template) return values ? `${key}:${JSON.stringify(values)}` : key
  return Object.entries(values ?? {}).reduce(
    (message, [name, value]) => message.replace(`{${name}}`, String(value)),
    template,
  )
}

vi.mock('react-hook-form', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-hook-form')>(),
  useController: () => ({ field: { ref: vi.fn() } }),
  useWatch: (args: { control: { values: Record<string, unknown> }; name: string }) => useWatchMock(args),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translateTestValue, i18n: { language: formLocale.language } }) }))
vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({ config: { features: { 'habits.subHabits': { enabled: true, planRequirement: 'Pro' } } } }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => mockProfileState.hasProAccess,
  useProfile: () => ({ profile: { hasProAccess: mockProfileState.hasProAccess, aiMessagesUsed: mockProfileState.aiMessagesUsed, aiMessagesLimit: 5 } }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }), useCreateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: vi.fn() }), useDeleteTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))
vi.mock('@/components/ui/sheet', async () => {
  const sheetDouble = await import('@/__tests__/support/sheet-double')
  return {
    ...sheetDouble,
    Sheet: (props: React.ComponentProps<typeof sheetDouble.Sheet>) => React.createElement(sheetDouble.Sheet, props, props.headerAccessory, props.children),
  }
})
vi.mock('@/components/habits/habit-checklist', () => ({ HabitChecklist: (props: Record<string, unknown>) => React.createElement('View', { ...props, testID: 'checklist' }) }))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => React.createElement('View') }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => React.createElement('View') }))
vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({ ReminderSection: ({ children }: { children?: React.ReactNode }) => React.createElement('View', { testID: 'offset-reminders' }, children) }))
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: (props: Record<string, unknown>) => React.createElement('View', { ...props, testID: 'scheduled-reminders' }) }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: (props: Record<string, unknown>) => React.createElement('TimeField', props) }))
vi.mock('@/components/ui/date-field', () => ({ DateField: (props: Record<string, unknown>) => React.createElement('DateField', { ...props, testID: 'date-field' }) }))

function createFormHelpers(overrides: Record<string, unknown> = {}): HabitFormHelpers {
  const values: Record<string, unknown> = { title: 'Run', emoji: '', frequencyUnit: null, frequencyQuantity: 3, days: [], isFlexible: false, dueDate: '2026-09-02', dueTime: '', dueEndTime: '', endDate: '', description: '', reminderEnabled: false, scheduledReminders: [], checklistItems: [], isBadHabit: false, slipAlertEnabled: false, ...overrides }
  return {
    form: { control: { values }, getValues: vi.fn((field: string) => values[field]), setValue: vi.fn((field: string, value: unknown) => { values[field] = value }), formState: { errors: {} } } as unknown as HabitFormHelpers['form'],
    isOneTime: true, isGeneral: false, isFlexible: false, isRecurring: false, showDayPicker: false, showEndDate: true,
    daysList: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((value) => ({ value, label: value.slice(0, 3), accessibleLabel: value })),
    backendFieldErrors: {}, backendFocusRequest: 0, backendFocusField: undefined, reportBackendErrors: vi.fn(() => false), clearBackendErrors: vi.fn(),
    frequencyUnits: [], setOneTime: vi.fn(), setRecurring: vi.fn(), setFlexible: vi.fn(), setGeneral: vi.fn(), toggleDay: vi.fn(), formatTimeInput: vi.fn(), formatEndTimeInput: vi.fn(), validateAll: vi.fn(() => null),
  }
}

function createTags(): TagSelectionState {
  return { selectedTagIds: [], atTagLimit: false, tagValidationErrorKey: null, toggleTag: vi.fn(), resetTags: vi.fn(), showNewTag: false, setShowNewTag: vi.fn(), newTagName: '', setNewTagName: vi.fn(), newTagColor: '#C4530F', setNewTagColor: vi.fn(), tagColors: [], createAndSelectTag: vi.fn(), acceptSuggestedTag: vi.fn(), editingTagId: null, editTagName: '', setEditTagName: vi.fn(), editTagColor: '#C4530F', setEditTagColor: vi.fn(), startEditTag: vi.fn(), saveEditTag: vi.fn(), cancelEditTag: vi.fn(), deleteTag: vi.fn() }
}

describe('HabitFormFields mobile', () => {
  it('renders disclosure headings with the field label role and no additional start inset', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ isBadHabit: true })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />)
    })
    const { currentScheme, currentTheme } = useAppTheme()
    const tokens = createTokensV2(currentScheme, currentTheme)
    const keys = ['endDate', 'slipAlert', 'subHabits', 'reminders', 'checklist']
    for (const key of keys) {
      const heading = tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Text' && node.props.accessibilityRole === 'header' && node.props.children === `habits.form.${key}`)
      expect(heading).toHaveLength(1)
      expect(StyleSheet.flatten(heading[0].props.style)).toMatchObject({ fontSize: 14, fontFamily: 'Geist_500Medium', color: tokens.fg2 })
      let ancestor = heading[0].parent
      let startInset = 0
      while (ancestor && ancestor.type !== HabitFormFields) {
        if (typeof ancestor.type === 'string') {
          const style = StyleSheet.flatten(ancestor.props.style) ?? {}
          startInset += style.paddingStart ?? style.paddingLeft ?? style.paddingHorizontal ?? style.padding ?? 0
          startInset += style.marginStart ?? style.marginLeft ?? style.marginHorizontal ?? style.margin ?? 0
        }
        ancestor = ancestor.parent
      }
      expect(startInset).toBe(16)
    }
    await TestRenderer.act(() => tree!.unmount())
  })

  it('shows one unresolved reading and corrections before the ask without an understood card', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ title: 'Beber mais água quando der' })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={vi.fn()} readPhraseLocally />)
      await Promise.resolve()
    })
    const nodes = tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string')
    expect(nodes.filter((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Text' && node.props.children === 'habits.form.unresolved')).toHaveLength(1)
    expect(nodes.filter((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'habits.form.understood')).toHaveLength(0)
    const readingIndex = nodes.findIndex((node: { props: Record<string, unknown> }) => node.props.children === 'habits.form.unresolved')
    const correctionIndex = nodes.findIndex((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'Monday')
    const askIndex = nodes.findIndex((node: { props: Record<string, unknown> }) => node.props.children === 'habits.form.askAstra')
    expect(correctionIndex).toBeGreaterThan(readingIndex)
    expect(askIndex).toBeGreaterThan(correctionIndex)
  })

  it.each([
    ['en', 'Starts on September 2'],
    ['pt-BR', 'Começa em 2 de setembro'],
  ])('renders a word start date in %s', (locale, expected) => {
    formLocale.language = locale
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers()} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />)
    })
    expect(tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Text' && node.props.children === expected)).toHaveLength(1)
    TestRenderer.act(() => tree!.unmount())
  })

  beforeEach(() => {
    vi.clearAllMocks()
    formLocale.language = 'en'
    mockProfileState.aiMessagesUsed = 0
    mockProfileState.hasProAccess = false
    useWatchMock.mockImplementation(({ control, name }: { control: { values: Record<string, unknown> }; name: string }) => control.values[name])
  })

  it.each([false, true])('selects and clears an emoji inside the preview, schedule locked: %s', async (lockedGeneral) => {
    const formHelpers = createFormHelpers({ title: 'Run every day', frequencyUnit: 'Day', frequencyQuantity: 1 })
    const renderNode = () => <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} lockedGeneral={lockedGeneral} />
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(renderNode()) })
    const buttons = (label: string) => tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)
    expect(buttons('habits.form.emojiOpenPicker')).toHaveLength(1)
    await TestRenderer.act(() => buttons('habits.form.emojiOpenPicker')[0]!.props.onPress())
    await TestRenderer.act(() => buttons('habits.form.emoji: 🏃')[0]!.props.onPress())
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('emoji', '🏃', { shouldDirty: true })
    await TestRenderer.act(() => tree!.update(renderNode()))
    await TestRenderer.act(() => buttons('habits.form.emojiOpenPicker')[0]!.props.onPress())
    expect(buttons('habits.form.emojiRemove')).toHaveLength(1)
    await TestRenderer.act(() => buttons('habits.form.emojiRemove')[0]!.props.onPress())
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('emoji', '', { shouldDirty: true })
  })

  it.each(['', '   '])('hides the preview and emoji well for an empty phrase %j even with a saved schedule', async (title) => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ title, emoji: '🏃', frequencyUnit: 'Day', frequencyQuantity: 1 })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />)
    })
    expect(tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.understood')).toHaveLength(0)
    expect(tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.emojiOpenPicker')).toHaveLength(0)
  })

  it('hides the preview and emoji well while Astra reads a phrase with an existing schedule', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ title: 'Run every day', frequencyUnit: 'Day', frequencyQuantity: 1 })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} isSuggesting />)
    })
    expect(tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.emojiOpenPicker')).toHaveLength(0)
    expect(tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.understood')).toHaveLength(0)
  })

  it('shows no emoji well in a fresh empty form', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ title: '' })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />)
    })
    expect(tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.emojiOpenPicker')).toHaveLength(0)
  })

  it('keeps a chosen emoji through clearing, parsing and losing the understood schedule', async () => {
    const { useWatch } = await vi.importActual<typeof import('react-hook-form')>('react-hook-form')
    useWatchMock.mockImplementation(useWatch)
    let formHelpers!: HabitFormHelpers
    function CreateFormHarness({ isSuggesting = false }: { isSuggesting?: boolean }) {
      formHelpers = useHabitForm()
      return <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} isSuggesting={isSuggesting} readPhraseLocally />
    }
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<CreateFormHarness />) })
    const buttons = (label: string) => tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)
    expect(buttons('habits.form.emojiOpenPicker')).toHaveLength(0)
    await TestRenderer.act(() => tree!.root.findByType('TextInput').props.onChangeText('Run every day'))
    expect(buttons('habits.form.emojiOpenPicker')).toHaveLength(1)
    await TestRenderer.act(() => buttons('habits.form.emojiOpenPicker')[0]!.props.onPress())
    await TestRenderer.act(() => buttons('habits.form.emoji: 🌱')[0]!.props.onPress())
    expect(formHelpers.form.getValues('emoji')).toBe('🌱')

    const expectHidden = () => {
      expect(buttons('habits.form.emojiOpenPicker')).toHaveLength(0)
      expect(tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.understood')).toHaveLength(0)
      expect(formHelpers.form.getValues('emoji')).toBe('🌱')
    }
    await TestRenderer.act(() => tree!.root.findByType('TextInput').props.onChangeText(''))
    expectHidden()
    await TestRenderer.act(() => tree!.root.findByType('TextInput').props.onChangeText('Run every day'))
    await TestRenderer.act(() => tree!.update(<CreateFormHarness isSuggesting />))
    expectHidden()
    await TestRenderer.act(() => tree!.update(<CreateFormHarness />))
    expect(buttons('habits.form.emojiOpenPicker')).toHaveLength(1)
    expect(tree!.root.findByType(HabitUnderstanding).props.emoji).toBe('🌱')

    await TestRenderer.act(() => formHelpers.form.setValue('frequencyUnit', null))
    expectHidden()
    await TestRenderer.act(() => formHelpers.form.setValue('frequencyUnit', 'Day'))
    expect(buttons('habits.form.emojiOpenPicker')).toHaveLength(1)
    expect(tree!.root.findByType(HabitUnderstanding).props.emoji).toBe('🌱')
    await TestRenderer.act(() => tree!.unmount())
  })

  it('uses the understanding-first composition and wires both correction modes', async () => {
    const formHelpers = createFormHelpers()
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />)
      await Promise.resolve()
    })
    const understanding = tree.root.findByType(HabitUnderstanding)
    expect(understanding.props.scheduleLocked).toBe(false)
    expect(understanding.props.value).toBe('Run')
    expect(understanding.props.labels.field).toBe('habits.form.describe')
    understanding.props.onToggleDay('Monday')
    expect(formHelpers.setRecurring).toHaveBeenCalledOnce()
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', false)
    understanding.props.onQuantityChange(4)
    expect(formHelpers.setFlexible).toHaveBeenCalledOnce()
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('frequencyQuantity', 4, { shouldDirty: true })
  })

  it('states daily, timed daily, timed fixed-day, and timed flexible schedules exactly', async () => {
    const formHelpers = createFormHelpers({ frequencyUnit: 'Day', frequencyQuantity: 1 })
    const renderNode = () => <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(renderNode())
      await Promise.resolve()
    })

    expect(tree.root.findByType(HabitUnderstanding).props.sentence).toBe('every day')
    expect(tree.root.findByType(HabitUnderstanding).props.daily).toBe(true)
    tree.root.findByType(HabitUnderstanding).props.onToggleDay('Monday')
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', true)

    const controlValues = (formHelpers.form.control as unknown as { values: Record<string, unknown> }).values
    controlValues.dueTime = '07:00'
    await TestRenderer.act(async () => {
      tree.update(renderNode())
      await Promise.resolve()
    })

    expect(tree.root.findByType(HabitUnderstanding).props.sentence).toBe('every day at 07:00')

    controlValues.days = ['Monday']
    controlValues.dueTime = '08:00'
    await TestRenderer.act(async () => {
      tree.update(renderNode())
      await Promise.resolve()
    })

    expect(tree.root.findByType(HabitUnderstanding).props.sentence).toBe('every Monday at 08:00')
    expect(tree.root.findByType(HabitUnderstanding).props.daily).toBe(false)

    controlValues.days = []
    controlValues.isFlexible = true
    controlValues.frequencyUnit = 'Week'
    controlValues.frequencyQuantity = 3
    controlValues.dueTime = '09:00'
    await TestRenderer.act(async () => {
      tree.update(renderNode())
      await Promise.resolve()
    })

    expect(tree.root.findByType(HabitUnderstanding).props.sentence).toBe('3 times a week, any day, at 09:00')

    controlValues.isFlexible = false
    controlValues.frequencyUnit = null
    controlValues.dueTime = '15:00'
    await TestRenderer.act(async () => {
      tree.update(renderNode())
      await Promise.resolve()
    })

    expect(tree.root.findByType(HabitUnderstanding).props.sentence).toBe('At 15:00')
  })

  it('applies a time-only local phrase without inventing a cadence', async () => {
    const formHelpers = createFormHelpers({ title: 'Dentist at 15:00' })
    await TestRenderer.act(async () => {
      TestRenderer.create(<HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} readPhraseLocally />)
      await Promise.resolve()
    })

    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '15:00', { shouldDirty: true })
    expect(formHelpers.setOneTime).not.toHaveBeenCalled()
  })

  it('reconciles parser-owned fields across phrase changes without clearing a manual cadence', async () => {
    const formHelpers = createFormHelpers({ title: 'Run Monday at 08:00' })
    const renderNode = () => <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} readPhraseLocally />
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(renderNode())
      await Promise.resolve()
    })

    expect(formHelpers.setRecurring).toHaveBeenCalledOnce()
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '08:00', { shouldDirty: true })

    const understanding = tree.root.findByType(HabitUnderstanding)
    TestRenderer.act(() => understanding.props.onQuantityChange(4))
    const controlValues = (formHelpers.form.control as unknown as { values: Record<string, unknown> }).values
    controlValues.title = 'Run'
    await TestRenderer.act(async () => {
      tree.update(renderNode())
      await Promise.resolve()
    })

    expect(formHelpers.setOneTime).not.toHaveBeenCalled()
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '', { shouldDirty: true })

    controlValues.title = 'Dentist at 15:00'
    await TestRenderer.act(async () => {
      tree.update(renderNode())
      await Promise.resolve()
    })
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '15:00', { shouldDirty: true })
  })

  it('preserves a locked General schedule through local reads and both corrections', async () => {
    const formHelpers = createFormHelpers({ title: 'Run Monday', isGeneral: true })
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} readPhraseLocally lockedGeneral />)
      await Promise.resolve()
    })

    expect(formHelpers.setGeneral).toHaveBeenCalledOnce()
    const understanding = tree.root.findByType(HabitUnderstanding)
    expect(understanding.props.scheduleLocked).toBe(true)
    TestRenderer.act(() => {
      understanding.props.onToggleDay('Monday')
      understanding.props.onQuantityChange(4)
    })

    expect(formHelpers.setGeneral).toHaveBeenCalledTimes(3)
    expect(formHelpers.setRecurring).not.toHaveBeenCalled()
    expect(formHelpers.setFlexible).not.toHaveBeenCalled()
    expect(formHelpers.toggleDay).not.toHaveBeenCalled()
  })

  it('preserves an Astra schedule across the next title edit', async () => {
    const formHelpers = createFormHelpers({ title: 'Run Monday at 08:00' })
    const controlValues = (formHelpers.form.control as unknown as { values: Record<string, unknown> }).values
    const onSuggestSetup = vi.fn(() => {
      controlValues.frequencyUnit = 'Week'
      controlValues.frequencyQuantity = 3
      controlValues.dueTime = '07:00'
      return SETUP_PROPOSAL
    })
    const renderNode = () => <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={onSuggestSetup} readPhraseLocally />
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(renderNode())
      await Promise.resolve()
    })

    controlValues.title = 'Build a stronger routine'
    await TestRenderer.act(async () => {
      tree.update(renderNode())
      await Promise.resolve()
    })
    controlValues.days = []
    controlValues.frequencyUnit = null
    await TestRenderer.act(async () => {
      tree.update(renderNode())
      await Promise.resolve()
    })
    const ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-sm')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })

    vi.mocked(formHelpers.form.setValue).mockClear()
    vi.mocked(formHelpers.setOneTime).mockClear()
    controlValues.title = 'Build a calmer routine'
    await TestRenderer.act(async () => {
      tree.update(renderNode())
      await Promise.resolve()
    })
    expect(formHelpers.form.setValue).not.toHaveBeenCalledWith('dueTime', '', { shouldDirty: true })
    expect(formHelpers.setOneTime).not.toHaveBeenCalled()
  })

  it('nests fixed clock reminders under the offset reminder switch for a timed habit', async () => {
    const formHelpers = createFormHelpers({ dueTime: '08:00' })
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />)
      await Promise.resolve()
    })

    expect(tree.root.findAll((node: any) => node.props?.testID === 'offset-reminders')).toHaveLength(1)
    expect(tree.root.findAll((node: any) => node.props?.testID === 'scheduled-reminders')).toHaveLength(1)
    const scheduled = tree.root.findAll((node: any) => node.props?.testID === 'scheduled-reminders')[0]
    expect(scheduled.props.nested).toBe(true)
    expect(scheduled.props.offsetReminderCount).toBe(0)
    TestRenderer.act(() => scheduled.props.onSetScheduledReminders([{ when: 'day_before', time: '18:00' }]))
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('scheduledReminders', [{ when: 'day_before', time: '18:00' }], { shouldDirty: true })
  })

  it('hides slip alerts for a positive habit', async () => {
    mockProfileState.hasProAccess = true
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ isBadHabit: false })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />)
      await Promise.resolve()
    })

    expect(tree.root.findAll((node: any) => node.type === 'Pressable' && node.props?.accessibilityLabel === 'habits.form.slipAlert')).toHaveLength(0)
  })

  it('hides slip alerts after switching a bad habit back to positive', async () => {
    mockProfileState.hasProAccess = true
    const formHelpers = createFormHelpers({ isBadHabit: true })
    const renderNode = () => <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(renderNode())
      await Promise.resolve()
    })
    expect(tree.root.findAll((node: any) => node.type === 'Pressable' && node.props?.accessibilityLabel === 'habits.form.slipAlert')).toHaveLength(1)

    const habitTypeSwitch = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props?.accessibilityLabel === 'habits.form.habitTypeAvoid')[0]
    TestRenderer.act(() => habitTypeSwitch.props.onPress())
    await TestRenderer.act(async () => {
      tree.update(renderNode())
      await Promise.resolve()
    })

    expect(tree.root.findAll((node: any) => node.type === 'Pressable' && node.props?.accessibilityLabel === 'habits.form.slipAlert')).toHaveLength(0)
  })

  it.each([
    { mode: 'one-time', isOneTime: true, isGeneral: false },
    { mode: 'General', isOneTime: false, isGeneral: true },
  ])('hides the end date for $mode habits', async ({ isOneTime, isGeneral }) => {
    const formHelpers = createFormHelpers()
    Object.assign(formHelpers, { isOneTime, isGeneral, showEndDate: false })
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />)
      await Promise.resolve()
    })

    expect(tree.root.findAll((node: any) => node.props?.testID === 'date-field')).toHaveLength(0)
  })

  it('clears a prefilled end time when the exact time changes', async () => {
    const formHelpers = createFormHelpers({ dueTime: '08:00', dueEndTime: '09:00' })
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />)
      await Promise.resolve()
    })

    TestRenderer.act(() => tree.root.findByType('TimeField').props.onChange('10:00'))

    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '10:00', { shouldDirty: true })
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueEndTime', '', { shouldDirty: true })
  })

  it('routes the free sub-habit row to upgrade', async () => {
    const onUpgrade = vi.fn()
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers()} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={onUpgrade} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />)
      await Promise.resolve()
    })

    const subHabitRow = tree.root.findAll((node: any) => node.type === 'Pressable' && node.findAll((child: any) => child.type === 'Text' && child.props.children === 'common.upgrade').length > 0)[0]
    TestRenderer.act(() => subHabitRow.props.onPress())
    expect(onUpgrade).toHaveBeenCalledOnce()
  })

  it('keeps local corrections and details live at the Astra ceiling', async () => {
    mockProfileState.aiMessagesUsed = 5
    const onSuggestSetup = vi.fn(() => SETUP_PROPOSAL)
    const formHelpers = createFormHelpers()
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={onSuggestSetup} />)
      await Promise.resolve()
    })

    const ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-sm')[0]
    expect(ask.props.disabled).toBe(true)
    expect(ask.props.accessibilityState.disabled).toBe(true)

    const understanding = tree.root.findByType(HabitUnderstanding)
    understanding.props.onToggleDay('Monday')
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', false)

    const details = tree.root.findAll(
      (node: any) => node.type === 'Pressable' && node.findAll((child: any) => child.type === 'Text' && child.props.children === 'habits.form.moreDetails').length > 0,
    )[0]
    TestRenderer.act(() => details.props.onPress())
    expect(tree.root.findAll((node: any) => node.props?.testID === 'checklist')).toHaveLength(1)
    expect(onSuggestSetup).not.toHaveBeenCalled()
  })

  it('disables Astra at the Pro allowance too', async () => {
    mockProfileState.hasProAccess = true
    mockProfileState.aiMessagesUsed = 5
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers()} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={vi.fn(() => SETUP_PROPOSAL)} />)
      await Promise.resolve()
    })

    const ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-sm')[0]
    expect(ask.props.disabled).toBe(true)
  })

  it('keeps a pre-existing checklist normal when Astra proposes only setup', async () => {
    const formHelpers = createFormHelpers({
      checklistItems: [{ text: 'Shoes', isChecked: false }],
    })
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={() => SETUP_PROPOSAL} defaultExpanded />)
      await Promise.resolve()
    })

    const ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-sm')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })
    expect(tree.root.findByProps({ testID: 'checklist' }).parent?.props.testID).not.toBe('proposed-field')
  })

  it('allows Astra again after the proposed phrase changes', async () => {
    const onSuggestSetup = vi.fn(() => SETUP_PROPOSAL)
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ title: 'Build a stronger routine' })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={onSuggestSetup} />)
      await Promise.resolve()
    })

    let ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-sm')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })
    expect(onSuggestSetup).toHaveBeenCalledOnce()

    await TestRenderer.act(async () => {
      tree.root.findByType(HabitUnderstanding).props.onValueChange('Build a calmer routine')
      await Promise.resolve()
    })
    ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-sm')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })

    expect(onSuggestSetup).toHaveBeenCalledTimes(2)
  })

  it('preserves breakdown proposals when correcting proposed setup', async () => {
    mockProfileState.hasProAccess = true
    const formHelpers = createFormHelpers({ title: 'Build a stronger routine' })
    const controlValues = (formHelpers.form.control as unknown as { values: Record<string, unknown> }).values
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={() => {
          controlValues.checklistItems = [{ text: 'Prepare', isChecked: false }]
          return COMBINED_PROPOSAL
        }} defaultExpanded>
          {React.createElement('View', { testID: 'sub-habit-editor' })}
        </HabitFormFields>,
      )
      await Promise.resolve()
    })

    const ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-sm')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })
    expect(tree.root.findByType(HabitUnderstanding).props.proposed).toBe(true)
    expect(tree.root.findByProps({ testID: 'checklist' }).props.proposedItemCount).toBe(1)
    const proposedBreakdownCount = tree.root.findAll((node: any) => node.props?.testID === 'proposed-field').length
    expect(proposedBreakdownCount).toBeGreaterThan(0)

    TestRenderer.act(() => tree.root.findByType(HabitUnderstanding).props.onToggleDay('Monday'))

    expect(tree.root.findByType(HabitUnderstanding).props.proposed).toBe(false)
    expect(tree.root.findByProps({ testID: 'checklist' }).props.proposedItemCount).toBe(1)
    expect(tree.root.findAll((node: any) => node.props?.testID === 'proposed-field')).toHaveLength(proposedBreakdownCount)
  })

  it('marks only an Astra checklist proposal and resolves it when edited', async () => {
    const formHelpers = createFormHelpers({
      checklistItems: [{ text: 'Shoes', isChecked: false }],
    })
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={() => CHECKLIST_PROPOSAL} defaultExpanded />)
      await Promise.resolve()
    })

    const ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-sm')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })
    expect(tree.root.findByProps({ testID: 'checklist' }).props.proposedItemCount).toBe(1)
    expect(tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-sm')).toHaveLength(0)

    TestRenderer.act(() => tree.root.findByProps({ testID: 'checklist' }).props.onItemsChange([{ text: 'Edited', isChecked: false }]))
    expect(tree.root.findByProps({ testID: 'checklist' }).props.proposedItemCount).toBe(0)
  })

  it('resolves a proposed sub-habit section when its parent editor changes it', async () => {
    mockProfileState.hasProAccess = true
    let resolveProposal = () => {}
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <HabitFormFields
          formHelpers={createFormHelpers()}
          tags={createTags()}
          selectedGoalIds={[]}
          atGoalLimit={false}
          onToggleGoal={vi.fn()}
          onUpgrade={vi.fn()}
          reminderTimes={[]}
          onReminderTimesChange={vi.fn()}
          onSuggestSetup={() => SUB_HABIT_PROPOSAL}
          onResolveSubHabitProposalReady={(resolve) => { resolveProposal = resolve }}
          defaultExpanded
        >
          {React.createElement('View', { testID: 'sub-habit-editor' })}
        </HabitFormFields>,
      )
      await Promise.resolve()
    })

    const ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-sm')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })
    expect(tree.root.findAll((node: any) => node.props?.testID === 'proposed-field').length).toBeGreaterThan(0)

    TestRenderer.act(() => resolveProposal())
    expect(tree.root.findAll((node: any) => node.props?.testID === 'proposed-field')).toHaveLength(0)
  })
})

interface UnderstandingTestNode {
  type: unknown
  props: Readonly<Record<string, unknown>>
  findAll(predicate: (node: UnderstandingTestNode) => boolean): UnderstandingTestNode[]
}

describe('mobile understanding sentence', () => {
  it.each(['motion', 'emoji'])('replaces the sentence without leftover %s effects', async (effect) => {
    useWatchMock.mockImplementation(({ control, name }: { control: { values: Record<string, unknown> }; name: string }) => control.values[name])
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ frequencyUnit: 'Day', frequencyQuantity: 1 })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />)
      await Promise.resolve()
    })
    const props = { ...tree!.root.findByType(HabitUnderstanding).props, value: 'Run', sentence: 'A' }
    await TestRenderer.act(async () => { tree!.update(<HabitUnderstanding {...props} />); await Promise.resolve() })
    if (effect === 'emoji') {
      expect(tree!.root.findAllByType(AstraGlyph)).toHaveLength(0)
      expect(tree!.root.findAll((node: UnderstandingTestNode) => node.props.testID === 'habit-suggest-emoji')).toHaveLength(0)
    } else expect(tree!.root.findAll((node: UnderstandingTestNode) =>
      (node.props.entering !== undefined || node.props.exiting !== undefined) &&
      node.findAll((child) => child.type === 'Text' && child.props.children === 'A').length > 0,
    )).toHaveLength(0)
    await TestRenderer.act(async () => { tree!.update(<HabitUnderstanding {...props} sentence="B" />); await Promise.resolve() })
    expect(tree!.root.findAll((node: UnderstandingTestNode) => node.type === 'Text' && node.props.children === 'A')).toHaveLength(0)
    expect(tree!.root.findAll((node: UnderstandingTestNode) => node.type === 'Text' && node.props.children === 'B')).toHaveLength(1)
  })
})


it('returns to a weekly target when the last selected day is cleared', () => {
  const formHelpers = createFormHelpers({ title: 'Read every Monday', days: ['Monday'], frequencyUnit: 'Day', frequencyQuantity: 1 })
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => {
    tree = TestRenderer.create(<HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />)
  })
  TestRenderer.act(() => tree.root.findByType(HabitUnderstanding).props.onToggleDay('Monday'))
  expect(formHelpers.setFlexible).toHaveBeenCalledOnce()
  expect(formHelpers.form.setValue).toHaveBeenCalledWith('frequencyQuantity', 3, { shouldDirty: true })
})
