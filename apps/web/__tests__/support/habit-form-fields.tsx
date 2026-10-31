import userEvent from '@testing-library/user-event'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { appConfigSchema } from '@orbit/shared/types/config'
import { createMockConfigResponse, createMockHabit } from '@orbit/shared/__tests__/factories'
import React from 'react'
import type { HabitTag } from '@orbit/shared/types/habit'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { buildHabitFormPatchFromSuggestion } from '@orbit/shared/utils'
import type { HabitFormProposal } from '@orbit/shared/utils'
import { type HabitFormHelpers } from '@/hooks/use-habit-form'
import { type TagSelectionState } from '@/hooks/use-tag-selection'

const tagCollection = vi.hoisted(() => ({ tags: [] as HabitTag[] }))

const tagMutations = vi.hoisted(() => ({ create: vi.fn(), suggest: vi.fn(), delete: vi.fn() }))

const formLocale = vi.hoisted(() => ({ language: 'en', realReminders: false, realDates: false, realDateCopy: false, realController: false }))

const mockProfileState = vi.hoisted(() => ({ aiMessagesUsed: 0, hasProAccess: false, timeZone: 'UTC' as string | null | undefined }))

const mockRouterPush = vi.hoisted(() => vi.fn())

const modalFeedback = vi.hoisted(() => ({ showError: vi.fn(), create: vi.fn(), update: vi.fn() }))

const setupPatch = buildHabitFormPatchFromSuggestion({ emoji: null, frequencyUnit: 'Week', frequencyQuantity: 3, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] })

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
}
})

vi.mock('next-intl', () => ({
  useTranslations: () => translateTestValue,
  useLocale: () => formLocale.language,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }))

const dateRequests = vi.hoisted(() => ({ request: vi.fn() }))

const connection = vi.hoisted(() => ({ isOnline: true }))

vi.mock('@/hooks/use-date-interpretation', () => ({ useDateInterpretation: () => ({ mutateAsync: dateRequests.request }) }))

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => connection }))

vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({ config: appConfigSchema.parse(createMockConfigResponse({ sub_habits: { enabled: true, planRequirement: 'Pro' } })) }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => mockProfileState.hasProAccess,
  useProfile: () => ({ profile: { uses24HourClock: true, timeZone: mockProfileState.timeZone, hasProAccess: mockProfileState.hasProAccess, aiMessagesUsed: mockProfileState.aiMessagesUsed, aiMessagesLimit: 5 } }),
}))

vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: modalFeedback.showError }) }))

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
  useTags: () => ({ tags: tagCollection.tags }),
  useCreateTag: () => ({ isPending: false, mutateAsync: tagMutations.create }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteTag: () => ({ isPending: false, mutateAsync: tagMutations.delete }),
}))

vi.mock('@/components/habits/habit-checklist', () => ({
  HabitChecklist: ({ onItemsChange, proposedItemCount }: { onItemsChange?: (items: Array<{ text: string; isChecked: boolean }>) => void; proposedItemCount?: number }) => (
    <button data-proposed-item-count={proposedItemCount} type="button" onClick={() => onItemsChange?.([{ text: 'Edited', isChecked: false }])}>checklist-editor</button>
  ),
}))

vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => <div>checklist-templates</div> }))

vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => <div>goal-linking</div> }))

vi.mock('@/components/habits/habit-form-fields/reminder-section', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/habits/habit-form-fields/reminder-section')>()
  return { ReminderSection: (props: React.ComponentProps<typeof actual.ReminderSection>) => formLocale.realReminders ? <actual.ReminderSection {...props} /> : <div>offset-reminders{props.children}</div> }
})

vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, onToggle: () => void) => ({ toggleReminder: onToggle, showNotice: false }) }))

vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: (props: { onSetScheduledReminders: (items: { when: string; time: string }[]) => void; nested?: boolean; offsetReminderCount?: number }) => <button type="button" data-nested={String(props.nested)} data-offset-count={props.offsetReminderCount} onClick={() => props.onSetScheduledReminders([{ when: 'day_before', time: '18:00' }])}>scheduled-reminders</button> }))

vi.mock('@/components/habits/habit-form-fields/slip-alert-section', () => ({ SlipAlertSection: () => <div>slip-alert</div> }))

vi.mock('@/components/ui/date-field', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/date-field')>()
  return { DateField: (props: React.ComponentProps<typeof actual.DateField>) => formLocale.realDates ? <actual.DateField {...props} /> : <div>date-field</div> }
})

type TestHabitFormHelpers = HabitFormHelpers & { testValues: Record<string, unknown> }

function createFormHelpers(overrides: Record<string, unknown> = {}): TestHabitFormHelpers {
  const values: Record<string, unknown> = {
    title: '', emoji: '', frequencyUnit: null, frequencyQuantity: null, days: [],
    isFlexible: false, dueDate: '2026-09-02', dueTime: '', dueEndTime: '', endDate: '',
    description: '', reminderEnabled: false, scheduledReminders: [], checklistItems: [],
    isBadHabit: false, slipAlertEnabled: false, ...overrides,
  }
  return {
    form: {
      control: {}, register: vi.fn(), clearErrors: vi.fn(), resetField: vi.fn(),
      watch: vi.fn((field: string) => values[field]),
      getValues: vi.fn((field?: string) => field ? values[field] : values),
      setValue: vi.fn((field: string, value: unknown) => { values[field] = value }),
      formState: { errors: {} },
    } as unknown as HabitFormHelpers['form'],
    isOneTime: true, isGeneral: false, isFlexible: false, isRecurring: false,
    showDayPicker: false, showEndDate: true,
    daysList: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((value) => ({ value, label: value.slice(0, 3), accessibleLabel: value })),
    chooseItemType: vi.fn(), validationFocusRequest: 0, registerDateValidation: () => () => {}, resetModeDrafts: vi.fn(),
    backendFieldErrors: {}, backendFocusRequest: 0, backendFocusField: undefined, reportBackendErrors: vi.fn(() => false), clearBackendErrors: vi.fn(),
    frequencyUnits: [], setOneTime: vi.fn(), setRecurring: vi.fn(), setFlexible: vi.fn(),
    setGeneral: vi.fn(), toggleDay: vi.fn(), formatTimeInput: vi.fn(),
    formatEndTimeInput: vi.fn(), validateAll: vi.fn(() => null),
    testValues: values,
  }
}

function createTags(): TagSelectionState {
  return {
    selectedTagIds: [], atTagLimit: false, tagValidationErrorKey: null, toggleTag: vi.fn(),
    resetTags: vi.fn(), showNewTag: false, setShowNewTag: vi.fn(), newTagName: '',
    setNewTagName: vi.fn(), newTagColor: '#C4530F', setNewTagColor: vi.fn(), tagColors: [],
    createAndSelectTag: vi.fn(), acceptSuggestedTag: vi.fn(), editingTagId: null,
    editTagName: '', setEditTagName: vi.fn(), editTagColor: '#C4530F',
    setEditTagColor: vi.fn(), startEditTag: vi.fn(), saveEditTag: vi.fn(),
    cancelEditTag: vi.fn(), deleteTag: vi.fn(),
  }
}

function renderForm(
  formHelpers = createFormHelpers(),
  onSuggestSetup?: () => HabitFormProposal | Promise<HabitFormProposal>,
  defaultExpanded = false,
  readPhraseLocally = false,
  lockedGeneral: boolean | null = null,
  onResolveSubHabitProposalReady?: (resolve: () => void) => void,
  emojiOptions: Pick<React.ComponentProps<typeof HabitFormFields>, 'onSuggestEmoji' | 'isEmojiSuggesting' | 'emojiSuggestionError'> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const buildForm = (isSuggesting = false) => (
    <QueryClientProvider client={queryClient}>
      <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={onSuggestSetup} isSuggesting={isSuggesting} defaultExpanded={defaultExpanded} readPhraseLocally={readPhraseLocally} lockedGeneral={lockedGeneral} onResolveSubHabitProposalReady={onResolveSubHabitProposalReady} {...emojiOptions}>
        <div>sub-habit-editor</div>
      </HabitFormFields>
    </QueryClientProvider>
  )
  const view = render(buildForm())
  return { ...view, rerenderForm: (isSuggesting = false) => view.rerender(buildForm(isSuggesting)) }
}

afterEach(() => { formLocale.realController = false; connection.isOnline = true })

export { tagCollection, tagMutations, formLocale, mockProfileState, mockRouterPush, modalFeedback, setupPatch, SETUP_PROPOSAL, CHECKLIST_PROPOSAL, SUB_HABIT_PROPOSAL, COMBINED_PROPOSAL, dateRequests, connection, createFormHelpers, createTags, renderForm }

export function setupHabitModalSubmit(owner: 'create' | 'edit') {
  const closed = vi.fn()

  const originalTimeZone = process.env.TZ

  beforeEach(() => {
    process.env.TZ = 'UTC'
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
    mockProfileState.timeZone = 'UTC'
    if (originalTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimeZone
    formLocale.realDates = false
    formLocale.realDateCopy = false
    formLocale.language = 'en'
  })

  const phraseInput = () => screen.getByRole('textbox', { name: 'habits.form.datePhrase' })

  const submitButton = () => screen.getByRole('button', { name: owner === 'create' ? /habits.create(?:Habit|Task)/ : 'common.save' })

  const mutation = () => owner === 'create' ? modalFeedback.create : modalFeedback.update

  async function mount(type: 'task' | 'habit' | null, initialDate?: string) {
    const habit = createMockHabit({ title: 'Read', frequencyUnit: type === 'habit' ? 'Day' : null, dueDate: '2026-10-20', startDate: '2026-10-20' })
    const client = new QueryClient()
    const modal = () => <QueryClientProvider client={client}>{owner === 'create'
      ? <CreateHabitModal open onOpenChange={closed} initialTitle="Read" initialDate={initialDate} />
      : <EditHabitModal open onOpenChange={closed} habit={habit} />}</QueryClientProvider>
    const view = render(modal())
    await waitFor(() => expect(screen.getByRole('textbox', { name: /habits.form.(?:taskDescribe|describe)/ })).toHaveValue('Read'))
    const dialog = screen.getByRole('dialog', { name: owner === 'create' ? 'habits.form.newTask' : type === 'habit' ? 'habits.editHabit' : 'habits.editTask' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'common.close' })).toHaveFocus())
    if (type) fireEvent.click(screen.getByRole('radio', { name: type === 'task' ? /^habits.form.typeTask/ : /^habits.form.typeHabit/ }))
    if (owner === 'create') {
      expect(screen.getByRole('dialog', { name: type === 'habit' ? 'habits.form.newHabit' : 'habits.form.newTask' })).toBeInTheDocument()
      expect(submitButton()).toHaveTextContent(type === 'habit' ? 'habits.createHabit' : 'habits.createTask')
    }
    return { refresh: () => view.rerender(modal()) }
  }

  async function submit(method = 'click') {
    const user = userEvent.setup()
    if (method === 'form') await act(async () => { fireEvent.submit(phraseInput().closest('form')!) })
    else if (method === 'Enter') {
      phraseInput().focus()
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      if (fireEvent(phraseInput(), enter)) phraseInput().closest('form')!.requestSubmit(submitButton() as HTMLButtonElement)
    }
    else await user.click(submitButton())
  }

  return { closed, phraseInput, submitButton, mutation, mount, submit }
}
