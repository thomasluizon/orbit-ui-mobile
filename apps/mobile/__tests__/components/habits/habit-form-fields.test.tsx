import { dateInterpretationSchema } from '@orbit/shared/types/habit'
import { appConfigSchema } from '@orbit/shared/types/config'
import { createMockConfigResponse, createMockHabit } from '@orbit/shared/__tests__/factories'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import type { HabitTag } from '@orbit/shared/types/habit'
import { StyleSheet, Text } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { useHabitForm, type HabitFormHelpers } from '@/hooks/use-habit-form'
import { __focusHost, __getFocusedNativeTag, __setFocusImpl, __setTouchMode } from '@/test-mocks/react-native'
import { captureError } from '@/lib/sentry'
import { createApiClientError } from '@orbit/shared/utils'
import { useTagSelection, type TagSelectionState } from '@/hooks/use-tag-selection'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { RepeatReminderSection } from '@/components/habits/habit-form-fields/repeat-reminder-section'
import { HabitCreateFrame } from '@/components/habits/habit-create-frame'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { HabitScheduleFields } from '@/components/habits/habit-form-fields/habit-schedule-fields'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'
import { HabitFormInteractionProvider } from '@/components/habits/habit-form-fields/habit-form-interaction'
import { ListRow } from '@/components/ui/list-row'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { buildCreateHabitRequest, buildUpdateHabitRequest, buildHabitFormPatchFromSuggestion, formatLocaleDate, type HabitFormProposal } from '@orbit/shared/utils'
import { PillButton } from '@/components/ui/pill-button'
import { FocusProvenanceView } from '@/components/ui/focus-provenance-view'
import { applySuggestionSchedule } from '@/components/habits/create-habit-modal/apply-suggestion'
import { habitFormSchema } from '@orbit/shared/validation'

const renderer = require('react-test-renderer')
const mountedTrees = new Set<ReturnType<typeof renderer.create>>()
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, onToggle: () => void) => ({ toggleReminder: onToggle, showNotice: false, openSettings: vi.fn() }) }))

const TestRenderer = {
  ...renderer,
  create: (...args: Parameters<typeof renderer.create>) => {
    const tree = renderer.create(...args)
    mountedTrees.add(tree)
    return tree
  },
}
afterEach(async () => {
  await renderer.act(() => { for (const tree of mountedTrees) tree.unmount() })
  mountedTrees.clear()
})
function matchesFormLabel(actual: unknown, expected: string): boolean {
  if (expected === 'habits.form.describe') return actual === expected || actual === 'habits.form.taskDescribe'
  if (expected === 'habits.createHabit') return actual === expected || actual === 'habits.createTask'
  return String(actual).startsWith(expected)
}

function openTiming(tree: ReturnType<typeof TestRenderer.create>) {
  TestRenderer.act(() => tree.root.findAllByType(ListRow).find((node: { props: { title: string } }) => node.props.title === 'habits.form.timingAndReminder')!.props.onClick())
}

const useWatchMock = vi.fn()
const tagCollection = vi.hoisted(() => ({ tags: [] as HabitTag[] }))
const tagMutations = vi.hoisted(() => ({ create: vi.fn(), suggest: vi.fn(), delete: vi.fn() }))
const formLocale = vi.hoisted((): { language: string; realController: boolean; realDates: boolean; realDateCopy: boolean; theme: 'dark' | 'light' } => ({ language: 'en', realController: false, realDates: false, realDateCopy: false, theme: 'dark' }))
const dateRequests = vi.hoisted(() => ({ request: vi.fn() }))
const connection = vi.hoisted(() => ({ isOnline: true }))
const mockProfileState = vi.hoisted((): { aiMessagesUsed: number; hasProAccess: boolean; timeZone: string | null | undefined } => ({ aiMessagesUsed: 0, hasProAccess: false, timeZone: 'UTC' }))
const modalFeedback = vi.hoisted(() => ({ showError: vi.fn(), create: vi.fn(), update: vi.fn() }))
const SETUP_PROPOSAL: HabitFormProposal = { setup: true, checklist: false, subHabits: false, checklistItems: 0, subHabitItems: 0 }
const CHECKLIST_PROPOSAL: HabitFormProposal = { setup: false, checklist: true, subHabits: false, checklistItems: 1, subHabitItems: 0 }
const SUB_HABIT_PROPOSAL: HabitFormProposal = { setup: false, checklist: false, subHabits: true, checklistItems: 0, subHabitItems: 1 }
const COMBINED_PROPOSAL: HabitFormProposal = { setup: true, checklist: true, subHabits: true, checklistItems: 1, subHabitItems: 1 }

const testTranslations: Record<string, string> = {
  'dates.weekdaySchedule.single.monday': en.dates.weekdaySchedule.single.monday,
  'habits.form.understoodDaily': 'every day',
  'habits.form.understoodDailyAt': 'every day at {time}',
  'habits.form.understoodDayAt': 'every {days} at {time}',
  'habits.form.understoodCountAt': '{count} times a week, any day, at {time}',
  'habits.form.understoodTime': 'At {time}',
}

function translateTestValue(key: string, values?: Record<string, unknown>): string {
  const messages = formLocale.language === 'en' ? en : ptBR
  if (key === 'habits.form.datePhrasePlaceholder') return messages.habits.form.datePhrasePlaceholder
  const dateTemplate = formLocale.realDateCopy && ['habits.form.datePhraseUnresolved', 'habits.form.dateProposed', 'habits.form.dateConfirmationRequired'].includes(key)
    ? Object.entries(messages.habits.form).find(([name]) => key === `habits.form.${name}`)?.[1]
    : undefined
  const template = dateTemplate ?? (key === 'habits.form.habitTypeAvoidHint' ? messages.habits.form.habitTypeAvoidHint : testTranslations[key])
  if (!template) return values ? `${key}:${JSON.stringify(values)}` : key
  return Object.entries(values ?? {}).reduce(
    (message, [name, value]) => message.replace(`{${name}}`, String(value)),
    template,
  )
}

vi.mock('react-hook-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-hook-form')>()
  return {
  ...actual,
  useController: (props: Parameters<typeof actual.useController>[0]) => formLocale.realController ? actual.useController(props) : ({ field: { ref: vi.fn() } }),
  useWatch: (args: { control: { values: Record<string, unknown> }; name: string }) => useWatchMock(args),
}
})
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translateTestValue, i18n: { language: formLocale.language } }) }))
vi.mock('@/lib/use-app-theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/use-app-theme')>()
  return { useAppTheme: () => ({ ...actual.useAppTheme(), currentTheme: formLocale.theme }) }
})
vi.mock('@/hooks/use-date-interpretation', () => ({ useDateInterpretation: () => ({ mutateAsync: dateRequests.request }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => connection }))
vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({ config: appConfigSchema.parse(createMockConfigResponse({ sub_habits: { enabled: true, planRequirement: 'Pro' } })) }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => mockProfileState.hasProAccess,
  useProfile: () => ({ profile: { timeZone: mockProfileState.timeZone, hasProAccess: mockProfileState.hasProAccess, aiMessagesUsed: mockProfileState.aiMessagesUsed, aiMessagesLimit: 5 } }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: modalFeedback.showError }) }))
vi.mock('expo-router', () => ({ useIsFocused: () => true, useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habits', () => ({
  useCreateHabit: () => ({ mutateAsync: modalFeedback.create, isPending: false }),
  useCreateSubHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateHabit: () => ({ mutateAsync: modalFeedback.update, isPending: false }),
  useHabitDetail: () => ({ data: null, isPending: false, error: null, refetch: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-tags', () => ({
  useAssignTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSuggestTags: () => ({ isPending: false, mutateAsync: tagMutations.suggest }),
  useTags: () => ({ tags: tagCollection.tags }), useCreateTag: () => ({ isPending: false, mutateAsync: tagMutations.create }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: vi.fn() }), useDeleteTag: () => ({ isPending: false, mutateAsync: tagMutations.delete }),
}))
vi.mock('@/components/ui/keyboard-aware-scroll-view', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/keyboard-aware-scroll-view')>()
  return {
    ...actual,
    KeyboardAwareFlatList: (props: React.ComponentProps<typeof actual.KeyboardAwareFlatList>) => (
      <actual.KeyboardAwareFlatList {...props}>{React.isValidElement(props.ListFooterComponent) ? props.ListFooterComponent : null}</actual.KeyboardAwareFlatList>
    ),
  }
})
vi.mock('@/components/ui/sheet', async () => {
  const sheetDouble = await import('@/__tests__/support/sheet-double')
  return {
    ...sheetDouble,
    Sheet: (props: React.ComponentProps<typeof sheetDouble.Sheet>) => React.createElement(sheetDouble.Sheet, props, props.headerAccessory, props.children),
  }
})
vi.mock('@/components/habits/habit-checklist', () => ({ HabitChecklist: (props: Record<string, unknown>) => React.createElement('View', { ...props, testID: 'checklist' }) }))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => React.createElement('View') }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => React.createElement('View', { testID: 'goal-linking' }) }))
vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({ ReminderSection: ({ children }: { children?: React.ReactNode }) => React.createElement('View', { testID: 'offset-reminders' }, children) }))
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: (props: Record<string, unknown>) => React.createElement('View', { ...props, testID: 'scheduled-reminders' }) }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: (props: Record<string, unknown>) => React.createElement('TimeField', props) }))
vi.mock('@/components/ui/date-field', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/date-field')>()
  return { DateField: (props: React.ComponentProps<typeof actual.DateField>) => formLocale.realDates ? <actual.DateField {...props} /> : React.createElement('DateField', { ...props, testID: 'date-field' }) }
})

function createFormHelpers(overrides: Record<string, unknown> = {}): HabitFormHelpers {
  const values: Record<string, unknown> = { title: 'Run', emoji: '', frequencyUnit: null, frequencyQuantity: 3, days: [], isFlexible: false, dueDate: '2026-09-02', dueTime: '', dueEndTime: '', endDate: '', description: '', reminderEnabled: false, scheduledReminders: [], checklistItems: [], isBadHabit: false, slipAlertEnabled: false, ...overrides }
  return {
    form: { watch: (field: string) => values[field], register: vi.fn(), clearErrors: vi.fn(), resetField: vi.fn(), control: { values }, getValues: vi.fn((field?: string) => field ? values[field] : values), setValue: vi.fn((field: string, value: unknown) => { values[field] = value }), formState: { errors: {} } } as unknown as HabitFormHelpers['form'],
    isOneTime: true, isGeneral: false, isFlexible: false, isRecurring: false, showDayPicker: false, showEndDate: true,
    daysList: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((value) => ({ value, label: value.slice(0, 3), accessibleLabel: value })),
    chooseItemType: vi.fn(), validationFocusRequest: 0, registerDateValidation: () => () => {}, resetModeDrafts: vi.fn(),
    backendFieldErrors: {}, backendFocusRequest: 0, backendFocusField: undefined, reportBackendErrors: vi.fn(() => false), clearBackendErrors: vi.fn(),
    frequencyUnits: [], setOneTime: vi.fn(), setRecurring: vi.fn(), setFlexible: vi.fn(), setGeneral: vi.fn(), toggleDay: vi.fn(), formatTimeInput: vi.fn(), formatEndTimeInput: vi.fn(), validateAll: vi.fn(() => null),
  }
}

function createTags(): TagSelectionState {
  return { selectedTagIds: [], atTagLimit: false, tagValidationErrorKey: null, toggleTag: vi.fn(), resetTags: vi.fn(), showNewTag: false, setShowNewTag: vi.fn(), newTagName: '', setNewTagName: vi.fn(), newTagColor: '#C4530F', setNewTagColor: vi.fn(), tagColors: [], createAndSelectTag: vi.fn(), acceptSuggestedTag: vi.fn(), editingTagId: null, editTagName: '', setEditTagName: vi.fn(), editTagColor: '#C4530F', setEditTagColor: vi.fn(), startEditTag: vi.fn(), saveEditTag: vi.fn(), cancelEditTag: vi.fn(), deleteTag: vi.fn() }
}

describe('HabitFormFields mobile', () => {
  it('keeps the frequency fill action mounted with one spinner during its request', async () => {
    const helpers = createFormHelpers({ title: 'Build a stronger routine' })
    const form = (isSuggesting: boolean) => <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={vi.fn(() => SETUP_PROPOSAL)} isSuggesting={isSuggesting} />
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(form(false)) })
    const action = tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.askAstra')[0]!
    expect(action.findAllByType(AstraGlyph)).toHaveLength(1)
    await TestRenderer.act(() => { tree.update(form(true)) })
    expect(action.props.accessibilityState.busy).toBe(true)
    expect(action.findAllByType(AstraGlyph)).toHaveLength(0)
    expect(action.findAll((node: UnderstandingTestNode) => node.type === 'ActivityIndicator')).toHaveLength(1)
    await TestRenderer.act(() => { tree.update(form(false)) })
    expect(action.findAllByType(AstraGlyph)).toHaveLength(1)
    expect(action.findAll((node: UnderstandingTestNode) => node.type === 'ActivityIndicator')).toHaveLength(0)
  })

  it('keeps merged marked Astra actions guarded across the form freeze', async () => {
    const helpers = createFormHelpers({ itemType: 'habit', title: 'Build a stronger routine', datePhrase: 'after my vacation' })
    const setup = vi.fn(() => SETUP_PROPOSAL)
    const emoji = vi.fn().mockResolvedValue(SETUP_PROPOSAL)
    const form = (disabled: boolean) => <HabitFormInteractionProvider disabled={disabled}>
      <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={setup} onSuggestEmoji={emoji} />
    </HabitFormInteractionProvider>
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(form(false)) })
    const controls = tree.root.findAllByType(PillButton).filter((node: import('react-test-renderer').ReactTestInstance) => node.findAll(candidate => candidate.type === AstraGlyph).length > 0)
    expect(controls).toHaveLength(2)
    const hosts = controls.map((control: import('react-test-renderer').ReactTestInstance) => control.findAll((node) => String(node.type) === 'Pressable')[0]!)
    for (const control of controls) {
      expect(control.findAllByType(AstraGlyph)).toHaveLength(1)
      const host = control.findAll((node: import('react-test-renderer').ReactTestInstance) => String(node.type) === 'Pressable')[0]!
      expect(host.findAll((node: import('react-test-renderer').ReactTestInstance) => String(node.type) === 'Text')).toHaveLength(0)
      const style = StyleSheet.flatten(typeof host.props.style === 'function' ? host.props.style({ pressed: false }) : host.props.style)
      expect(style.width).toBe(48)
      expect(style.borderWidth ?? 0).toBe(0)
      expect(style.outlineWidth ?? 0).toBe(0)
    }
    const deliveredCallbacks = hosts.map((host: import('react-test-renderer').ReactTestInstance) => host.props.onPress as () => void)
    await TestRenderer.act(() => tree.update(form(true)))
    for (const host of hosts) expect(host.props.disabled).toBe(true)
    await TestRenderer.act(() => { for (const callback of deliveredCallbacks) callback(); return Promise.resolve() })
    expect(setup).not.toHaveBeenCalled()
    expect(emoji).not.toHaveBeenCalled()
    expect(dateRequests.request).not.toHaveBeenCalled()
    await TestRenderer.act(() => tree.update(form(false)))
    for (const host of hosts) expect(host.props.disabled).toBe(false)
    dateRequests.request.mockRejectedValueOnce(new Error('Unavailable'))
    await TestRenderer.act(() => { for (const host of hosts) host.props.onPress(); return Promise.resolve() })
    expect(setup).toHaveBeenCalledOnce()
    expect(emoji).toHaveBeenCalledOnce()
    expect(dateRequests.request).not.toHaveBeenCalled()
    await TestRenderer.act(() => tree.unmount())
  })

  it('focuses the single immediate description for backend validation', async () => {
    const focus = vi.fn()
    __setFocusImpl(focus)
    const helpers = createFormHelpers({ description: 'Keep the complete draft' })
    helpers.backendFieldErrors = { description: 'Server description failure' }
    helpers.backendFocusField = 'description'
    helpers.backendFocusRequest = 1
    let tree!: ReturnType<typeof TestRenderer.create>
    try {
      await TestRenderer.act(() => { tree = TestRenderer.create(<HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />) })
      const fields = tree.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput')
      const description = fields.filter((node: UnderstandingTestNode) => node.props.accessibilityLabel === 'habits.form.description')
      expect(description).toHaveLength(1)
      expect(description[0]).toBe(fields[1])
      expect(description[0]!.props.value).toBe('Keep the complete draft')
      expect(description[0]!.props.accessibilityHint).toBe('Server description failure')
      expect(focus).toHaveBeenCalledOnce()
    } finally {
      await TestRenderer.act(() => tree.unmount())
      __setFocusImpl(() => {})
    }
  })

  it.each(['en', 'pt-BR'])('keeps natural date guidance and a single selected date in %s', async (locale) => {
    formLocale.language = locale
    const messages = locale === 'en' ? en : ptBR
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ itemType: 'task' })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />) })
    const phrase = tree.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput' && node.props.accessibilityLabel === 'habits.form.datePhrase')[0]!
    expect(phrase.props.placeholder).toBe(messages.habits.form.datePhrasePlaceholder)
    expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Text' && String(node.props.children).startsWith('common.selectedDate'))).toHaveLength(0)
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each([false, true])('keeps one full description directly after the name with details open %s', async (expanded) => {
    const description = 'Long description\n'.repeat(500)
    const helpers = createFormHelpers({ title: 'Read', description })
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded={expanded} />) })
    const fields = tree.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput')
    expect(fields[0]!.props.accessibilityLabel).toBe('habits.form.describe')
    expect(fields[1]!.props.accessibilityLabel).toBe('habits.form.description')
    expect(fields[1]!.props.value).toBe(description)
    expect(fields[1]!.props.maxLength).toBe(10000)
    expect(fields.filter((node: UnderstandingTestNode) => node.props.accessibilityLabel === 'habits.form.description')).toHaveLength(1)
    await TestRenderer.act(() => fields[1]!.props.onChangeText('Edited description'))
    expect(helpers.form.getValues('description')).toBe('Edited description')
  })

  it.each([false, true])('keeps the sub-habit editor available with Pro access %s', async (hasProAccess) => {
    mockProfileState.hasProAccess = hasProAccess
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <HabitFormFields formHelpers={createFormHelpers()} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded>
          <Text>sub-habit-editor</Text>
        </HabitFormFields>,
      )
    })
    expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Text' && node.props.children === 'sub-habit-editor')).toHaveLength(1)
    expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === 'View' && node.props.testID === 'goal-linking')).toHaveLength(1)
    expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === ListRow && node.props.title === 'common.upgrade')).toHaveLength(0)
    await TestRenderer.act(() => { tree.unmount() })
  })

  it.each(['', '   ', 'Swim'])('reaches the emoji action without replacing setup for title %j', async (title) => {
    const onSuggestEmoji = vi.fn().mockResolvedValue(SETUP_PROPOSAL)
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ title })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestEmoji={onSuggestEmoji} />) })
    const button = tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.suggestEmoji')[0]!
    expect(button.props.disabled).toBe(!title.trim())
    await TestRenderer.act(async () => { await button.props.onPress() })
    expect(onSuggestEmoji).toHaveBeenCalledTimes(title.trim() ? 1 : 0)
    if (!title.trim()) expect(button.props.accessibilityHint).toBe('habits.form.titleRequired')
  })

  it.each([false, true])('preserves the emoji action through pending and success after moving focus: %j', async (moveFocus) => {
    let complete!: (proposal: HabitFormProposal) => void
    const pending = new Promise<HabitFormProposal>((resolve) => { complete = resolve })
    const onSuggestEmoji = vi.fn(() => pending)
    const formHelpers = createFormHelpers({ title: 'Swim', frequencyUnit: 'Day', frequencyQuantity: 1 })
    const form = (isEmojiSuggesting = false) => <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestEmoji={onSuggestEmoji} isEmojiSuggesting={isEmojiSuggesting} />
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(form()) })
    const action = (label: string) => tree.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && matchesFormLabel(node.props.accessibilityLabel, label))[0]!
    const button = action('habits.form.suggestEmoji')
    __setTouchMode(false)
    await TestRenderer.act(() => { __focusHost(button.props.__nativeTag) })
    expect(__getFocusedNativeTag()).toBe(button.props.__nativeTag)
    await TestRenderer.act(() => { button.props.onPress(); tree.update(form(true)) })
    const busy = action('habits.form.suggestEmoji')
    expect(busy === button, 'pending keeps the native action mounted').toBe(true)
    expect(busy.findAllByType(AstraGlyph)).toHaveLength(0)
    expect(busy.findAll((node: UnderstandingTestNode) => node.type === 'ActivityIndicator')).toHaveLength(1)
    expect(busy.props.accessibilityState.busy).toBe(true)
    expect(busy.props.accessibilityState.disabled).toBe(false)
    expect(busy.props.disabled).toBe(false)
    expect(busy.props.onPress).toBeUndefined()
    expect(onSuggestEmoji).toHaveBeenCalledOnce()
    expect(__getFocusedNativeTag()).toBe(button.props.__nativeTag)
    const phrase = tree.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput' && node.props.accessibilityLabel === 'habits.form.describe')[0]!
    if (moveFocus) await TestRenderer.act(() => { __focusHost(phrase.props.__nativeTag) })
    await TestRenderer.act(async () => { complete(SETUP_PROPOSAL); await pending })
    await TestRenderer.act(() => { tree.update(form()) })
    expect(action('habits.form.suggestEmoji') === button, 'success keeps the native action mounted').toBe(true)
    expect(__getFocusedNativeTag()).toBe(moveFocus ? phrase.props.__nativeTag : button.props.__nativeTag)
    expect(button.findAllByType(AstraGlyph)).toHaveLength(1)
    expect(button.findAll((node: UnderstandingTestNode) => node.type === 'ActivityIndicator')).toHaveLength(0)
    expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === 'View' && node.props.testID === 'habit-emoji-well' && node.props['data-proposed'] === true)).toHaveLength(1)
    await TestRenderer.act(() => { tree.unmount() })
    __setTouchMode(true)
  })

  it('keeps the emoji request visible and busy while blocking competing emoji edits', async () => {
    const onSuggestEmoji = vi.fn()
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ title: 'Swim', frequencyUnit: 'Day', frequencyQuantity: 1 })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestEmoji={onSuggestEmoji} isEmojiSuggesting />) })
    const button = tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.suggestEmoji')[0]!
    expect(button.props.disabled).toBe(false)
    expect(button.props.accessibilityState.disabled).toBe(false)
    expect(button.props.accessibilityState.busy).toBe(true)
    const picker = tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.emojiOpenPicker')[0]!
    expect(picker.props.disabled).toBe(true)
    expect(onSuggestEmoji).not.toHaveBeenCalled()
  })

  it('explains the emoji allowance boundary and keeps request failures inline', async () => {
    mockProfileState.aiMessagesUsed = 5
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ title: 'Swim' })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestEmoji={vi.fn()} emojiSuggestionError="Try again" />) })
    const button = tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.suggestEmoji')[0]!
    expect(button.props.disabled).toBe(true)
    expect(button.props.accessibilityHint).toBeTruthy()
    expect(tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityRole === 'alert' && node.props.children === 'Try again')).toHaveLength(1)
    const row = tree!.root.findAll((node: UnderstandingTestNode) => node.type === 'View' && node.props.testID === 'habit-title-row')[0]!
    expect(row.findAll((node: UnderstandingTestNode) => node.props.accessibilityRole === 'alert')).toHaveLength(0)
  })

  it('announces the details expanded state across toggles', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers()} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />)
    })
    const disclosure = () => tree!.root.findAllByType(ListRow)
      .find((node: { props: { title: string } }) => node.props.title === 'habits.form.moreDetails')
      .find((node: { type: unknown; props: { accessibilityRole?: string } }) => typeof node.type === 'string' && node.props.accessibilityRole === 'button')

    expect(disclosure().props.accessibilityState.expanded).toBe(false)
    await TestRenderer.act(() => disclosure().props.onPress())
    expect(disclosure().props.accessibilityState.expanded).toBe(true)
    await TestRenderer.act(() => disclosure().props.onPress())
    expect(disclosure().props.accessibilityState.expanded).toBe(false)
    await TestRenderer.act(() => tree!.unmount())
  })

  it('renders disclosure headings with the field label role and no additional start inset', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ isBadHabit: true })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded><Text>Sub-habit editor</Text></HabitFormFields>)
    })
    const { currentScheme, currentTheme } = useAppTheme()
    const tokens = createTokensV2(currentScheme, currentTheme)
    const keys = ['endDate', 'slipAlert', 'subHabits', 'steps', 'organize', 'ending', 'checklist']
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
    const askIndex = nodes.findIndex((node: { props: Record<string, unknown> }) => node.props.accessibilityLabel === 'habits.form.askAstra')
    expect(correctionIndex).toBeGreaterThan(readingIndex)
    expect(askIndex).toBeGreaterThan(correctionIndex)
  })

  it.each(['en', 'pt-BR'])('renders an editable date in %s', (locale) => {
    formLocale.language = locale
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ itemType: 'task' })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />) })
    expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === 'DateField' && node.props.label === 'habits.form.taskDate')[0]!.props.value).toBe('2026-09-02')
    TestRenderer.act(() => tree.unmount())
  })

  it.each([
    ['en', 'A habit you want to avoid. Log each slip.'],
    ['pt-BR', 'Um hábito que você quer evitar. Registre cada deslize.'],
  ])('defines avoidance and explains slip logging in %s', (locale, expected) => {
    formLocale.language = locale
    let tree!: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ isBadHabit: true })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />)
    })
    try {
      expect(tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Text' && node.props.children === expected)).toHaveLength(0)
    } finally { TestRenderer.act(() => tree.unmount()) }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    formLocale.language = 'en'
    mockProfileState.aiMessagesUsed = 0
    mockProfileState.hasProAccess = false
    useWatchMock.mockImplementation(({ control, name }: { control: { values: Record<string, unknown> }; name: string }) => control.values[name])
  })

  it.each([false, true])('selects and clears an emoji beside the title, schedule locked: %s', async (lockedGeneral) => {
    const formHelpers = createFormHelpers({ title: 'Run every day', frequencyUnit: 'Day', frequencyQuantity: 1 })
    const renderNode = () => <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} lockedGeneral={lockedGeneral} />
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(renderNode()) })
    const buttons = (label: string) => tree!.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && ['button', 'checkbox'].includes(String(node.props.accessibilityRole)) && matchesFormLabel(node.props.accessibilityLabel, label))
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

  it.each(['', '   '])('hides the preview and retains the emoji well for an empty phrase %j even with a saved schedule', async (title) => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ title, emoji: '🏃', frequencyUnit: 'Day', frequencyQuantity: 1 })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />)
    })
    expect(tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.understood')).toHaveLength(0)
    expect(tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.emojiOpenPicker')).toHaveLength(1)
  })

  it('hides the preview and retains the emoji well while Astra reads a phrase with an existing schedule', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ title: 'Run every day', frequencyUnit: 'Day', frequencyQuantity: 1 })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} isSuggesting />)
    })
    expect(tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.emojiOpenPicker')).toHaveLength(1)
    expect(tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.understood')).toHaveLength(0)
  })

  it('shows the emoji well in a fresh empty form', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ title: '' })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />)
    })
    expect(tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.emojiOpenPicker')).toHaveLength(1)
  })

  it('keeps a chosen emoji through clearing, parsing and losing the understood schedule', async () => {
    const { useWatch } = await vi.importActual<typeof import('react-hook-form')>('react-hook-form')
    useWatchMock.mockImplementation(useWatch)
    let formHelpers!: HabitFormHelpers
    function CreateFormHarness({ isSuggesting = false }: { isSuggesting?: boolean }) {
      formHelpers = useHabitForm({ initialData: { itemType: 'habit' } })
      return <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} isSuggesting={isSuggesting} readPhraseLocally />
    }
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<CreateFormHarness />) })
    const buttons = (label: string) => tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && ['button', 'checkbox'].includes(String(node.props.accessibilityRole)) && matchesFormLabel(node.props.accessibilityLabel, label))
    expect(buttons('habits.form.emojiOpenPicker')).toHaveLength(1)
    await TestRenderer.act(() => tree!.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput' && node.props.accessibilityLabel === 'habits.form.describe')[0]!.props.onChangeText('Run every day'))
    expect(buttons('habits.form.emojiOpenPicker')).toHaveLength(1)
    await TestRenderer.act(() => buttons('habits.form.emojiOpenPicker')[0]!.props.onPress())
    await TestRenderer.act(() => buttons('habits.form.emoji: 🌱')[0]!.props.onPress())
    expect(formHelpers.form.getValues('emoji')).toBe('🌱')

    const expectHidden = () => {
      expect(buttons('habits.form.emojiOpenPicker')).toHaveLength(1)
      expect(tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.understood')).toHaveLength(0)
      expect(formHelpers.form.getValues('emoji')).toBe('🌱')
    }
    await TestRenderer.act(() => tree!.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput' && node.props.accessibilityLabel === 'habits.form.describe')[0]!.props.onChangeText(''))
    expectHidden()
    await TestRenderer.act(() => tree!.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput' && node.props.accessibilityLabel === 'habits.form.describe')[0]!.props.onChangeText('Run every day'))
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
    const ask = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.askAstra')[0]
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
    const formHelpers = createFormHelpers({ reminderEnabled: true, dueTime: '08:00' })
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />)
      await Promise.resolve()
    })
    openTiming(tree)

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

    expect(tree.root.findAll((node: any) => node.props?.testID === 'date-field' && node.props.label === 'habits.form.endDate')).toHaveLength(0)
  })

  it('preserves a prefilled end time when the exact time changes', async () => {
    const formHelpers = createFormHelpers({ reminderEnabled: true, dueTime: '08:00', dueEndTime: '09:00' })
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />)
      await Promise.resolve()
    })
    openTiming(tree)

    TestRenderer.act(() => tree.root.findAllByType('TimeField').find((node: { props: { label: string } }) => node.props.label === 'habits.form.exactTime').props.onChange('10:00'))

    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '10:00', { shouldDirty: true })
    expect(formHelpers.form.getValues('dueEndTime')).toBe('09:00')
  })

  it('shows no upgrade row for free sub-habits', async () => {
    const onUpgrade = vi.fn()
    let tree: any
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers()} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={onUpgrade} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />)
      await Promise.resolve()
    })

    const subHabitRow = tree.root.findAll((node: any) => node.type === 'Pressable' && node.findAll((child: any) => child.type === 'Text' && child.props.children === 'common.upgrade').length > 0)[0]
    expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Text' && node.props.children === 'habits.form.subHabits')).toHaveLength(0)
    expect(subHabitRow).toBeUndefined()
    expect(onUpgrade).not.toHaveBeenCalled()
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

    const ask = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.askAstra')[0]
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

    const ask = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.askAstra')[0]
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

    const ask = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.askAstra')[0]
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

    let ask = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.askAstra')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })
    expect(onSuggestSetup).toHaveBeenCalledOnce()

    await TestRenderer.act(async () => {
      tree.root.findByType(HabitUnderstanding).props.onValueChange('Build a calmer routine')
      await Promise.resolve()
    })
    ask = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.askAstra')[0]
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

    const ask = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.askAstra')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })
    expect(tree.root.findByType(HabitUnderstanding).props.proposed).toBe(true)
    expect(tree.root.findByProps({ testID: 'checklist' }).props.proposedItemCount).toBe(1)
    expect(tree.root.findByProps({ testID: 'sub-habit-editor' }).parent.props.testID).toBe('proposed-field')

    TestRenderer.act(() => tree.root.findByType(HabitUnderstanding).props.onToggleDay('Monday'))

    expect(tree.root.findByType(HabitUnderstanding).props.proposed).toBe(false)
    expect(tree.root.findByProps({ testID: 'checklist' }).props.proposedItemCount).toBe(1)
    expect(tree.root.findByProps({ testID: 'sub-habit-editor' }).parent.props.testID).toBe('proposed-field')
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

    const ask = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.askAstra')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })
    expect(tree.root.findByProps({ testID: 'checklist' }).props.proposedItemCount).toBe(1)
    expect(tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.askAstra')).toHaveLength(0)

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

    const ask = tree.root.findAll((node: any) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.askAstra')[0]
    await TestRenderer.act(async () => {
      ask.props.onPress()
      await Promise.resolve()
    })
    expect(tree.root.findAll((node: any) => node.props?.testID === 'proposed-field').length).toBeGreaterThan(0)

    TestRenderer.act(() => resolveProposal())
    expect(tree.root.findAll((node: any) => node.props?.testID === 'proposed-field')).toHaveLength(0)
  })
})

interface ProposedTestNode extends UnderstandingTestNode {
  parent: ProposedTestNode | null
}

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

it('keeps rejected tag Name validation beside its input in the owning habit editor', async () => {
  tagMutations.create.mockReset()
  tagMutations.create.mockRejectedValue({ errors: { Name: ['Tag must have at most 50 characters'] } })
  const focus = vi.fn()
  __setFocusImpl(focus)
  const helpers = createFormHelpers()
  function OwningForm() {
    const tags = useTagSelection()
    return <HabitFormFields formHelpers={helpers} tags={tags} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />
  }
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => { tree = TestRenderer.create(<OwningForm />) })
  const press = (label: string) => {
    let node = tree.root.findAll((candidate: { type: unknown; props: Record<string, unknown> }) => (candidate.type === 'Pressable' && candidate.props.accessibilityLabel === label) || (candidate.type === 'Text' && candidate.props.children === label))[0]!
    while (typeof node.props.onPress !== 'function' && node.parent) node = node.parent
    node.props.onPress()
  }
  const input = () => tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'TextInput' && node.props.accessibilityLabel === 'habits.form.tagName')[0]!
  try {
    await TestRenderer.act(() => press('habits.form.tags'))
    await TestRenderer.act(() => press('habits.form.newTag'))
    await TestRenderer.act(() => input().props.onChangeText('Health'))
    await TestRenderer.act(async () => {
      press('common.add')
      await Promise.resolve()
    })
    expect(input().props.value).toBe('Health')
    expect(input().props.accessibilityHint).toBe('Tag must have at most 50 characters')
    expect(__getFocusedNativeTag()).toBe(input().props.__nativeTag)
    expect(focus).toHaveBeenLastCalledWith(expect.objectContaining({ accessibilityLabel: 'habits.form.tagName', accessibilityHint: 'Tag must have at most 50 characters' }))
    expect(tree.root.findByType('Sheet').props.open).toBe(true)
    const caption = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Text' && node.props.children === 'Tag must have at most 50 characters')[0]!
    expect(caption.props.accessibilityRole).toBeUndefined()
    expect(caption.props.accessibilityLiveRegion).toBeUndefined()
    await TestRenderer.act(async () => {
      press('common.add')
      await Promise.resolve()
    })
    expect(tagMutations.create).toHaveBeenCalledTimes(2)
    expect(input().props.value).toBe('Health')
    expect(input().props.accessibilityHint).toBe('Tag must have at most 50 characters')
    expect(__getFocusedNativeTag()).toBe(input().props.__nativeTag)
    await TestRenderer.act(() => input().props.onChangeText('Updated'))
    expect(input().props.accessibilityHint).toBeUndefined()
    tagMutations.create.mockResolvedValueOnce({ id: 'tag-created', name: 'Updated', color: '#C4530F' })
    await TestRenderer.act(async () => {
      press('common.add')
      await Promise.resolve()
    })
    expect(input()).toBeUndefined()
    expect(tagMutations.create).toHaveBeenLastCalledWith({ name: 'Updated', color: expect.any(String) })
    expect(tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Text' && node.props.children === 'habits.form.selectedCount:{"count":1}')).toHaveLength(1)
  } finally {
    await TestRenderer.act(() => tree.unmount())
    __setFocusImpl(() => {})
  }
})

it('exposes tag suggestions from the owning habit form', async () => {
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => {
    tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ title: 'Run', description: 'Outside' })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />)
  })
  const picker = tree.root.findAllByType(ListRow).find((node: { props: { title: string } }) => node.props.title === 'habits.form.tags')!
  await TestRenderer.act(() => picker.props.onClick())
  const actions = tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.suggestTags')
  expect(actions).toHaveLength(1)
  expect(actions[0]!.findAllByType('Text')).toHaveLength(0)
  expect(StyleSheet.flatten(actions[0]!.props.style({ pressed: false })).width).toBe(48)
  await TestRenderer.act(() => tree.unmount())
})

describe('habit tag suggestions', () => {
  let tree: ReturnType<typeof TestRenderer.create>
  function button(label: string) {
    return tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && ['button', 'checkbox'].includes(String(node.props.accessibilityRole)) && matchesFormLabel(node.props.accessibilityLabel, label))[0]!
  }
  function proposalButton(label: string) {
    return tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'View' && node.props.testID === 'proposed-field')[0]?.findAll((node: { type: unknown; props: Record<string, unknown> }) => typeof node.type === 'string' && ['button', 'checkbox'].includes(String(node.props.accessibilityRole)) && matchesFormLabel(node.props.accessibilityLabel, label))[0]
  }
  async function renderTagForm(title = ' Run ', description = ' Outside ', initialIds: string[] = []) {
    const helpers = createFormHelpers({ title, description })
    function OwningForm() {
      const tags = useTagSelection(initialIds)
      return <><Text testID="selected-tags">{tags.selectedTagIds.join(',')}</Text><HabitFormFields formHelpers={helpers} tags={tags} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded /></>
    }
    await TestRenderer.act(() => { tree = TestRenderer.create(<OwningForm />) })
    const picker = tree.root.findAllByType(ListRow).find((node: { type: unknown; props: Record<string, unknown> }) => node.props.title === 'habits.form.tags')!
    await TestRenderer.act(() => picker.props.onClick())
    return { helpers, refresh: () => tree.update(<OwningForm />) }
  }
  const selected = () => tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Text' && node.props.testID === 'selected-tags')[0]!.props.children
  const text = (value: string) => tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Text' && node.props.children === value)
  beforeEach(() => {
    tagCollection.tags = []
    tagMutations.suggest.mockReset()
    tagMutations.create.mockReset()
    tagMutations.delete.mockReset()
    formLocale.language = 'en'
    useWatchMock.mockImplementation(({ control, name }: { control: { values: Record<string, unknown> }; name: string }) => control.values[name])
  })
  afterEach(async () => { if (tree) await TestRenderer.act(() => tree.unmount()) })

  it.each([409, 500])('handles rejected tag deletion status %i and restores the selection', async (status) => {
    tagCollection.tags = [{ id: 'existing', name: 'Health', color: '#7c3aed' }]
    const failure = createApiClientError(status, status === 409 ? { errorCode: 'CONCURRENT_UPDATE_CONFLICT' } : null, 'Failed')
    tagMutations.delete.mockRejectedValue(failure)
    modalFeedback.showError.mockClear()
    vi.mocked(captureError).mockClear()
    await renderTagForm('Read', '', ['existing'])
    await TestRenderer.act(() => button('habits.form.deleteTag: Health').props.onPress())
    await vi.waitFor(() => expect(modalFeedback.showError).toHaveBeenCalledWith(status === 409 ? 'toast.errors.conflict' : 'toast.errors.server'))
    expect(selected()).toBe('existing')
    expect(tagMutations.delete).toHaveBeenCalledExactlyOnceWith('existing')
    expect(captureError).toHaveBeenCalledTimes(status === 500 ? 1 : 0)
  })

  it.each(['settled', 'pending'])('rejects a deleted existing proposal from a %s request while keeping other proposals', async (phase) => {
    tagCollection.tags = [
      { id: 'existing', name: 'Health', color: '#7c3aed' },
      { id: 'outdoors', name: 'Outdoors', color: '#7c3aed' },
    ]
    let complete!: (response: { tags: { name: string; color: string; isExisting: boolean; id: string | null }[] }) => void
    tagMutations.suggest.mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    const proposals = { tags: [
      { ...tagCollection.tags[0]!, isExisting: true },
      { ...tagCollection.tags[1]!, isExisting: true },
      { name: 'Reading', color: '#7c3aed', isExisting: false, id: null },
    ] }
    const view = await renderTagForm()
    tagMutations.delete.mockImplementation((id: string) => {
      tagCollection.tags = tagCollection.tags.filter((tag) => tag.id !== id)
      view.refresh()
      return Promise.resolve()
    })
    await TestRenderer.act(() => button('habits.form.suggestTags').props.onPress())
    if (phase === 'settled') await TestRenderer.act(() => complete(proposals))
    await TestRenderer.act(() => button('habits.form.deleteTag: Health').props.onPress())
    expect(tagMutations.delete).toHaveBeenCalledWith('existing')
    if (phase === 'pending') await TestRenderer.act(() => complete(proposals))
    const staleProposal = proposalButton('Health')
    if (staleProposal) await TestRenderer.act(() => staleProposal.props.onPress())
    expect(selected()).toBe('')
    expect(proposalButton('Health')).toBeUndefined()
    await TestRenderer.act(() => proposalButton('Outdoors').props.onPress())
    expect(selected()).toBe('outdoors')
    tagMutations.create.mockResolvedValue({ id: 'created' })
    await TestRenderer.act(() => button('Reading').props.onPress())
    expect(selected()).toBe('outdoors,created')
    expect(tagMutations.suggest).toHaveBeenCalledTimes(1)
    expect(tagMutations.create).toHaveBeenCalledWith({ name: 'Reading', color: '#7c3aed' })
  })

  it.each(['settled', 'pending', 'error'])('preserves %s suggestion state across tag search remounts', async (phase) => {
    tagCollection.tags = Array.from({ length: 25 }, (_, index) => ({ id: `tag-${index}`, name: `Tag ${index}`, color: '#000000' }))
    let complete!: (response: { tags: { name: string; color: string; isExisting: boolean; id: null }[] }) => void
    tagMutations.suggest.mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    if (phase === 'error') tagMutations.suggest.mockRejectedValueOnce(new Error('Unavailable'))
    await renderTagForm()
    await TestRenderer.act(() => button('habits.form.suggestTags').props.onPress())
    const proposals = { tags: [{ name: 'Reading', color: '#000000', isExisting: false, id: null }] }
    if (phase === 'settled') await TestRenderer.act(() => complete(proposals))
    await TestRenderer.act(() => tree.root.findByType(BottomSheetAppTextInput).props.onChangeText('Tag 24'))
    if (phase === 'pending') {
      expect(button('habits.form.suggestTags').props.accessibilityState).toMatchObject({ disabled: true, busy: true })
      expect(text('habits.form.suggestingTags')).toHaveLength(1)
      await TestRenderer.act(() => complete(proposals))
    }
    if (phase === 'error') expect(text('habits.form.suggestTagsError')).toHaveLength(1)
    else expect(button('Reading')).toBeDefined()
    expect(tagMutations.suggest).toHaveBeenCalledTimes(1)
  })

  it.each(['success', 'failure'])('preserves proposals and acceptance status across optimistic virtualization: %s', async (outcome) => {
    tagCollection.tags = Array.from({ length: 20 }, (_, index) => ({ id: `tag-${index}`, name: `Tag ${index}`, color: '#000000' }))
    tagMutations.suggest.mockResolvedValue({ tags: [
      { name: 'Reading', color: '#000000', isExisting: false, id: null },
      { name: 'Outdoors', color: '#000000', isExisting: false, id: null },
    ] })
    const view = await renderTagForm()
    let complete!: (response: { id: string }) => void
    let fail!: (error: Error) => void
    tagMutations.create.mockImplementation(() => {
      tagCollection.tags = [...tagCollection.tags, { id: 'optimistic', name: 'Reading', color: '#000000' }]
      view.refresh()
      return new Promise((resolve, reject) => { complete = resolve; fail = reject })
    })
    await TestRenderer.act(() => button('habits.form.suggestTags').props.onPress())
    await TestRenderer.act(() => button('Reading').props.onPress())
    expect(tree.root.findByType(BottomSheetAppTextInput)).toBeDefined()
    expect(button('Outdoors')?.props.disabled).toBe(true)
    expect(text('common.loading')).toHaveLength(1)
    expect(button('habits.form.suggestTags').props.disabled).toBe(true)
    if (outcome === 'success') {
      await TestRenderer.act(() => complete({ id: 'created' }))
      expect(selected()).toBe('created')
      expect(button('Reading')).toBeUndefined()
    } else {
      await TestRenderer.act(() => {
        tagCollection.tags = tagCollection.tags.slice(0, 20)
        view.refresh()
        fail(new Error('Unavailable'))
      })
      expect(selected()).toBe('')
      expect(button('Reading')).toBeDefined()
      expect(tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Text' && node.props.accessibilityRole === 'alert')).toHaveLength(1)
    }
    expect(button('Outdoors')?.props.disabled).toBe(false)
    expect(tagMutations.suggest).toHaveBeenCalledTimes(1)
  })

  it('requests proposals and accepts existing and new tags only on selection', async () => {
    tagCollection.tags = [{ id: 'existing', name: 'Health', color: '#7c3aed' }]
    tagMutations.suggest.mockResolvedValue({ tags: [
      { name: 'Health', color: '#7c3aed', isExisting: true, id: 'existing' },
      { name: 'Reading', color: '#7c3aed', isExisting: false, id: null },
    ] })
    tagMutations.create.mockResolvedValue({ id: 'created' })
    await renderTagForm()
    await TestRenderer.act(() => button('habits.form.suggestTags').props.onPress())
    expect(tagMutations.suggest).toHaveBeenCalledWith({ title: 'Run', description: 'Outside', language: 'en' })
    expect(tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'View' && node.props.testID === 'proposed-field')).toHaveLength(1)
    expect(selected()).toBe('')
    expect(tagMutations.create).not.toHaveBeenCalled()
    await TestRenderer.act(() => proposalButton('Health').props.onPress())
    expect(selected()).toBe('existing')
    expect(tagMutations.create).not.toHaveBeenCalled()
    await TestRenderer.act(() => button('Reading').props.onPress())
    expect(selected()).toBe('existing,created')
    expect(tagMutations.create).toHaveBeenCalledWith({ name: 'Reading', color: '#7c3aed' })
  })

  it('preserves the action label while loading and announces empty results', async () => {
    let resolve!: (response: { tags: [] }) => void
    tagMutations.suggest.mockImplementation(() => new Promise((complete) => { resolve = complete }))
    formLocale.language = 'pt-BR'
    await renderTagForm('Run', '   ')
    expect(button('habits.form.suggestTags').findAllByType(AstraGlyph)).toHaveLength(1)
    expect(StyleSheet.flatten(button('habits.form.suggestTags').props.style({ pressed: false })).borderWidth ?? 0).toBe(0)
    await TestRenderer.act(() => button('habits.form.suggestTags').props.onPress())
    expect(button('habits.form.suggestTags').props.accessibilityState).toMatchObject({ disabled: true, busy: true })
    expect(button('habits.form.suggestTags').findAllByType(AstraGlyph)).toHaveLength(0)
    expect(button('habits.form.suggestTags').findAll((node: UnderstandingTestNode) => node.type === 'ActivityIndicator')).toHaveLength(1)
    expect(button('habits.form.suggestTags').props.accessibilityHint).toBe('habits.form.suggestingTags')
    expect(text('habits.form.suggestingTags')[0]!.props.accessibilityLiveRegion).toBe('polite')
    expect(tagMutations.suggest).toHaveBeenCalledWith({ title: 'Run', description: null, language: 'pt-BR' })
    await TestRenderer.act(() => resolve({ tags: [] }))
    expect(text('habits.form.noTagSuggestions')).toHaveLength(1)
    expect(button('habits.form.suggestTags').props.disabled).toBe(false)
    expect(button('habits.form.suggestTags').findAllByType(AstraGlyph)).toHaveLength(1)
  })

  it('shows request failure inline and permits retry', async () => {
    tagMutations.suggest.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce({ tags: [] })
    await renderTagForm()
    await TestRenderer.act(() => button('habits.form.suggestTags').props.onPress())
    expect(text('habits.form.suggestTagsError')[0]!.props.accessibilityRole).toBe('alert')
    await TestRenderer.act(() => button('habits.form.suggestTags').props.onPress())
    expect(text('habits.form.noTagSuggestions')).toHaveLength(1)
    expect(text('habits.form.suggestTagsError')).toHaveLength(0)
  })

  it('retains a failed new proposal and disables other actions during acceptance', async () => {
    tagMutations.suggest.mockResolvedValue({ tags: [{ name: 'Reading', color: '#7c3aed', isExisting: false, id: null }] })
    let reject!: (error: Error) => void
    tagMutations.create.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail })).mockResolvedValueOnce({ id: 'created' })
    await renderTagForm()
    await TestRenderer.act(() => button('habits.form.suggestTags').props.onPress())
    await TestRenderer.act(() => button('Reading').props.onPress())
    expect(button('Reading').props.disabled).toBe(true)
    expect(text('common.loading')[0]!.props.accessibilityLiveRegion).toBe('polite')
    expect(button('habits.form.suggestTags').props.disabled).toBe(true)
    await TestRenderer.act(() => reject(new Error('Unavailable')))
    expect(selected()).toBe('')
    expect(tree.root.findAll((node: { type: unknown; props: Record<string, unknown> }) => node.type === 'Text' && node.props.accessibilityRole === 'alert')).toHaveLength(1)
    await TestRenderer.act(() => button('Reading').props.onPress())
    expect(selected()).toBe('created')
  })

  it.each([['   ', []], ['Run', ['1', '2', '3', '4', '5']]])('disables suggestions with an empty title or full selection: %s', async (title, ids) => {
    const view = await renderTagForm(title, '', ids)
    expect(button('habits.form.suggestTags').props.disabled).toBe(true)
    expect(tagMutations.suggest).not.toHaveBeenCalled()
    expect(button('habits.form.suggestTags').props.accessibilityHint).toBe(title.trim() ? 'habits.form.tagLimit' : 'habits.form.titleRequired')
    expect(text(title.trim() ? 'habits.form.tagLimit' : 'habits.form.titleRequired').filter((node: { props: { accessibilityLiveRegion?: string } }) => node.props.accessibilityLiveRegion === 'polite')).toHaveLength(0)
    if (!title.trim()) {
      await TestRenderer.act(() => { view.helpers.form.setValue('title', 'Run'); view.refresh() })
      expect(button('habits.form.suggestTags').props.disabled).toBe(false)
      expect(text('habits.form.titleRequired')).toHaveLength(0)
    }
  })

  it('retains the native tag limit explanation and recovers when a selected tag is removed', async () => {
    tagCollection.tags = ['Health', 'Reading', 'Work', 'Rest', 'Travel', 'Home'].map((name, index) => ({ id: String(index + 1), name, color: '#7c3aed' }))
    await renderTagForm('Run', '', ['1', '2', '3', '4'])
    expect(button('habits.form.suggestTags').props.disabled).toBe(false)
    await TestRenderer.act(() => button('Travel').props.onPress())
    expect(selected()).toBe('1,2,3,4,5')
    expect(button('habits.form.suggestTags').props.disabled).toBe(true)
    expect(button('habits.form.suggestTags').props.accessibilityHint).toBe('habits.form.tagLimit')
    expect(button('Home').props.disabled).toBe(true)
    await TestRenderer.act(() => {
      button('habits.form.suggestTags').props.onPress()
    })
    expect(tagMutations.suggest).not.toHaveBeenCalled()
    expect(selected()).toBe('1,2,3,4,5')
    expect(text('habits.form.tagLimit').filter((node: { props: { accessibilityLiveRegion?: string } }) => node.props.accessibilityLiveRegion === 'polite')).toHaveLength(0)
    await TestRenderer.act(() => button('Travel').props.onPress())
    expect(selected()).toBe('1,2,3,4')
    expect(button('habits.form.suggestTags').props.disabled).toBe(false)
    expect(button('habits.form.suggestTags').props.accessibilityHint).toBeUndefined()
    expect(button('Home').props.disabled).toBe(false)
  })

  it('disables remaining proposals at capacity', async () => {
    tagCollection.tags = [{ id: 'existing', name: 'Health', color: '#7c3aed' }]
    tagMutations.suggest.mockResolvedValue({ tags: [
      { name: 'Health', color: '#7c3aed', isExisting: true, id: 'existing' },
      { name: 'Reading', color: '#7c3aed', isExisting: false, id: null },
    ] })
    await renderTagForm('Run', '', ['1', '2', '3', '4'])
    await TestRenderer.act(() => button('habits.form.suggestTags').props.onPress())
    await TestRenderer.act(() => proposalButton('Health').props.onPress())
    expect(button('Reading').props.disabled).toBe(true)
    expect(tagMutations.create).not.toHaveBeenCalled()
  })

  it.each(['title', 'description', 'locale', 'returning title', 'account'])('drops an in-flight result when the habit context changes: %s', async (context) => {
    let resolve!: (response: { tags: { name: string; color: string; isExisting: boolean; id: null }[] }) => void
    tagMutations.suggest.mockImplementation(() => new Promise((complete) => { resolve = complete }))
    const view = await renderTagForm()
    await TestRenderer.act(() => button('habits.form.suggestTags').props.onPress())
    await TestRenderer.act(() => {
      if (context === 'locale') formLocale.language = 'pt-BR'
      else if (context === 'account') advanceAccountGeneration()
      else view.helpers.form.setValue(context === 'description' ? 'description' : 'title', 'Read')
      view.refresh()
    })
    if (context === 'returning title') await TestRenderer.act(() => { view.helpers.form.setValue('title', ' Run '); view.refresh() })
    await TestRenderer.act(() => resolve({ tags: [{ name: 'Outdoors', color: '#7c3aed', isExisting: false, id: null }] }))
    expect(button('Outdoors')).toBeUndefined()
    expect(button('habits.form.suggestTags').props.disabled).toBe(false)
  })
})

describe('manual schedule creation', () => {
  beforeEach(() => {
    formLocale.language = 'en'
    mockProfileState.aiMessagesUsed = 0
    useWatchMock.mockImplementation(({ control, name }: { control: { values: Record<string, unknown> }; name: string }) => control.values[name])
  })
  it.each(['Day', 'Week', 'Month', 'Year'] as const)('creates every interval and flexible %s schedule without Astra', async (unit) => {
    const { useWatch } = await vi.importActual<typeof import('react-hook-form')>('react-hook-form')
    useWatchMock.mockImplementation(useWatch)
    mockProfileState.aiMessagesUsed = 5
    const ask = vi.fn()
    let helpers!: HabitFormHelpers
    function OwningForm() {
      helpers = useHabitForm({ initialData: { itemType: 'habit', title: 'Read', dueDate: '2026-09-02' } })
      return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={ask} readPhraseLocally />
    }
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<OwningForm />) })
    await TestRenderer.act(() => tree!.root.findAllByType(ListRow).find((node: { props: { title: string } }) => node.props.title === 'habits.form.moreDetails')!.props.onClick())
    const radio = (label: string) => tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === `habits.form.${label}`)[0]!
    await TestRenderer.act(() => radio('every').props.onPress())
    await TestRenderer.act(() => radio(`unit${unit}`).props.onPress())
    const quantity = () => tree!.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput' && node.props.accessibilityLabel === 'habits.form.frequency')[0]!
    await TestRenderer.act(() => quantity().props.onChangeText('12'))
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 12, isFlexible: false, days: [] })
    await TestRenderer.act(() => tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.repeatMore')[0]!.props.onPress())
    expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 12, intervalWeeks: 2 })
    await TestRenderer.act(() => radio('timesPerUnit').props.onPress())
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 12, isFlexible: true, days: [] })
    await TestRenderer.act(() => quantity().props.onChangeText('0'))
    expect(quantity().props.accessibilityHint).toBe('habits.form.frequencyRequired')
    expect(helpers.validateAll()).toBe('habits.form.frequencyRequired')
    await TestRenderer.act(() => quantity().props.onChangeText(''))
    expect(tree!.root.findByType(HabitUnderstanding).props.sentence).toBe('')
    await TestRenderer.act(() => quantity().props.onChangeText('4'))
    expect(helpers.validateAll()).toBeNull()
    expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 4, isFlexible: true })
    await TestRenderer.act(() => tree!.root.findByType(HabitUnderstanding).props.onValueChange('Read books'))
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 4, isFlexible: true })
    expect(ask).not.toHaveBeenCalled()
    await TestRenderer.act(() => tree!.unmount())
  })

  it.each(['quantity', 'unit', 'mode', 'day', 'interval'] as const)('marks an Astra schedule as proposed until a %s edit', async (edit) => {
    const { useWatch } = await vi.importActual<typeof import('react-hook-form')>('react-hook-form')
    useWatchMock.mockImplementation(useWatch)
    const patch = buildHabitFormPatchFromSuggestion({ emoji: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] })
    let helpers!: HabitFormHelpers
    function OwningForm() {
      helpers = useHabitForm({ initialData: { itemType: 'habit', title: 'Read', dueDate: '2099-01-01' } })
      return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={() => ({ ...SETUP_PROPOSAL, setup: applySuggestionSchedule(patch, helpers) })} readPhraseLocally />
    }
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<OwningForm />) })
    const proposed = (control: ProposedTestNode): boolean => {
      for (let node = control.parent; node; node = node.parent) {
        if (typeof node.type === 'string' && /^proposed-(field|row|block)$/.test(String(node.props.testID))) return true
      }
      return false
    }
    const host = (label: string, role?: string) => tree.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && matchesFormLabel(node.props.accessibilityLabel, label) && (!role || node.props.accessibilityRole === role))[0]!
    try {
      expect(tree.root.findAll((node: UnderstandingTestNode) => node.props.testID === 'proposed-block')).toHaveLength(0)
      await TestRenderer.act(async () => {
        tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.askAstra')[0]!.props.onPress()
        await Promise.resolve()
      })
      expect(helpers.form.getValues('days')).toEqual(['Monday'])
      await TestRenderer.act(() => tree.root.findAllByType(ListRow).find((node: { props: { title: string } }) => node.props.title === 'habits.form.moreDetails')!.props.onClick())
      const quantity = () => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput' && node.props.accessibilityLabel === 'habits.form.frequency')[0]!
      for (const control of [quantity(), host('habits.form.every', 'radio'), host('habits.form.unitDay', 'radio'), host(helpers.daysList.find((day) => day.value === 'Monday')!.accessibleLabel, 'button')]) expect(proposed(control)).toBe(true)
      expect(quantity().props.value).toBe('1')
      const tokens = createTokensV2('orange', 'dark')
      expect(StyleSheet.flatten(quantity().props.style).color).toBe(tokens.fg3)
      const selectedUnitLabel = tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Text' && node.props.children === 'habits.form.unitDay')[0]!
      expect(StyleSheet.flatten(selectedUnitLabel.props.style).color).toBe(tokens.fg3)
      expect(host(helpers.daysList.find((day) => day.value === 'Monday')!.accessibleLabel, 'button').props.accessibilityState.selected).toBe(true)
      expect(proposed(host('habits.form.describe'))).toBe(false)
      await TestRenderer.act(() => {
        if (edit === 'quantity') quantity().props.onChangeText('2')
        else if (edit === 'unit') host('habits.form.unitMonth', 'radio').props.onPress()
        else if (edit === 'mode') host('habits.form.timesPerUnit', 'radio').props.onPress()
        else host(edit === 'day' ? helpers.daysList.find((day) => day.value === 'Tuesday')!.accessibleLabel : 'habits.form.repeatMore', 'button').props.onPress()
      })
      expect(tree.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && /^proposed-(field|row|block)$/.test(String(node.props.testID)))).toHaveLength(0)
      expect(helpers.form.getValues('title')).toBe('Read')
      expect(StyleSheet.flatten(quantity().props.style).color).toBe(tokens.fg1)
    } finally {
      await TestRenderer.act(() => tree.unmount())
    }
  })

  it('disables manual scheduling for a locked parent', async () => {
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ isGeneral: true })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded lockedGeneral />) })
    const quantity = tree!.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput' && node.props.accessibilityLabel === 'habits.form.frequency')[0]!
    expect(quantity.props.editable).toBe(false)
    const options = tree!.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio' && !String(node.props.accessibilityLabel).startsWith('habits.form.type'))
    expect(options).toHaveLength(7)
    for (const option of options) expect(option.props.accessibilityState).toMatchObject({ disabled: true })
    await TestRenderer.act(() => tree!.unmount())
  })
})

it('edits end times, reports ordering errors, and disables the field after clearing the start', async () => {
  const helpers = createFormHelpers()
  const renderNode = () => <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => { tree = TestRenderer.create(renderNode()) })
  const field = (label: string) => tree.root.findAllByType('TimeField').find((node: { props: { label: string } }) => node.props.label === label)
  const refresh = async (action: () => void) => {
    await TestRenderer.act(action)
    await TestRenderer.act(() => tree.update(renderNode()))
  }
  openTiming(tree)
  expect(tree.root.findAllByProps({ label: 'habits.form.dueEndTime' })).toHaveLength(0)
  await refresh(() => field('habits.form.exactTime').props.onChange('08:00'))
  expect(field('habits.form.dueEndTime').props.disabled).toBe(false)
  await refresh(() => field('habits.form.dueEndTime').props.onChange('09:00'))
  expect(helpers.form.getValues('dueEndTime')).toBe('09:00')
  const values = habitFormSchema.parse(helpers.form.getValues())
  expect(buildCreateHabitRequest(values, [], [], [], [])).toMatchObject({ dueTime: '08:00', dueEndTime: '09:00' })
  expect(buildUpdateHabitRequest(values, true, '', [], [])).toMatchObject({ dueTime: '08:00', dueEndTime: '09:00' })
  expect(field('habits.form.dueEndTime').props.value).toBe('09:00')
  for (const invalid of ['08:00', '07:00']) {
    await refresh(() => field('habits.form.dueEndTime').props.onChange(invalid))
    expect(field('habits.form.dueEndTime').props.error).toBe('habits.form.endTimeBeforeStartTime')
  }
  await refresh(() => field('habits.form.dueEndTime').props.onChange('10:00'))
  expect(field('habits.form.dueEndTime').props.error).toBeUndefined()
  await refresh(() => field('habits.form.dueEndTime').props.onClear())
  expect(field('habits.form.dueEndTime').props.value).toBe('')
  await refresh(() => field('habits.form.dueEndTime').props.onChange('10:00'))
  await refresh(() => field('habits.form.exactTime').props.onClear())
  expect(helpers.form.getValues('dueEndTime')).toBe('')
  expect(tree.root.findAllByProps({ label: 'habits.form.dueEndTime' })).toHaveLength(0)
  await TestRenderer.act(() => tree.unmount())
})

describe('restored end-date control', () => {
  it.each([false, true])('clears the selected end date through the update request and returns focus to its date control, flexible: %s', async (isFlexible) => {
    const { useWatch } = await vi.importActual<typeof import('react-hook-form')>('react-hook-form')
    useWatchMock.mockImplementation(useWatch)
    let helpers!: HabitFormHelpers
    function OwningForm() {
      helpers = useHabitForm({ initialData: { itemType: 'habit', title: 'Run', frequencyUnit: 'Day', frequencyQuantity: 1, isFlexible, endDate: '2026-11-01' } })
      return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />
    }
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<OwningForm />) })
    const action = () => tree.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityLabel === 'habits.form.removeEndDate')
    expect(action()).toHaveLength(1)
    await TestRenderer.act(() => { action()[0]!.props.onPress() })
    const request = buildUpdateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), false, '2026-11-01', [], [])
    expect(request.clearEndDate).toBe(true)
    expect(request.endDate).toBeUndefined()
    expect(action()).toHaveLength(0)
    const date = tree.root.findAll((node: UnderstandingTestNode) => node.type === 'DateField' && node.props.label === 'habits.form.endDate')[0]!
    expect(date.props.value).toBe('')
    expect(date.props.focusRequest).toBe(1)
    await TestRenderer.act(() => { tree.unmount() })
  })
})

describe('restored type and editable date', () => {
  it('offers task and habit choices before title entry with details closed', async () => {
    useWatchMock.mockImplementation(({ control, name }: { control: { values: Record<string, unknown> }; name: string }) => control.values[name])
    let tree!: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ itemType: 'task' })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />) })
    const radios = tree.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio')
    expect(radios.map((node: UnderstandingTestNode) => node.props.accessibilityLabel)).toContain('habits.form.typeTask, habits.form.typeTaskHint')
    expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === 'DateField' && node.props.label === 'habits.form.taskDate')).toHaveLength(1)
    await TestRenderer.act(() => tree.unmount())
  })
})

it('restores Task and General through the native owning form and real request builder', async () => {
  const { useWatch } = await vi.importActual<typeof import('react-hook-form')>('react-hook-form')
  useWatchMock.mockImplementation(useWatch)
  let helpers!: HabitFormHelpers
  function OwningForm() {
    helpers = useHabitForm({ initialData: { title: 'migrar chats do ChatGPT para o Claude', dueDate: '2026-10-20' } })
    return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} readPhraseLocally />
  }
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => { tree = TestRenderer.create(<OwningForm />) })
  const host = (label: string, role: string) => tree.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && matchesFormLabel(node.props.accessibilityLabel, label) && node.props.accessibilityRole === role)[0]!
  const input = (label: string) => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput' && matchesFormLabel(node.props.accessibilityLabel, label))[0]!
  await TestRenderer.act(() => { expect(helpers.validateAll()).toBeNull() })
  await TestRenderer.act(() => host('habits.form.typeTask', 'radio').props.onPress())
  vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date'] })
  try {
    await TestRenderer.act(() => input('habits.form.datePhrase').props.onChangeText('03-04'))
    await TestRenderer.act(() => { expect(helpers.validateAll()).toBe('habits.form.datePhraseUnresolved') })
    await TestRenderer.act(() => input('habits.form.datePhrase').props.onChangeText('dia 26'))
    expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])).toMatchObject({ dueDate: '2026-10-26', title: 'migrar chats do ChatGPT para o Claude' })
    await TestRenderer.act(() => input('habits.form.describe').props.onChangeText('Read every Monday'))
    expect(helpers.form.getValues('frequencyUnit')).toBeNull()
    await TestRenderer.act(() => host('habits.form.typeHabit', 'radio').props.onPress())
    await TestRenderer.act(() => input('habits.form.datePhrase').props.onChangeText('dia 28'))
    await TestRenderer.act(() => tree.root.findAllByType(ListRow).find((node: { props: { title: string } }) => node.props.title === 'habits.form.moreDetails')!.props.onClick())
    const general = tree.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && node.props.accessibilityRole === 'radio' && String(node.props.accessibilityLabel).startsWith('habits.form.noSchedule,'))[0]!
    await TestRenderer.act(() => general.props.onPress())
    expect(helpers.form.getValues()).toMatchObject({ itemType: 'habit', isGeneral: true, isBadHabit: false, reminderEnabled: false })
    expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])).toMatchObject({ isGeneral: true })
    expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === 'DateField' && node.props.label === 'habits.form.taskDate')).toHaveLength(0)
    await TestRenderer.act(() => host('habits.form.every', 'radio').props.onPress())
    expect(helpers.form.getValues('isGeneral')).toBe(false)
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-28')
    await TestRenderer.act(() => host('habits.form.typeTask', 'radio').props.onPress())
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-26')
    expect(helpers.form.getValues('datePhrase')).toBe('dia 26')
  } finally { vi.useRealTimers(); await TestRenderer.act(() => tree.unmount()) }
})

describe('native date ownership across form transitions', () => {
  let tree: ReturnType<typeof TestRenderer.create>
  let helpers: HabitFormHelpers
  beforeEach(async () => {
    formLocale.realController = true
    const { useWatch } = await vi.importActual<typeof import('react-hook-form')>('react-hook-form')
    useWatchMock.mockImplementation(useWatch)
    dateRequests.request.mockReset()
    mockProfileState.aiMessagesUsed = 0
    mockProfileState.timeZone = 'UTC'
    formLocale.language = 'en'
    formLocale.realDates = true
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date'] })
  })
  afterEach(async () => {
    await TestRenderer.act(() => tree?.unmount())
    vi.useRealTimers()
    mockProfileState.timeZone = 'UTC'
    formLocale.language = 'en'
    formLocale.realDates = false
    formLocale.theme = 'dark'
  })
  function OwningForm({ flexible = false, title = 'Read', fieldsVersion = 0, lockedGeneral = null }: { flexible?: boolean; title?: string; fieldsVersion?: number; lockedGeneral?: boolean | null }) {
    helpers = useHabitForm({ initialData: { itemType: 'habit', title, dueDate: '2026-10-20', frequencyUnit: 'Day', frequencyQuantity: 1, isFlexible: flexible, endDate: '2026-12-01' } })
    return <HabitFormFields key={fieldsVersion} lockedGeneral={lockedGeneral} readPhraseLocally formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />
  }
  async function mount(flexible = false) { await TestRenderer.act(() => { tree = TestRenderer.create(<OwningForm flexible={flexible} />) }) }
  const hosts = (label: string) => tree.root.findAll((node: UnderstandingTestNode) => typeof node.type === 'string' && String(node.props.accessibilityLabel).startsWith(label))
  const press = async (label: string) => { await TestRenderer.act(() => hosts(label)[0]!.props.onPress()) }
  const phrase = async (value: string) => { await TestRenderer.act(() => hosts('habits.form.datePhrase')[0]!.props.onChangeText(value)) }
  const action = (label: string) => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && (matchesFormLabel(node.props.accessibilityLabel, label) || (!node.props.accessibilityLabel && node.findAll((child: UnderstandingTestNode) => child.type === 'Text' && matchesFormLabel(child.props.children, label)).length > 0)))
  const general = () => press('habits.form.noSchedule,')
  const recurring = () => press('habits.form.every')

  it.each([
    ['pt-BR', 'toda semana'], ['pt-BR', 'todas as semanas'], ['pt-BR', 'semanalmente'],
    ['en', 'every week'], ['en', 'weekly'],
  ])('routes weekly wording %s %s through the real native form', async (locale, wording) => {
    formLocale.language = locale
    await mount()
    await phrase(wording)
    expect(helpers.form.getValues('frequencyUnit')).toBe('Week')
    expect(helpers.form.getValues()).toMatchObject({ itemType: 'habit', frequencyQuantity: 1, isFlexible: false, days: [], intervalWeeks: 1, dueDate: '2026-10-20', endDate: '2026-12-01', title: 'Read', datePhrase: wording, dateIssue: '' })
    await TestRenderer.act(() => { expect(helpers.validateAll()).toBeNull() })
    expect(hosts('habits.form.datePhrase')[0]!.props.value).toBe(wording)
    expect(action('habits.form.suggestDate')).toHaveLength(0)
    expect(dateRequests.request).not.toHaveBeenCalled()
    const values = habitFormSchema.parse(helpers.form.getValues())
    expect(buildCreateHabitRequest(values, [], [], [], [])).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 1, startDate: '2026-10-20' })
    expect(buildUpdateHabitRequest(values, false, '2026-12-01', [], [])).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 1, startDate: '2026-10-20' })
  })

  it.each([0, 5])('keeps the native offline date reason accessible with %s messages used', async (used) => {
    connection.isOnline = false
    mockProfileState.aiMessagesUsed = used
    await mount()
    await phrase('after my vacation')
    expect(dateRequests.request).not.toHaveBeenCalled()
    connection.isOnline = true
    await TestRenderer.act(() => tree.update(<OwningForm />))
    expect(helpers.form.getValues()).toMatchObject({ datePhrase: 'after my vacation', dueDate: '2026-10-20' })
    await phrase('tomorrow')
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-21')
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each([false, true])('recognizes native weekly wording offline at capacity with Pro access %s', async (hasProAccess) => {
    connection.isOnline = false
    mockProfileState.aiMessagesUsed = 5
    mockProfileState.hasProAccess = hasProAccess
    await mount()
    await phrase('weekly')
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 1, dueDate: '2026-10-20', dateIssue: '' })
    expect(action('habits.form.suggestDate')).toHaveLength(0)
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it('keeps tomorrow calendar-only through the real native form', async () => {
    await mount()
    await phrase('tomorrow')
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: 'Day', dueDate: '2026-10-21', dateIssue: '' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it('preserves the current native flexible draft when an older fixed draft exists', async () => {
    await mount()
    await TestRenderer.act(() => {
      helpers.setFlexible()
      helpers.form.setValue('dueDate', '2026-10-23')
      helpers.form.setValue('dueTime', '08:00')
      helpers.form.setValue('reminderEnabled', true)
    })
    await phrase('weekly')
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: 'Week', isFlexible: false, dueDate: '2026-10-23', dueTime: '08:00', reminderEnabled: true, endDate: '2026-12-01' })
  })

  it('recovers Task wording through the same-date native picker', async () => {
    await mount()
    await press('habits.form.typeTask')
    await phrase('weekly')
    await TestRenderer.act(() => { helpers.validateAll() })
    await press('habits.form.taskDate,')
    const day = tree.root.findByType('Sheet').findAll((node: { type: unknown; props: { accessibilityState?: { selected?: boolean } } }) => node.type === 'Pressable' && node.props.accessibilityState?.selected === true)[0]!
    await TestRenderer.act(() => day.props.onPress())
    await TestRenderer.act(() => { expect(helpers.validateAll()).toBeNull() })
    expect(helpers.form.getValues()).toMatchObject({ itemType: 'task', frequencyUnit: null, dueDate: '2026-10-20', datePhrase: '', dateIssue: '' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each(['en', 'pt-BR'])('retains deliberate Task with one %s recovery and real native type focus', async (locale) => {
    formLocale.language = locale
    await mount()
    await press('habits.form.typeTask')
    await phrase('every week')
    expect(helpers.form.getValues()).toMatchObject({ itemType: 'task', frequencyUnit: null, frequencyQuantity: null, dueDate: '2026-10-20', dateIssue: 'habits.form.recurrenceRequiresHabit' })
    expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Text' && node.props.children === 'habits.form.recurrenceRequiresHabit')).toHaveLength(1)
    expect(action('habits.form.suggestDate')).toHaveLength(0)
    await TestRenderer.act(() => { expect(helpers.validateAll()).toBe('habits.form.recurrenceRequiresHabit') })
    expect(__getFocusedNativeTag()).toBe(hosts('habits.form.typeTask')[0]!.props.__nativeTag)
    expect(hosts('habits.form.typeTask')[0]!.props.accessibilityState.checked).toBe(true)
    await press('habits.form.typeHabit')
    expect(helpers.form.getValues()).toMatchObject({ itemType: 'habit', frequencyUnit: 'Week', frequencyQuantity: 1, dueDate: '2026-10-20', dateIssue: '' })
    await TestRenderer.act(() => { expect(helpers.validateAll()).toBeNull() })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each([false, true])('resolves weekly Task wording after a General draft, inherited lock=%s', async (locked) => {
    await mount()
    await general()
    await press('habits.form.typeTask')
    await phrase('dia 23')
    await phrase('weekly')
    if (locked) await TestRenderer.act(() => tree.update(<OwningForm lockedGeneral />))
    await press('habits.form.typeHabit')
    if (locked) {
      expect(helpers.form.getValues()).toMatchObject({ itemType: 'habit', isGeneral: true, frequencyUnit: null, dateIssue: 'errors.api.generalMismatchWithParent' })
      expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Text' && node.props.children === 'errors.api.generalMismatchWithParent')).toHaveLength(1)
      await TestRenderer.act(() => { expect(helpers.validateAll()).toBe('errors.api.generalMismatchWithParent') })
      expect(__getFocusedNativeTag()).toBe(hosts('habits.form.typeHabit')[0]!.props.__nativeTag)
      const request = buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])
      expect(request.isGeneral).toBe(true)
      expect(request).not.toHaveProperty('frequencyUnit')
      expect(request).not.toHaveProperty('startDate')
    } else {
      expect(helpers.form.getValues()).toMatchObject({ itemType: 'habit', isGeneral: false, frequencyUnit: 'Week', frequencyQuantity: 1, dueDate: '2026-10-23', datePhrase: 'weekly', dateIssue: '' })
      expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 1, startDate: '2026-10-23' })
      await TestRenderer.act(() => { expect(helpers.validateAll()).toBeNull() })
      await TestRenderer.act(() => tree.update(<OwningForm fieldsVersion={1} />))
      expect(helpers.form.getValues()).toMatchObject({ isGeneral: false, frequencyUnit: 'Week', dueDate: '2026-10-23', dateIssue: '' })
    }
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it('lets later native cadence and General decisions win over retained weekly wording', async () => {
    await mount(true)
    await phrase('weekly')
    await press('habits.form.unitMonth')
    await TestRenderer.act(() => tree.update(<OwningForm />))
    await TestRenderer.act(() => { expect(helpers.validateAll()).toBeNull() })
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: 'Month', datePhrase: 'weekly', dateIssue: '', dueDate: '2026-10-20' })
    await general()
    expect(helpers.form.getValues()).toMatchObject({ isGeneral: true, frequencyUnit: null })
    await recurring()
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: 'Month', dateIssue: '' })
    await phrase('weekly')
    expect(helpers.form.getValues('frequencyUnit')).toBe('Week')
    await phrase('tomorrow')
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: 'Week', dueDate: '2026-10-21', dateIssue: '' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it('keeps a manual native correction across field remount, account reset and validation with an old title phrase', async () => {
    await TestRenderer.act(() => { tree = TestRenderer.create(<OwningForm title="Read every Monday" />) })
    await phrase('weekly')
    await press('habits.form.unitMonth')
    await TestRenderer.act(() => tree.update(<OwningForm title="Read every Monday" fieldsVersion={1} />))
    advanceAccountGeneration()
    await TestRenderer.act(() => tree.update(<OwningForm title="Read every Monday" fieldsVersion={1} />))
    await TestRenderer.act(() => { expect(helpers.validateAll()).toBeNull() })
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: 'Month', datePhrase: 'weekly', dateIssue: '', dueDate: '2026-10-20' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it('keeps native manual cadence after manual date clears weekly wording and fields reopen', async () => {
    await TestRenderer.act(() => { tree = TestRenderer.create(<OwningForm title="Read every Monday" />) })
    await phrase('weekly')
    await press('habits.form.unitMonth')
    await press('habits.form.habitStartDate,')
    await press(formatLocaleDate('2026-10-23', 'en', { month: 'long', day: 'numeric', year: 'numeric' }))
    expect(helpers.form.getValues('datePhrase')).toBe('')
    await TestRenderer.act(() => tree.update(<OwningForm title="Read every Monday" fieldsVersion={1} />))
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: 'Month', dueDate: '2026-10-23', datePhrase: '', dateIssue: '' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it('retires a pending native date consultation when weekly wording is handled', async () => {
    let finish!: (value: { date: string; referenceDate: string }) => void
    dateRequests.request.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await mount()
    await phrase('after vacation')
    await TestRenderer.act(async () => { await new Promise(resolve => setTimeout(resolve, 750)) })
    await phrase('weekly')
    await TestRenderer.act(() => finish({ date: '2026-10-26', referenceDate: '2026-10-20' }))
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: 'Week', dueDate: '2026-10-20', dateIssue: '' })
    expect(action('habits.form.acceptDate')).toHaveLength(0)
    expect(action('habits.form.suggestDate')).toHaveLength(0)
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })

  it.each([false, true])('clears the persisted end date in a real task conversion, flexible: %s', async (flexible) => {
    await mount(flexible)
    await press('habits.form.typeTask')
    expect(helpers.form.getValues()).toMatchObject({ endDate: '', frequencyUnit: null, isFlexible: false, itemType: 'task' })
    await TestRenderer.act(() => { expect(helpers.validateAll()).toBeNull() })
    const request = buildUpdateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), helpers.isOneTime, '2026-12-01', [], [])
    expect(request).toMatchObject({ clearEndDate: true, dueDate: '2026-10-20' })
    expect(request).not.toHaveProperty('endDate')
    expect(request).not.toHaveProperty('startDate')
    expect(request.frequencyUnit).toBeUndefined()
  })

  it.each(['after my vacation', '31 February', '03-04'])('restores parse recovery after General for %s without consulting', async (text) => {
    await mount()
    await phrase(text)
    await general()
    expect(hosts('habits.form.datePhrase')).toHaveLength(0)
    await recurring()
    expect(helpers.form.getValues('datePhrase')).toBe(text)
    expect(hosts('habits.form.habitStartDate,')).toHaveLength(1)
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each(['day', 'timezone', 'locale', 'account'] as const)('requires manual confirmation after General and changed %s', async (change) => {
    await mount()
    await phrase('tomorrow')
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-21')
    await general()
    if (change === 'day') vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
    if (change === 'timezone') mockProfileState.timeZone = 'America/Sao_Paulo'
    if (change === 'locale') formLocale.language = 'pt-BR'
    if (change === 'account') advanceAccountGeneration()
    await TestRenderer.act(() => tree.update(<OwningForm />))
    await recurring()
    expect(helpers.form.getValues()).toMatchObject({ datePhrase: 'tomorrow', dueDate: '2026-10-21', dateIssue: 'habits.form.dateStale' })
    await TestRenderer.act(() => { expect(helpers.validateAll()).toBe('habits.form.dateStale') })
    await press('habits.form.habitStartDate,')
    const day = tree.root.findByType('Sheet').findAll((node: { type: unknown; props: { accessibilityState?: { selected?: boolean } } }) => node.type === 'Pressable' && node.props.accessibilityState?.selected === true)[0]!
    await TestRenderer.act(() => day.props.onPress())
    await TestRenderer.act(() => { expect(helpers.validateAll()).toBeNull() })
    expect(helpers.form.getValues()).toMatchObject({ datePhrase: '', dateIssue: '', dueDate: '2026-10-21' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  async function changeCadence(change: string) {
    if (change === 'unit') await press('habits.form.unitWeek')
    if (change === 'quantity') await TestRenderer.act(() => hosts('habits.form.frequency').find((node: UnderstandingTestNode) => node.type === 'TextInput')!.props.onChangeText('2'))
    if (change === 'days') await press(helpers.daysList[0]!.accessibleLabel)
    if (change === 'interval') await press('habits.form.repeatMore')
    if (change === 'flexible') await press('habits.form.timesPerUnit')
    if (change === 'general') { await general(); await recurring() }
  }

  it.each(['unit', 'quantity', 'days', 'interval', 'flexible', 'general'])('retires the delayed response after %s changes', async (change) => {
    let finish!: (value: { date: string; referenceDate: string }) => void
    dateRequests.request.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await mount()
    await phrase('after my vacation')
    await TestRenderer.act(async () => { await new Promise(resolve => setTimeout(resolve, 750)) })
    await changeCadence(change)
    await TestRenderer.act(async () => { finish({ date: '2026-10-26', referenceDate: '2026-10-20' }); await Promise.resolve() })
    expect(action('habits.form.acceptDate')).toHaveLength(0)
    expect(helpers.form.getValues()).toMatchObject({ dueDate: '2026-10-20', datePhrase: 'after my vacation' })
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })

})

const repeatPhraseCases = [
  { wording: "every day", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "daily", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "once a week", expected: {"frequencyUnit": "Week", "frequencyQuantity": 1, "isFlexible": true, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "twice a week", expected: {"frequencyUnit": "Week", "frequencyQuantity": 2, "isFlexible": true, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "3x a week", expected: {"frequencyUnit": "Week", "frequencyQuantity": 3, "isFlexible": true, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "every Monday", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": ["Monday"], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "weekdays", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "todo dia", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "todos os dias", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "uma vez por semana", expected: {"frequencyUnit": "Week", "frequencyQuantity": 1, "isFlexible": true, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "duas vezes por semana", expected: {"frequencyUnit": "Week", "frequencyQuantity": 2, "isFlexible": true, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "3x por semana", expected: {"frequencyUnit": "Week", "frequencyQuantity": 3, "isFlexible": true, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "toda segunda", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": ["Monday"], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "dias úteis", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "every week", expected: {"frequencyUnit": "Week", "frequencyQuantity": 1, "isFlexible": false, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "toda semana", expected: {"frequencyUnit": "Week", "frequencyQuantity": 1, "isFlexible": false, "days": [], "intervalWeeks": 1, "dueDate": "2026-10-20"} },
  { wording: "every Monday from next week", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": ["Monday"], "intervalWeeks": 1, "dueDate": "2026-10-26"} },
  { wording: "toda segunda a partir da próxima semana", expected: {"frequencyUnit": "Day", "frequencyQuantity": 1, "isFlexible": false, "days": ["Monday"], "intervalWeeks": 1, "dueDate": "2026-10-26"} }
]

describe.each(['create', 'edit'] as const)('actual native %s modal submit feedback', (owner) => {
  let tree: ReturnType<typeof TestRenderer.create>
  const closed = vi.fn()
  beforeEach(async () => {
    const { useWatch } = await vi.importActual<typeof import('react-hook-form')>('react-hook-form')
    useWatchMock.mockImplementation(useWatch)
    modalFeedback.showError.mockReset()
    modalFeedback.create.mockReset().mockResolvedValue({})
    modalFeedback.update.mockReset().mockResolvedValue({})
    closed.mockReset()
    dateRequests.request.mockReset().mockResolvedValue({ date: '2026-10-26', referenceDate: '2026-10-20' })
    mockProfileState.aiMessagesUsed = 0
    mockProfileState.timeZone = 'UTC'
    formLocale.language = 'en'
    formLocale.realDates = true
    formLocale.realDateCopy = true
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
    formLocale.realDates = false
    formLocale.realDateCopy = false
    formLocale.language = 'en'
  })
  const input = (label: string) => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput' && matchesFormLabel(node.props.accessibilityLabel, label))[0]!
  const phraseInput = () => input('habits.form.datePhrase')
  const action = (label: string) => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && (matchesFormLabel(node.props.accessibilityLabel, label) || (!node.props.accessibilityLabel && node.findAll((child: UnderstandingTestNode) => child.type === 'Text' && matchesFormLabel(child.props.children, label)).length > 0)))[0]!
  const captions = (text: string) => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Text' && node.props.children === text)
  const mutation = () => owner === 'create' ? modalFeedback.create : modalFeedback.update
  async function mount(type: 'task' | 'habit' | null) {
    const habit = createMockHabit({ title: 'Read', frequencyUnit: type === 'habit' ? 'Day' : null, dueDate: '2026-10-20', startDate: '2026-10-20' })
    const client = new QueryClient()
    const modal = () => <QueryClientProvider client={client}><FocusProvenanceView>{owner === 'create'
        ? <CreateHabitModal open onClose={closed} initialTitle="Read" />
        : <EditHabitModal open onClose={closed} habit={habit} />}</FocusProvenanceView></QueryClientProvider>
    await TestRenderer.act(() => { tree = TestRenderer.create(modal()) })
    if (type) await TestRenderer.act(() => {
      tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && matchesFormLabel(node.props.accessibilityLabel, (type === 'task' ? 'habits.form.typeTask' : 'habits.form.typeHabit')))[0]!.props.onPress()
    })
    expect(input('habits.form.describe').props.value).toBe('Read')
    if (owner === 'create') expect(tree.root.findByType(HabitCreateFrame).props.title).toBe(type === 'habit' ? 'habits.form.newHabit' : 'habits.form.newTask')
    return { refresh: async () => { await TestRenderer.act(() => tree.update(modal())) } }
  }
  async function submit() {
    await TestRenderer.act(() => action(owner === 'create' ? 'habits.createHabit' : 'common.save').props.onPress())
  }

  it.each(['en', 'pt-BR'])('saves the entered cadence with an accepted Astra start in %s', async (locale) => {
    formLocale.realController = true
    formLocale.language = locale
    await mount('habit')
    await TestRenderer.act(() => phraseInput().props.onChangeText('every Monday from after vacation'))
    await TestRenderer.act(async () => { await new Promise(resolve => setTimeout(resolve, 750)) })
    expect(phraseInput().props.value).toBe('every Monday from after vacation')
    await submit()
    expect(mutation()).toHaveBeenCalledOnce()
    const request = expect.objectContaining({ frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], startDate: '2026-10-26' })
    expect(mutation()).toHaveBeenCalledWith(owner === 'create' ? request : { habitId: 'habit-1', data: request })
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })

  it.each(['en', 'pt-BR'])('blocks an unapplied explicit start after profile loading until reread in %s', async (locale) => {
    formLocale.realController = true
    formLocale.language = locale
    mockProfileState.timeZone = undefined
    const view = await mount('habit')
    await TestRenderer.act(() => phraseInput().props.onChangeText('every Monday from next week'))
    mockProfileState.timeZone = 'UTC'
    await view.refresh()
    await submit()
    expect(mutation()).not.toHaveBeenCalled()
    expect(phraseInput().props.accessibilityHint).toContain((locale === 'en' ? en : ptBR).habits.form.datePhraseUnresolved)
    expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && String(node.props.accessibilityLabel).startsWith('habits.form.habitStartDate,'))[0]!.props.disabled).toBeFalsy()
    await TestRenderer.act(() => phraseInput().props.onChangeText('every Monday from next week '))
    await submit()
    expect(mutation()).toHaveBeenCalledOnce()
    const request = expect.objectContaining({ frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], startDate: '2026-10-26' })
    expect(mutation()).toHaveBeenCalledWith(owner === 'create' ? request : { habitId: 'habit-1', data: request })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  if (owner === 'create') it('keeps native weekly wording behind the required explicit type choice', async () => {
    formLocale.realController = true
    await mount(null)
    await TestRenderer.act(() => phraseInput().props.onChangeText('weekly'))
    await submit()
    expect(captions('habits.form.recurrenceRequiresHabit')).toHaveLength(1)
    expect(mutation()).not.toHaveBeenCalled()
    await TestRenderer.act(() => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && matchesFormLabel(node.props.accessibilityLabel, 'habits.form.typeHabit'))[0]!.props.onPress())
    await submit()
    expect(mutation()).toHaveBeenCalledOnce()
    expect(mutation()).toHaveBeenCalledWith(expect.objectContaining({ frequencyUnit: 'Week', frequencyQuantity: 1, startDate: '2026-10-20' }))
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each([
    ['pt-BR', 'toda semana'], ['pt-BR', 'todas as semanas'], ['pt-BR', 'semanalmente'],
    ['en', 'every week'], ['en', 'weekly'],
  ])('saves locally routed weekly wording %s %s only on ordinary native Submit', async (locale, wording) => {
    formLocale.realController = true
    formLocale.language = locale
    await mount('habit')
    await TestRenderer.act(() => phraseInput().props.onChangeText(wording))
    expect(phraseInput().props.value).toBe(wording)
    expect(mutation()).not.toHaveBeenCalled()
    expect(dateRequests.request).not.toHaveBeenCalled()
    await submit()
    const request = expect.objectContaining({ title: 'Read', frequencyUnit: 'Week', frequencyQuantity: 1, startDate: '2026-10-20' })
    expect(mutation()).toHaveBeenCalledOnce()
    expect(mutation()).toHaveBeenCalledWith(owner === 'create' ? request : { habitId: 'habit-1', data: request })
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  it.each(['en', 'pt-BR'].flatMap((locale) => repeatPhraseCases.map((phrase) => ({ locale, ...phrase }))))('saves repeat phrase $locale $wording through the actual native modal', async ({ locale, wording, expected }) => {
    formLocale.realController = true
    formLocale.language = locale
    await mount('habit')
    await TestRenderer.act(() => phraseInput().props.onChangeText(wording))
    if (owner === 'create') await TestRenderer.act(() => tree.root.findAllByType(ListRow).find((node: { props: { title: string } }) => node.props.title === 'habits.form.moreDetails')!.props.onClick())
    const schedule = tree.root.findByType(HabitScheduleFields).props
    expect(schedule).toMatchObject({ unit: expected.frequencyUnit, quantity: expected.frequencyQuantity, flexible: expected.isFlexible })
    expect(tree.root.findByType(HabitUnderstanding).props.days).toEqual(expected.days)
    expect(mutation()).not.toHaveBeenCalled()
    await submit()
    const { dueDate, days, isFlexible, ...cadence } = expected
    const request = expect.objectContaining({ ...cadence, ...(days.length ? { days } : {}), ...(isFlexible || owner === 'edit' ? { isFlexible } : {}), title: 'Read', startDate: dueDate })
    expect(mutation()).toHaveBeenCalledOnce()
    expect(mutation()).toHaveBeenCalledWith(owner === 'create' ? request : { habitId: 'habit-1', data: request })
    expect(dateRequests.request).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  if (owner === 'create') it.each((['en', 'pt-BR'] as const).flatMap((locale) =>
    (['task', 'habit'] as const).map((type) => ({ locale, type })),
  ))('settles title parsing and repeated edits without an update loop for $locale $type', async ({ locale, type }) => {
    formLocale.language = locale
    const errors = vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
      if (/Maximum update depth exceeded|Too many re-renders/i.test(String(message))) throw new Error(String(message))
    })
    onTestFinished(() => errors.mockRestore())
    const view = await mount(type)
    const titleInput = () => input('habits.form.describe')
    const initialTitle = locale === 'en' ? 'Read every Monday' : 'Ler toda segunda'
    const editedTitle = locale === 'en' ? 'Read every Tuesday' : 'Ler toda terça'
    async function typeTitle(title: string) {
      await TestRenderer.act(() => titleInput().props.onChangeText(''))
      for (let length = 1; length <= title.length; length += 1) {
        await TestRenderer.act(() => titleInput().props.onChangeText(title.slice(0, length)))
      }
    }
    await typeTitle(initialTitle)
    expect(titleInput().props.value).toBe(initialTitle)
    const understanding = () => tree.root.findByType(HabitUnderstanding).props.sentence
    const initialUnderstanding = understanding()
    await view.refresh()
    expect(titleInput().props.value).toBe(initialTitle)
    expect(understanding()).toBe(initialUnderstanding)
    await typeTitle(editedTitle)
    expect(titleInput().props.value).toBe(editedTitle)
    const editedUnderstanding = understanding()
    if (type === 'habit') expect(editedUnderstanding).not.toBe(initialUnderstanding)
    await view.refresh()
    expect(titleInput().props.value).toBe(editedTitle)
    expect(understanding()).toBe(editedUnderstanding)
    await TestRenderer.act(() => phraseInput().props.onChangeText(locale === 'en' ? 'tomorrow' : 'amanhã'))
    expect(captions('habits.form.acceptDate')).toHaveLength(0)
    await submit()
    expect(mutation()).toHaveBeenCalledOnce()
    const request = modalFeedback.create.mock.calls[0]![0]
    expect(request).toMatchObject({ title: type === 'habit' ? locale === 'en' ? 'Read' : 'Ler' : editedTitle, [type === 'habit' ? 'startDate' : 'dueDate']: '2026-10-21' })
    if (type === 'habit') expect(request).toMatchObject({ frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Tuesday'] })
    else expect(request.frequencyUnit).toBeUndefined()
    expect(dateRequests.request).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/Maximum update depth exceeded|Too many re-renders/i)
  })

  it.each([
    ['en', 'task', 'automatic'],
    ['en', 'habit', 'manual'],
    ['pt-BR', 'task', 'manual'],
    ['pt-BR', 'habit', 'automatic'],
  ] as const)('keeps %s %s automatic date filling through %s recovery', async (locale, type, recovery) => {
    formLocale.language = locale
    await mount(type)
    await TestRenderer.act(() => phraseInput().props.onChangeText('after vacation'))
    await TestRenderer.act(async () => { await new Promise(resolve => setTimeout(resolve, 750)) })
    const picker = () => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && String(node.props.accessibilityLabel).startsWith(type === 'task' ? 'habits.form.taskDate,' : 'habits.form.habitStartDate,'))[0]!
    const date = recovery === 'automatic' ? '2026-10-26' : '2026-10-27'
    if (recovery === 'manual') {
      await TestRenderer.act(() => picker().props.onPress())
      const label = formatLocaleDate(date, locale, { month: 'long', day: 'numeric', year: 'numeric' })
      await TestRenderer.act(() => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && matchesFormLabel(node.props.accessibilityLabel, label))[0]!.props.onPress())
    }
    await submit()
    const request = expect.objectContaining({ title: 'Read', [type === 'task' ? 'dueDate' : 'startDate']: date })
    expect(mutation()).toHaveBeenCalledOnce()
    expect(mutation()).toHaveBeenCalledWith(owner === 'create' ? request : { habitId: 'habit-1', data: request })
    expect(closed).toHaveBeenCalledOnce()
    expect(dateRequests.request).toHaveBeenCalledOnce()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  it.each([false, true].flatMap((flexible) => [false, true].map((editAfterReturn) => ({ flexible, editAfterReturn }))))('saves the restored monthly draft after General, flexible=$flexible, edited=$editAfterReturn', async ({ flexible, editAfterReturn }) => {
    await mount('habit')
    const radio = (label: string) => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && String(node.props.accessibilityLabel).startsWith(`habits.form.${label}`))[0]!
    await TestRenderer.act(() => input('habits.form.describe').props.onChangeText('Read every Monday'))
    if (owner === 'create') await TestRenderer.act(() => tree.root.findAllByType(ListRow).find((node: { props: { title: string } }) => node.props.title === 'habits.form.moreDetails')!.props.onClick())
    if (flexible) await TestRenderer.act(() => radio('timesPerUnit').props.onPress())
    await TestRenderer.act(() => radio('unitMonth').props.onPress())
    await TestRenderer.act(() => input('habits.form.frequency').props.onChangeText('2'))
    await TestRenderer.act(() => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === 'habits.form.repeatMore')[0]!.props.onPress())
    await TestRenderer.act(() => phraseInput().props.onChangeText('tomorrow'))
    await TestRenderer.act(() => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && String(node.props.accessibilityLabel).startsWith('habits.form.endDate,'))[0]!.props.onPress())
    const endDateLabel = formatLocaleDate('2026-10-22', 'en', { month: 'long', day: 'numeric', year: 'numeric' })
    await TestRenderer.act(() => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === endDateLabel)[0]!.props.onPress())
    await TestRenderer.act(() => radio('noSchedule').props.onPress())
    await TestRenderer.act(() => radio(flexible ? 'timesPerUnit' : 'every').props.onPress())
    if (editAfterReturn) {
      await TestRenderer.act(() => radio('unitYear').props.onPress())
      await TestRenderer.act(() => input('habits.form.frequency').props.onChangeText('4'))
    }
    await TestRenderer.act(() => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && String(node.props.accessibilityLabel).startsWith('habits.form.habitStartDate,'))[0]!.props.onPress())
    const startDateLabel = formatLocaleDate('2026-10-21', 'en', { month: 'long', day: 'numeric', year: 'numeric' })
    await TestRenderer.act(() => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === startDateLabel)[0]!.props.onPress())
    await submit()
    expect(mutation()).toHaveBeenCalledOnce()
    const request = expect.objectContaining({ title: 'Read every Monday', frequencyUnit: editAfterReturn ? 'Year' : 'Month', frequencyQuantity: editAfterReturn ? 4 : 2, intervalWeeks: 2, startDate: '2026-10-21', endDate: '2026-10-22' })
    expect(mutation()).toHaveBeenCalledWith(owner === 'create' ? request : { habitId: 'habit-1', data: request })
    const submitted = owner === 'create' ? mutation().mock.calls[0]![0] : mutation().mock.calls[0]![0].data
    expect(submitted.isFlexible ?? false).toBe(flexible)
    expect(submitted.days ?? []).toEqual([])
    expect(dateRequests.request).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  if (owner === 'create') it.each((['en', 'pt-BR'] as const).flatMap((locale) =>
    (['title-before-type', 'task-before-title', 'habit-to-task', 'general', 'recurring'] as const).map((transition) => ({ locale, transition })),
  ))('saves the owned title for $locale after $transition', async ({ locale, transition }) => {
    formLocale.language = locale
    await mount(transition === 'title-before-type' ? null : transition === 'task-before-title' ? 'task' : 'habit')
    if (transition === 'task-before-title') expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && matchesFormLabel(node.props.accessibilityLabel, 'habits.form.typeTask'))[0]!.props.accessibilityState.checked).toBe(true)
    const title = locale === 'en' ? 'Read every Monday' : 'Ler toda segunda'
    await TestRenderer.act(() => input('habits.form.describe').props.onChangeText(title))
    if (transition === 'general') {
      await TestRenderer.act(() => tree.root.findAllByType(ListRow).find((node: { props: { title: string } }) => node.props.title === 'habits.form.moreDetails')!.props.onClick())
      await TestRenderer.act(() => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && String(node.props.accessibilityLabel).startsWith('habits.form.noSchedule'))[0]!.props.onPress())
    } else if (transition !== 'recurring' && transition !== 'task-before-title') await TestRenderer.act(() => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && matchesFormLabel(node.props.accessibilityLabel, 'habits.form.typeTask'))[0]!.props.onPress())
    await submit()
    expect(mutation()).toHaveBeenCalledOnce()
    const request = modalFeedback.create.mock.calls[0]![0]
    expect(request.title).toBe(transition === 'recurring' ? locale === 'en' ? 'Read' : 'Ler' : title)
    if (transition === 'recurring') expect(request).toMatchObject({ frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], startDate: '2026-10-20' })
    else {
      expect(request.isGeneral ?? false).toBe(transition === 'general')
      expect(request.frequencyUnit).toBeUndefined()
      expect(request.frequencyQuantity).toBeUndefined()
      expect(request.days ?? []).toEqual([])
      if (transition !== 'general') expect(request.dueDate).toBe('2026-10-20')
    }
    expect(dateRequests.request).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  if (owner === 'create') it('defaults to Task and saves without a type-selection step', async () => {
    await mount(null)
    expect(tree.root.findByType(HabitFormFields).props.formHelpers.form.getValues('itemType')).toBe('task')
    await submit()
    expect(mutation()).toHaveBeenCalledOnce()
    expect(captions('habits.form.typeRequired')).toHaveLength(0)
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  it('retains failed saves with the owning create error or edit uncertainty', async () => {
    mutation().mockRejectedValueOnce(new Error('save failed'))
    await mount('task')
    await submit()
    if (owner === 'create') {
      expect(modalFeedback.showError).toHaveBeenCalledOnce()
      expect(modalFeedback.showError).toHaveBeenCalledWith('errors.createHabit')
    } else {
      expect(tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Text' && node.props.children === 'habits.form.saveUncertain')).toHaveLength(1)
      expect(modalFeedback.showError).not.toHaveBeenCalled()
    }
    expect(mutation()).toHaveBeenCalledOnce()
    expect(closed).not.toHaveBeenCalled()
    expect(input('habits.form.describe').props.value).toBe('Read')
  })
})

afterEach(() => { formLocale.realController = false; connection.isOnline = true })

describe('native automatic date field', () => {
  let tree: ReturnType<typeof TestRenderer.create>
  let helpers: HabitFormHelpers
  beforeEach(async () => {
    const { useWatch } = await vi.importActual<typeof import('react-hook-form')>('react-hook-form')
    useWatchMock.mockImplementation(useWatch)
    dateRequests.request.mockReset().mockResolvedValue({ date: '2026-10-26', referenceDate: '2026-10-20' })
    mockProfileState.aiMessagesUsed = 0
    mockProfileState.timeZone = 'UTC'
    formLocale.realDates = true
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  })
  afterEach(async () => { await TestRenderer.act(() => tree?.unmount()); vi.useRealTimers(); formLocale.realDates = false; formLocale.language = 'en' })
  function OwningForm({ dueDate = '2026-10-20' }: { dueDate?: string }) {
    helpers = useHabitForm({ initialData: { itemType: 'task', title: 'Read', dueDate } })
    return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />
  }
  async function mount(dueDate?: string) { await TestRenderer.act(() => { tree = TestRenderer.create(<OwningForm dueDate={dueDate} />) }) }
  const input = () => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput' && node.props.accessibilityLabel === 'habits.form.datePhrase')[0]!
  const phrase = (value: string) => TestRenderer.act(() => input().props.onChangeText(value))
  const debounce = () => TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(700) })
  const status = (label: string) => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'View' && matchesFormLabel(node.props.accessibilityLabel, label))
  const picker = () => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && String(node.props.accessibilityLabel).startsWith('habits.form.taskDate,'))[0]!

  it.each(['en', 'pt-BR'])('interprets non-local wording when the profile arrives after typing in %s', async (locale) => {
    formLocale.language = locale
    mockProfileState.timeZone = undefined
    await mount('')
    const wording = locale === 'en' ? 'next holiday' : 'no próximo feriado'
    await phrase(wording)
    await debounce()
    expect(helpers.form.getValues('dueDate')).toBe('')
    expect(dateRequests.request).not.toHaveBeenCalled()
    expect(helpers.form.getValues('dateIssue')).toBe('habits.form.datePhraseUnresolved')
    expect(input().props.accessibilityHint).toContain('habits.form.datePhraseUnresolved')
    mockProfileState.timeZone = 'UTC'
    await TestRenderer.act(() => tree.update(<OwningForm dueDate="" />))
    await debounce()
    await debounce()
    expect(dateRequests.request).toHaveBeenCalledOnce()
    expect(dateRequests.request).toHaveBeenCalledWith(expect.objectContaining({ phrase: wording, language: locale }))
    expect(picker().props.accessibilityLabel).toContain(formatLocaleDate('2026-10-26', locale))
    expect(helpers.form.getValues()).toMatchObject({ dueDate: '2026-10-26', datePhrase: wording, dateIssue: '' })
    await TestRenderer.act(() => { expect(helpers.validateAll()).toBeNull() })
    expect(input().props.accessibilityHint ?? '').not.toContain('habits.form.datePhraseUnresolved')
    expect(input().props.accessibilityHint ?? '').not.toContain('habits.form.dateStale')
    expect(status('habits.form.dateInterpreted')).toHaveLength(1)
  })

  it.each(['en', 'pt-BR'])('retains the phrase date when the profile arrives after typing in %s', async (locale) => {
    formLocale.language = locale
    mockProfileState.timeZone = undefined
    vi.setSystemTime(new Date('2026-09-04T12:00:00Z'))
    await mount('')
    await phrase(locale === 'en' ? 'on the 26th' : 'dia 26')
    expect(helpers.form.getValues('dueDate')).toBe('')
    mockProfileState.timeZone = 'UTC'
    await TestRenderer.act(() => tree.update(<OwningForm dueDate="" />))
    await debounce()
    expect(picker().props.accessibilityLabel).toContain(formatLocaleDate('2026-09-26', locale))
    expect(helpers.form.getValues()).toMatchObject({ dueDate: '2026-09-26', dateIssue: '' })
    await TestRenderer.act(() => { expect(helpers.validateAll()).toBeNull() })
    expect(dateRequests.request).not.toHaveBeenCalled()
    expect(status('habits.form.dateInterpreted')).toHaveLength(0)
  })

  it.each(['en', 'pt-BR'])('fills the date with a muted in-field glyph and permits manual editing in %s', async (locale) => {
    formLocale.language = locale
    let finish!: (reply: { date: string; referenceDate: string }) => void
    dateRequests.request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await mount()
    await phrase(locale === 'en' ? 'next holiday' : 'no próximo feriado')
    await debounce()
    const pending = status('habits.form.dateInterpreting')[0]!
    expect(pending.props.accessibilityState.busy).toBe(true)
    expect(pending.findByType(AstraGlyph).props).toMatchObject({ size: 16, color: createTokensV2('orange', formLocale.theme).fg3 })
    const control = tree.root.findAll((node: UnderstandingTestNode) => node.type === 'View' && node.props.testID === 'input-control' && node.findAll(child => child === pending).length > 0)[0]!
    expect(control.findAll((child: UnderstandingTestNode) => child === input())).toHaveLength(1)
    expect(StyleSheet.flatten(input().props.style).paddingRight).toBe(48)
    await TestRenderer.act(() => finish({ date: '2026-10-26', referenceDate: '2026-10-20' }))
    expect(status('habits.form.dateInterpreted')).toHaveLength(1)
    expect(picker().props.accessibilityLabel).toContain(formatLocaleDate('2026-10-26', locale))
    await TestRenderer.act(() => { expect(helpers.validateAll()).toBeNull() })
    const values = habitFormSchema.parse(helpers.form.getValues())
    expect(buildCreateHabitRequest(values, [], [], [], [])).toMatchObject({ dueDate: '2026-10-26' })
    expect(buildUpdateHabitRequest(values, true, '', [], [])).toMatchObject({ dueDate: '2026-10-26' })
    await TestRenderer.act(() => picker().props.onPress())
    const dayLabel = formatLocaleDate('2026-10-27', locale, { month: 'long', day: 'numeric', year: 'numeric' })
    await TestRenderer.act(() => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityLabel === dayLabel)[0]!.props.onPress())
    expect(helpers.form.getValues()).toMatchObject({ dueDate: '2026-10-27', datePhrase: '', dateIssue: '' })
    expect(status('habits.form.dateInterpreted')).toHaveLength(0)
  })

  it.each(['segunda', 'segunda-feira', 'seg', 'próxima segunda', 'monday', 'mon', 'next monday'])('takes the next Monday for %s offline on Monday', async (wording) => {
    vi.setSystemTime(new Date('2026-10-26T12:00:00Z'))
    connection.isOnline = false
    await mount()
    await phrase(wording)
    expect(helpers.form.getValues()).toMatchObject({ dueDate: '2026-11-02', dateIssue: '' })
    expect(picker().props.accessibilityLabel).toContain(formatLocaleDate('2026-11-02', 'en'))
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each([[false, 0], [true, 5]] as const)('retains manual recovery when online=%s and used=%s', async (online, used) => {
    connection.isOnline = online
    mockProfileState.aiMessagesUsed = used
    await mount()
    await phrase('next holiday')
    await debounce()
    expect(helpers.form.getValues('dateIssue')).toBe('habits.form.datePhraseUnresolved')
    expect(picker().props.disabled).toBe(false)
    expect(dateRequests.request).not.toHaveBeenCalled()
    await phrase('amanhã')
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-21')
    await phrase('dia 3')
    expect(helpers.form.getValues('dueDate')).toBe('2026-11-03')
  })

  it('debounces wording and rejects a cancelled response after typing a local date', async () => {
    let finish!: (reply: { date: string; referenceDate: string }) => void
    dateRequests.request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await mount()
    await phrase('next')
    await TestRenderer.act(async () => { await vi.advanceTimersByTimeAsync(699) })
    await phrase('next holiday')
    await debounce()
    expect(dateRequests.request).toHaveBeenCalledOnce()
    const signal = dateRequests.request.mock.calls[0]![0].signal as AbortSignal
    await phrase('tomorrow')
    expect(signal.aborted).toBe(true)
    await TestRenderer.act(() => finish({ date: '2026-10-26', referenceDate: '2026-10-20' }))
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-21')
    expect(status('habits.form.dateInterpreted')).toHaveLength(0)
  })
})


it.each([
  { itemType: 'task' },
  { itemType: 'habit', frequencyUnit: 'Week', frequencyQuantity: 1 },
  { itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 2 },
  { itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'] },
  { itemType: 'habit', isGeneral: true },
])('offers and saves Repeat every from the native timing sheet for %j', (schedule) => {
  formLocale.realController = false
  useWatchMock.mockImplementation(({ control, name }: { control: { values: Record<string, unknown> }; name: string }) => control.values[name])
  const helpers = createFormHelpers({ title: 'Water', reminderEnabled: true, dueTime: '08:00', ...schedule })
  helpers.isGeneral = 'isGeneral' in schedule
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[15]} onReminderTimesChange={vi.fn()} />) })
  openTiming(tree)
  const radio = tree!.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'habits.form.repeatEvery')[0]!
  TestRenderer.act(() => radio.props.onPress())
  expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [15], [], [], [])).toMatchObject({ repeatReminder: { intervalMinutes: 30, startAtUtc: expect.stringMatching(/Z$/) }, reminderEnabled: true, reminderTimes: [], scheduledReminders: [], relativeReminders: [] })
})

it('explains both native types and exposes frequency before opening details', () => {
  formLocale.realController = false
  useWatchMock.mockImplementation(({ control, name }: { control: { values: Record<string, unknown> }; name: string }) => control.values[name])
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<HabitFormFields formHelpers={createFormHelpers({ itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1 })} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />) })
  expect(tree!.root.findAllByProps({ description: 'habits.form.typeTaskHint' }).length).toBeGreaterThan(0)
  expect(tree!.root.findAllByProps({ description: 'habits.form.typeHabitHint' }).length).toBeGreaterThan(0)
  expect(tree!.root.findAllByProps({ accessibilityLabel: 'habits.form.frequency' }).length).toBeGreaterThan(0)
  expect(tree!.root.findByType(HabitScheduleFields).props.general).toBe(false)
})

it('keeps native Task copy, a compact description and conditional end time through the owning form', async () => {
  const { useWatch } = await vi.importActual<typeof import('react-hook-form')>('react-hook-form')
  useWatchMock.mockImplementation(useWatch)
  formLocale.realController = true
  function OwningForm() {
    const helpers = useHabitForm()
    return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onUpgrade={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />
  }
  let tree!: ReturnType<typeof TestRenderer.create>
  await TestRenderer.act(() => { tree = TestRenderer.create(<QueryClientProvider client={new QueryClient()}><OwningForm /></QueryClientProvider>) })
  const inputs = () => tree.root.findAll((node: UnderstandingTestNode) => node.type === 'TextInput')
  expect(inputs()[0]!.props.accessibilityLabel).toBe('habits.form.taskDescribe')
  const description = inputs().find((node: UnderstandingTestNode) => node.props.accessibilityLabel === 'habits.form.description')!
  expect(StyleSheet.flatten(description.props.style).minHeight).toBe(54)
  expect(description.props.scrollEnabled).toBe(false)
  expect(tree.root.findByType(HabitScheduleFields).props.hidden).toBe(true)
  const habit = tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && matchesFormLabel(node.props.accessibilityLabel, 'habits.form.typeHabit'))[0]!
  await TestRenderer.act(() => habit.props.onPress())
  expect(inputs()[0]!.props.accessibilityLabel).toBe('habits.form.describe')
  expect(tree.root.findByType(HabitScheduleFields).props.hidden).toBe(false)
  openTiming(tree)
  expect(tree.root.findAllByProps({ label: 'habits.form.dueEndTime' })).toHaveLength(0)
  const exactTime = tree.root.findAllByType('TimeField').find((node: { props: { label: string } }) => node.props.label === 'habits.form.exactTime')!
  await TestRenderer.act(() => exactTime.props.onChange('08:00'))
  expect(tree.root.findAllByType('TimeField').some((node: { props: { label: string } }) => node.props.label === 'habits.form.dueEndTime')).toBe(true)
})


it('preserves native fixed reminder choices when their selected radio is pressed again', () => {
  const onChange = vi.fn()
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<RepeatReminderSection value={null} enabled general={false} onToggle={vi.fn()} onChange={onChange} />) })
  const radio = tree.root.findAll((node: UnderstandingTestNode) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'habits.form.definedTimes')[0]!
  TestRenderer.act(() => radio.props.onPress())
  expect(onChange).not.toHaveBeenCalled()
})
