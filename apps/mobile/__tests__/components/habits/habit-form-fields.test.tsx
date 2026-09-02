import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import type { HabitFormProposal } from '@orbit/shared/utils'

const TestRenderer = require('react-test-renderer')
const useWatchMock = vi.fn()
const mockProfileState = vi.hoisted(() => ({ aiMessagesUsed: 0, hasProAccess: false }))
const SETUP_PROPOSAL: HabitFormProposal = { setup: true, checklist: false, subHabits: false }
const CHECKLIST_PROPOSAL: HabitFormProposal = { setup: false, checklist: true, subHabits: false }
const SUB_HABIT_PROPOSAL: HabitFormProposal = { setup: false, checklist: false, subHabits: true }

const testTranslations: Record<string, string> = {
  'habits.form.understoodDaily': 'Every day',
  'habits.form.understoodDaysAt': 'On {days} at {time}',
  'habits.form.understoodCountAt': '{count} times a week, any day at {time}',
}

function translateTestValue(key: string, values?: Record<string, unknown>): string {
  const template = testTranslations[key]
  if (!template) return values ? `${key}:${JSON.stringify(values)}` : key
  return Object.entries(values ?? {}).reduce(
    (message, [name, value]) => message.replace(`{${name}}`, String(value)),
    template,
  )
}

vi.mock('react-hook-form', () => ({ useWatch: (args: { control: { values: Record<string, unknown> }; name: string }) => useWatchMock(args) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translateTestValue, i18n: { language: 'en' } }) }))
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
vi.mock('@/components/habits/habit-form-fields/habit-understanding', () => ({ HabitUnderstanding: (props: Record<string, unknown>) => React.createElement('HabitUnderstanding', props) }))
vi.mock('@/components/habits/habit-checklist', () => ({ HabitChecklist: (props: Record<string, unknown>) => React.createElement('View', { ...props, testID: 'checklist' }) }))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => React.createElement('View') }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => React.createElement('View') }))
vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({ ReminderSection: () => React.createElement('View', { testID: 'offset-reminders' }) }))
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: () => React.createElement('View', { testID: 'scheduled-reminders' }) }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: () => React.createElement('View') }))

function createFormHelpers(overrides: Record<string, unknown> = {}): HabitFormHelpers {
  const values: Record<string, unknown> = { title: 'Run', emoji: '', frequencyUnit: null, frequencyQuantity: 3, days: [], isFlexible: false, dueDate: '2026-09-02', dueTime: '', dueEndTime: '', endDate: '', description: '', reminderEnabled: false, scheduledReminders: [], checklistItems: [], isBadHabit: false, slipAlertEnabled: false, ...overrides }
  return {
    form: { control: { values }, getValues: vi.fn((field: string) => values[field]), setValue: vi.fn((field: string, value: unknown) => { values[field] = value }), formState: { errors: {} } } as unknown as HabitFormHelpers['form'],
    isOneTime: true, isGeneral: false, isFlexible: false, isRecurring: false, showDayPicker: false, showEndDate: true,
    daysList: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((value) => ({ value, label: value.slice(0, 3) })),
    frequencyUnits: [], setOneTime: vi.fn(), setRecurring: vi.fn(), setFlexible: vi.fn(), setGeneral: vi.fn(), toggleDay: vi.fn(), formatTimeInput: vi.fn(), formatEndTimeInput: vi.fn(), validateAll: vi.fn(() => null),
  }
}

function createTags(): TagSelectionState {
  return { selectedTagIds: [], atTagLimit: false, tagValidationErrorKey: null, toggleTag: vi.fn(), resetTags: vi.fn(), showNewTag: false, setShowNewTag: vi.fn(), newTagName: '', setNewTagName: vi.fn(), newTagColor: '#C4530F', setNewTagColor: vi.fn(), tagColors: [], createAndSelectTag: vi.fn(), acceptSuggestedTag: vi.fn(), editingTagId: null, editTagName: '', setEditTagName: vi.fn(), editTagColor: '#C4530F', setEditTagColor: vi.fn(), startEditTag: vi.fn(), saveEditTag: vi.fn(), cancelEditTag: vi.fn(), deleteTag: vi.fn() }
}

describe('HabitFormFields mobile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProfileState.aiMessagesUsed = 0
    mockProfileState.hasProAccess = false
    useWatchMock.mockImplementation(({ control, name }: { control: { values: Record<string, unknown> }; name: string }) => control.values[name])
  })

  it('uses the understanding-first composition and wires both correction modes', async () => {
    const formHelpers = createFormHelpers()
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />)
      await Promise.resolve()
    })
    const understanding = tree.root.findByType('HabitUnderstanding')
    expect(understanding.props.value).toBe('Run')
    expect(understanding.props.labels.field).toBe('habits.form.describe')
    understanding.props.onToggleDay('Monday')
    expect(formHelpers.setRecurring).toHaveBeenCalledOnce()
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday')
    understanding.props.onQuantityChange(4)
    expect(formHelpers.setFlexible).toHaveBeenCalledOnce()
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('frequencyQuantity', 4, { shouldDirty: true })
  })

  it('states daily, timed fixed-day, and timed flexible schedules exactly', async () => {
    const formHelpers = createFormHelpers({ frequencyUnit: 'Day', frequencyQuantity: 1 })
    const renderNode = () => <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(renderNode())
      await Promise.resolve()
    })

    expect(tree.root.findByType('HabitUnderstanding').props.sentence).toBe('Every day')

    const controlValues = (formHelpers.form.control as unknown as { values: Record<string, unknown> }).values
    controlValues.days = ['Monday']
    controlValues.dueTime = '08:00'
    await TestRenderer.act(async () => {
      tree.update(renderNode())
      await Promise.resolve()
    })

    expect(tree.root.findByType('HabitUnderstanding').props.sentence).toBe('On Mon at 08:00')

    controlValues.days = []
    controlValues.isFlexible = true
    controlValues.frequencyUnit = 'Week'
    controlValues.frequencyQuantity = 3
    controlValues.dueTime = '09:00'
    await TestRenderer.act(async () => {
      tree.update(renderNode())
      await Promise.resolve()
    })

    expect(tree.root.findByType('HabitUnderstanding').props.sentence).toBe('3 times a week, any day at 09:00')
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

    const understanding = tree.root.findByType('HabitUnderstanding')
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
    const understanding = tree.root.findByType('HabitUnderstanding')
    TestRenderer.act(() => {
      understanding.props.onToggleDay('Monday')
      understanding.props.onQuantityChange(4)
    })

    expect(formHelpers.setGeneral).toHaveBeenCalledTimes(3)
    expect(formHelpers.setRecurring).not.toHaveBeenCalled()
    expect(formHelpers.setFlexible).not.toHaveBeenCalled()
    expect(formHelpers.toggleDay).not.toHaveBeenCalled()
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
  })

  it('routes the free sub-habit row to upgrade', async () => {
    const onUpgrade = vi.fn()
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers()} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={onUpgrade} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />)
      await Promise.resolve()
    })

    const subHabitRow = tree.root.findAll((node: any) => node.type === 'Pressable' && node.findAll((child: any) => child.type === 'Text' && child.props.children === 'habits.form.subHabits').length > 0)[0]
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

    const ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-md')[0]
    expect(ask.props.disabled).toBe(true)
    expect(ask.props.accessibilityState.disabled).toBe(true)

    const understanding = tree.root.findByType('HabitUnderstanding')
    understanding.props.onToggleDay('Monday')
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday')

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

    const ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-md')[0]
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

    const ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-md')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })
    expect(tree.root.findByProps({ testID: 'checklist' }).parent?.props.testID).not.toBe('proposed-field')
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

    const ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-md')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })
    expect(tree.root.findAll((node: any) => node.props?.testID === 'proposed-field').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-md')).toHaveLength(0)

    TestRenderer.act(() => tree.root.findByProps({ testID: 'checklist' }).props.onItemsChange([{ text: 'Edited', isChecked: false }]))
    expect(tree.root.findAll((node: any) => node.props?.testID === 'proposed-field')).toHaveLength(0)
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

    const ask = tree.root.findAll((node: any) => node.props?.testID === 'button-secondary-md')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })
    expect(tree.root.findAll((node: any) => node.props?.testID === 'proposed-field').length).toBeGreaterThan(0)

    TestRenderer.act(() => resolveProposal())
    expect(tree.root.findAll((node: any) => node.props?.testID === 'proposed-field')).toHaveLength(0)
  })
})
