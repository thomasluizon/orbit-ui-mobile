import React from 'react'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import type { HabitTag } from '@orbit/shared/types/habit'
import userEvent from '@testing-library/user-event'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { habitFormSchema } from '@orbit/shared/validation'
import { buildCreateHabitRequest, buildUpdateHabitRequest, buildHabitFormPatchFromSuggestion } from '@orbit/shared/utils'
import { applySuggestionSchedule } from '@/components/habits/create-habit-modal/apply-suggestion'
import type { HabitFormProposal } from '@orbit/shared/utils'
import { useHabitForm, type HabitFormHelpers } from '@/hooks/use-habit-form'
import { useTagSelection, type TagSelectionState } from '@/hooks/use-tag-selection'

const tagCollection = vi.hoisted(() => ({ tags: [] as HabitTag[] }))
const tagMutations = vi.hoisted(() => ({ create: vi.fn(), suggest: vi.fn(), delete: vi.fn() }))
const formLocale = vi.hoisted(() => ({ language: 'en', realReminders: false }))
const mockProfileState = vi.hoisted(() => ({ aiMessagesUsed: 0, hasProAccess: false }))
const mockRouterPush = vi.hoisted(() => vi.fn())
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
  const template = key === 'habits.form.startDateValue' ? messages.habits.form.startDateValue
    : key === 'habits.form.habitTypeAvoidHint' ? messages.habits.form.habitTypeAvoidHint : testTranslations[key]
  if (!template) return values ? `${key}:${JSON.stringify(values)}` : key
  return Object.entries(values ?? {}).reduce(
    (message, [name, value]) => message.replace(`{${name}}`, String(value)),
    template,
  )
}

vi.mock('react-hook-form', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-hook-form')>(),
  useController: () => ({ field: { ref: vi.fn() } }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => translateTestValue,
  useLocale: () => formLocale.language,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }))
vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({ config: { features: { 'habits.subHabits': { enabled: true, planRequirement: 'Pro' } } } }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => mockProfileState.hasProAccess,
  useProfile: () => ({ profile: { uses24HourClock: true, timeZone: 'UTC', hasProAccess: mockProfileState.hasProAccess, aiMessagesUsed: mockProfileState.aiMessagesUsed, aiMessagesLimit: 5 } }),
}))

vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/hooks/use-tags', () => ({
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
vi.mock('@/components/ui/date-field', () => ({ DateField: () => <div>date-field</div> }))

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
      watch: vi.fn((field: string) => values[field]),
      getValues: vi.fn((field: string) => values[field]),
      setValue: vi.fn((field: string, value: unknown) => { values[field] = value }),
      formState: { errors: {} },
    } as unknown as HabitFormHelpers['form'],
    isOneTime: true, isGeneral: false, isFlexible: false, isRecurring: false,
    showDayPicker: false, showEndDate: true,
    daysList: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((value) => ({ value, label: value.slice(0, 3), accessibleLabel: value })),
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

describe('HabitFormFields', () => {
  it.each(['', '   ', 'Swim'])('reaches the emoji action without replacing setup for title %j', async (title) => {
    const onSuggestEmoji = vi.fn().mockResolvedValue(SETUP_PROPOSAL)
    renderForm(createFormHelpers({ title }), undefined, false, false, null, undefined, { onSuggestEmoji })
    const button = screen.getByRole('button', { name: 'habits.form.emojiSuggest' })
    expect(button.hasAttribute('disabled')).toBe(!title.trim())
    if (title.trim()) {
      const user = userEvent.setup()
      await user.tab()
      await user.tab()
      await user.tab()
      expect(button).toHaveFocus()
      await user.keyboard('{Enter}')
    } else fireEvent.click(button)
    await waitFor(() => expect(onSuggestEmoji).toHaveBeenCalledTimes(title.trim() ? 1 : 0))
    if (!title.trim()) expect(button).toHaveAccessibleDescription('habits.form.titleRequired')
  })

  it.each([false, true])('preserves the emoji action through pending and success after moving focus: %j', async (moveFocus) => {
    let complete!: (proposal: HabitFormProposal) => void
    const pending = new Promise<HabitFormProposal>((resolve) => { complete = resolve })
    const onSuggestEmoji = vi.fn(() => pending)
    const emojiOptions = { onSuggestEmoji, isEmojiSuggesting: false }
    const view = renderForm(createFormHelpers({ title: 'Swim', frequencyUnit: 'Day', frequencyQuantity: 1 }), undefined, false, false, null, undefined, emojiOptions)
    const user = userEvent.setup()
    const button = screen.getByRole('button', { name: 'habits.form.emojiSuggest' })
    button.focus()
    await user.keyboard('{Enter}')
    emojiOptions.isEmojiSuggesting = true
    view.rerenderForm(true)
    const busy = screen.getByRole('button', { name: 'habits.form.emojiSuggesting' })
    expect(busy).toBe(button)
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy).not.toBeDisabled()
    expect(busy).toHaveAttribute('aria-disabled', 'true')
    await user.keyboard('{Enter} ')
    fireEvent.click(busy)
    expect(onSuggestEmoji).toHaveBeenCalledOnce()
    const phrase = screen.getByRole('textbox', { name: 'habits.form.describe' })
    if (moveFocus) await user.click(phrase)
    await act(async () => { complete(SETUP_PROPOSAL); await pending })
    emojiOptions.isEmojiSuggesting = false
    view.rerenderForm()
    expect(screen.getByRole('button', { name: 'habits.form.emojiSuggest' })).toBe(button)
    expect(button.closest('[data-proposed]')).toBeInTheDocument()
    expect(moveFocus ? phrase : button).toHaveFocus()
  })

  it('keeps the emoji request visible and busy while blocking competing emoji edits', () => {
    const onSuggestEmoji = vi.fn()
    renderForm(createFormHelpers({ title: 'Swim', frequencyUnit: 'Day', frequencyQuantity: 1 }), undefined, false, false, null, undefined, { onSuggestEmoji, isEmojiSuggesting: true })
    const button = screen.getByRole('button', { name: 'habits.form.emojiSuggesting' })
    expect(button).not.toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeDisabled()
    fireEvent.click(button)
    expect(onSuggestEmoji).not.toHaveBeenCalled()
  })

  it('explains the emoji allowance boundary and keeps request failures inline', () => {
    mockProfileState.aiMessagesUsed = 5
    const emojiOptions = { onSuggestEmoji: vi.fn(), emojiSuggestionError: undefined as string | undefined }
    const view = renderForm(createFormHelpers({ title: 'Swim' }), undefined, false, false, null, undefined, emojiOptions)
    const alert = screen.getByRole('alert')
    expect(alert).toBeEmptyDOMElement()
    emojiOptions.emojiSuggestionError = 'Try again'
    view.rerenderForm()
    expect(screen.getByRole('alert')).toBe(alert)
    const button = screen.getByRole('button', { name: 'habits.form.emojiSuggest' })
    expect(button).toBeDisabled()
    expect(button.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByRole('alert')).toHaveTextContent('Try again')
    expect(button).toHaveAccessibleDescription(expect.stringContaining('Try again'))
  })

  it('announces the details state and identifies the reminders region across toggles', () => {
    renderForm()
    const disclosure = screen.getByRole('button', { name: 'habits.form.moreDetails' })
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    expect(disclosure).not.toHaveAttribute('aria-controls')

    fireEvent.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    const regionId = disclosure.getAttribute('aria-controls')
    expect(regionId).toBeTruthy()
    const region = document.getElementById(regionId!)!
    expect(region).toBeInTheDocument()
    expect(within(region).getByRole('heading', { name: 'habits.form.reminders' })).toBeInTheDocument()

    fireEvent.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    expect(disclosure).toHaveAttribute('aria-controls', regionId)
    expect(region).toHaveAttribute('inert')

    const transitionEnd = new Event('transitionend', { bubbles: true })
    Object.defineProperty(transitionEnd, 'propertyName', { value: 'opacity' })
    fireEvent(region, transitionEnd)
    expect(region).not.toBeInTheDocument()
    expect(disclosure).not.toHaveAttribute('aria-controls')

    fireEvent.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(disclosure).toHaveAttribute('aria-controls', regionId)
    expect(document.getElementById(regionId!)).toBeInTheDocument()
  })

  it('keeps the timed reminder toggle label distinct from its section heading', () => {
    formLocale.realReminders = true
    renderForm(createFormHelpers({ dueTime: '08:00' }), undefined, true)
    expect(screen.getAllByText('habits.form.reminders')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'habits.form.reminders' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'habits.form.reminder' })).toBeInTheDocument()
  })

  it('shows one unresolved reading before corrections and the Astra ask, without an understood card', () => {
    renderForm(createFormHelpers({ title: 'Beber mais água quando der' }), vi.fn(), false, true)
    expect(screen.getAllByText('habits.form.unresolved')).toHaveLength(1)
    expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Monday' })).toBeEnabled()
    const unresolved = screen.getByText('habits.form.unresolved')
    const corrections = screen.getByRole('button', { name: 'Monday' })
    const ask = screen.getByRole('button', { name: 'habits.form.askAstra' })
    expect(unresolved.compareDocumentPosition(corrections) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(corrections.compareDocumentPosition(ask) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each([false, true])('selects and clears an emoji inside the preview, schedule locked: %s', async (lockedGeneral) => {
    const formHelpers = createFormHelpers({ title: 'Run every day', frequencyUnit: 'Day', frequencyQuantity: 1 })
    const view = renderForm(formHelpers, undefined, false, false, lockedGeneral)
    expect(screen.getByRole('region', { name: 'habits.form.understood' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
    fireEvent.click(screen.getByRole('option', { name: 'habits.form.emoji: 🏃' }))
    await waitFor(() => expect(formHelpers.form.setValue).toHaveBeenCalledWith('emoji', '🏃', { shouldDirty: true }))
    view.rerenderForm()
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toHaveTextContent('🏃')
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiRemove' }))
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('emoji', '', { shouldDirty: true })
  })

  it.each(['', '   '])('hides the preview and emoji well for an empty phrase %j even with a saved schedule', (title) => {
    renderForm(createFormHelpers({ title, emoji: '🏃', frequencyUnit: 'Day', frequencyQuantity: 1 }))
    expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeNull()
  })

  it('hides the preview and emoji well while Astra reads a phrase with an existing schedule', () => {
    const view = renderForm(createFormHelpers({ title: 'Run every day', frequencyUnit: 'Day', frequencyQuantity: 1 }))
    view.rerenderForm(true)
    expect(screen.queryByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
  })

  it('shows no emoji well in a fresh empty form', () => {
    renderForm()
    expect(screen.queryByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeNull()
  })

  it('keeps a chosen emoji through clearing, parsing and losing the understood schedule', async () => {
    let formHelpers!: HabitFormHelpers
    function CreateFormHarness({ isSuggesting = false }: { isSuggesting?: boolean }) {
      formHelpers = useHabitForm()
      return <HabitFormFields formHelpers={formHelpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} isSuggesting={isSuggesting} readPhraseLocally />
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const buildForm = (isSuggesting = false) => <QueryClientProvider client={queryClient}><CreateFormHarness isSuggesting={isSuggesting} /></QueryClientProvider>
    const view = render(buildForm())
    expect(screen.queryByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Run every day' } })
    await waitFor(() => expect(screen.getByRole('region', { name: 'habits.form.understood' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
    fireEvent.click(screen.getByRole('option', { name: 'habits.form.emoji: 🌱' }))
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toHaveTextContent('🌱')

    const expectHidden = () => {
      expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeNull()
      expect(formHelpers.form.getValues('emoji')).toBe('🌱')
    }
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
    expectHidden()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Run every day' } })
    view.rerender(buildForm(true))
    expectHidden()
    view.rerender(buildForm())
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toHaveTextContent('🌱')

    act(() => formHelpers.form.setValue('frequencyUnit', null))
    expectHidden()
    act(() => formHelpers.form.setValue('frequencyUnit', 'Day'))
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toHaveTextContent('🌱')
  })

  it('places the details row on the padded column edge', () => {
    renderForm()
    expect(screen.getByRole('button', { name: 'habits.form.moreDetails' })).toHaveStyle({ minHeight: 'var(--row-h-compact)', position: 'relative', paddingBlock: '12px' })
  })

  it.each([
    ['en', 'Starts on September 2'],
    ['pt-BR', 'Começa em 2 de setembro'],
  ])('renders a word start date in %s', (locale, expected) => {
    formLocale.language = locale
    renderForm()
    expect(screen.getByText(expected)).toBeDefined()
  })

  it.each([
    ['en', 'A habit you want to avoid. Log each slip.'],
    ['pt-BR', 'Um hábito que você quer evitar. Registre cada deslize.'],
  ])('defines avoidance and explains slip logging in %s', (locale, expected) => {
    formLocale.language = locale
    renderForm(createFormHelpers({ isBadHabit: true }), undefined, true)
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    formLocale.language = 'en'
    formLocale.realReminders = false
    mockProfileState.aiMessagesUsed = 0
    mockProfileState.hasProAccess = false
  })

  it('starts with one phrase field, closed details, and an immutable start date', () => {
    renderForm()
    expect(screen.getByLabelText('habits.form.describe')).toBeDefined()
    expect(screen.getByRole('button', { name: 'habits.form.moreDetails' })).toBeDefined()
    expect(screen.queryByText('habits.form.oneTimeTask')).toBeNull()
    expect(screen.queryByText('habits.form.recurring')).toBeNull()
    expect(screen.queryByText('habits.form.flexible')).toBeNull()
    expect(screen.queryByText('habits.form.general')).toBeNull()
    expect(screen.getByText('habits.form.startDate')).toBeDefined()
    expect(screen.queryByText('checklist-editor')).toBeNull()
  })

  it('shows the understanding preview and applies correction controls', () => {
    const formHelpers = createFormHelpers({ title: 'Run', frequencyUnit: 'Week', frequencyQuantity: 3, isFlexible: true })
    const view = renderForm(formHelpers)
    expect(screen.getByLabelText('habits.form.understood')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.setRecurring).toHaveBeenCalledOnce()
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', false)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreOften' }))
    expect(formHelpers.setFlexible).toHaveBeenCalledOnce()
    view.unmount()

    const flexibleHelpers = createFormHelpers({ title: 'Run', frequencyQuantity: 3, isFlexible: true })
    renderForm(flexibleHelpers)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreOften' }))
    expect(flexibleHelpers.setFlexible).toHaveBeenCalledOnce()
    expect(flexibleHelpers.form.setValue).toHaveBeenCalledWith('frequencyQuantity', 4, { shouldDirty: true })
  })

  it('uses the localized full weekday name for the correction control', () => {
    const formHelpers = createFormHelpers({ title: 'Correr' })
    formHelpers.daysList[0] = {
      value: 'Monday',
      label: 'Seg',
      accessibleLabel: 'Segunda-feira',
    }

    renderForm(formHelpers)

    expect(screen.getByRole('button', { name: 'Segunda-feira' })).toBeDefined()
  })

  it('states daily, timed daily, timed fixed-day, and timed flexible schedules exactly', () => {
    const formHelpers = createFormHelpers({
      title: 'Run',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
    })
    const view = renderForm(formHelpers)

    expect(screen.getByText('every day')).toBeDefined()
    expect(formHelpers.daysList.every((day) => screen.getByRole('button', { name: day.accessibleLabel }).getAttribute('aria-pressed') === 'true')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', true)

    formHelpers.testValues.days = formHelpers.daysList.map((day) => day.value).filter((day) => day !== 'Monday')
    view.rerenderForm()
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'false')
    expect(formHelpers.daysList.slice(1).every((day) => screen.getByRole('button', { name: day.accessibleLabel }).getAttribute('aria-pressed') === 'true')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', false)

    formHelpers.testValues.days = []
    view.rerenderForm()
    expect(formHelpers.daysList.every((day) => screen.getByRole('button', { name: day.accessibleLabel }).getAttribute('aria-pressed') === 'true')).toBe(true)

    formHelpers.testValues.dueTime = '07:00'
    view.rerenderForm()

    expect(screen.getByText('every day at 07:00')).toBeDefined()

    formHelpers.testValues.days = ['Monday']
    formHelpers.testValues.dueTime = '08:00'
    view.rerenderForm()

    expect(screen.getByText('every Monday at 08:00')).toBeDefined()

    formHelpers.testValues.days = []
    formHelpers.testValues.isFlexible = true
    formHelpers.testValues.frequencyUnit = 'Week'
    formHelpers.testValues.frequencyQuantity = 3
    formHelpers.testValues.dueTime = '09:00'
    view.rerenderForm()

    expect(screen.getByText('3 times a week, any day, at 09:00')).toBeDefined()

    formHelpers.testValues.isFlexible = false
    formHelpers.testValues.frequencyUnit = null
    formHelpers.testValues.dueTime = '15:00'
    view.rerenderForm()

    expect(screen.getByText('At 15:00')).toBeDefined()
  })

  it('applies a time-only local phrase without inventing a cadence', async () => {
    const formHelpers = createFormHelpers({ title: 'Dentist at 15:00' })
    renderForm(formHelpers, undefined, false, true)

    await waitFor(() => {
      expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '15:00', { shouldDirty: true })
    })
    expect(formHelpers.setOneTime).not.toHaveBeenCalled()
  })

  it('reconciles parser-owned fields across phrase changes without clearing a manual cadence', async () => {
    const formHelpers = createFormHelpers({ title: 'Run Monday at 08:00' })
    const view = renderForm(formHelpers, undefined, false, true)

    await waitFor(() => expect(formHelpers.setRecurring).toHaveBeenCalledOnce())
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '08:00', { shouldDirty: true })

    fireEvent.click(screen.getByRole('button', { name: 'Thursday' }))
    formHelpers.testValues.title = 'Run'
    view.rerenderForm()

    await waitFor(() => expect(formHelpers.setOneTime).not.toHaveBeenCalled())
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '', { shouldDirty: true })

    formHelpers.testValues.title = 'Dentist at 15:00'
    view.rerenderForm()
    await waitFor(() => {
      expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '15:00', { shouldDirty: true })
    })
  })

  it('preserves a locked General schedule through local reads and both corrections', async () => {
    const formHelpers = createFormHelpers({ title: 'Run Monday', isGeneral: true })
    renderForm(formHelpers, undefined, false, true, true)

    await waitFor(() => expect(formHelpers.setGeneral).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Monday' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'habits.form.moreOften' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'habits.form.repeatMore' })).toBeNull()

    expect(formHelpers.setGeneral).toHaveBeenCalledOnce()
    expect(formHelpers.setRecurring).not.toHaveBeenCalled()
    expect(formHelpers.setFlexible).not.toHaveBeenCalled()
    expect(formHelpers.toggleDay).not.toHaveBeenCalled()
  })

  it('preserves an Astra schedule across the next title edit', async () => {
    const formHelpers = createFormHelpers({ title: 'Run Monday at 08:00' })
    const onSuggestSetup = vi.fn(() => {
      formHelpers.testValues.frequencyUnit = 'Week'
      formHelpers.testValues.frequencyQuantity = 3
      formHelpers.testValues.dueTime = '07:00'
      return SETUP_PROPOSAL
    })
    const view = renderForm(formHelpers, onSuggestSetup, false, true)
    await waitFor(() => expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '08:00', { shouldDirty: true }))

    formHelpers.testValues.title = 'Build a stronger routine'
    view.rerenderForm()
    await waitFor(() => expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '', { shouldDirty: true }))
    formHelpers.testValues.days = []
    formHelpers.testValues.frequencyUnit = null
    view.rerenderForm()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(onSuggestSetup).toHaveBeenCalledOnce())

    vi.mocked(formHelpers.form.setValue).mockClear()
    vi.mocked(formHelpers.setOneTime).mockClear()
    formHelpers.testValues.title = 'Build a calmer routine'
    view.rerenderForm()
    await waitFor(() => expect(formHelpers.form.setValue).not.toHaveBeenCalledWith('dueTime', '', { shouldDirty: true }))
    expect(formHelpers.setOneTime).not.toHaveBeenCalled()
  })

  it('reveals the detail sections from the single disclosure', () => {
    mockProfileState.hasProAccess = true
    renderForm(createFormHelpers({ title: 'Run', isBadHabit: true }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    expect(screen.getByText('checklist-editor')).toBeDefined()
    expect(screen.getByText('sub-habit-editor')).toBeDefined()
    expect(screen.getByText('goal-linking')).toBeDefined()
    expect(screen.getByText('date-field')).toBeDefined()
    expect(screen.getByText('slip-alert')).toBeDefined()
  })

  it('names the description field once in the owning form', () => {
    renderForm(createFormHelpers({ title: 'Run' }), undefined, true)
    expect(screen.getAllByText('habits.form.description')).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: 'habits.form.description' })).toBeInTheDocument()
  })

  it('hides slip alerts for a positive habit', () => {
    mockProfileState.hasProAccess = true
    renderForm(createFormHelpers({ title: 'Run', isBadHabit: false }), undefined, true)

    expect(screen.queryByText('slip-alert')).toBeNull()
  })

  it('hides slip alerts after switching a bad habit back to positive', () => {
    mockProfileState.hasProAccess = true
    const formHelpers = createFormHelpers({ title: 'Run', isBadHabit: true })
    const view = renderForm(formHelpers, undefined, true)
    expect(screen.getByText('slip-alert')).toBeDefined()

    fireEvent.click(screen.getByRole('switch', { name: 'habits.form.habitTypeAvoid' }))
    view.rerenderForm()

    expect(screen.queryByText('slip-alert')).toBeNull()
  })

  it.each([
    { mode: 'one-time', isOneTime: true, isGeneral: false },
    { mode: 'General', isOneTime: false, isGeneral: true },
  ])('hides the end date for $mode habits', ({ isOneTime, isGeneral }) => {
    const formHelpers = createFormHelpers({ title: 'Run' })
    Object.assign(formHelpers, { isOneTime, isGeneral, showEndDate: false })

    renderForm(formHelpers, undefined, true)

    expect(screen.queryByText('date-field')).toBeNull()
  })

  it('routes the free sub-habit row to upgrade while keeping goals available', () => {
    renderForm(createFormHelpers({ title: 'Run' }), undefined, true)

    fireEvent.click(screen.getByRole('button', { name: /common\.upgrade/ }))
    expect(mockRouterPush).toHaveBeenCalledWith('/upgrade')
    expect(screen.getByText('goal-linking')).toBeDefined()
  })

  it('nests fixed clock reminders under the offset reminder switch for a timed habit', () => {
    const formHelpers = createFormHelpers({ title: 'Run', dueTime: '08:00' })
    renderForm(formHelpers, undefined, true)

    expect(screen.getByText('offset-reminders')).toBeDefined()
    expect(screen.getByText('scheduled-reminders')).toBeDefined()
    const scheduled = screen.getByText('scheduled-reminders')
    expect(scheduled).toHaveAttribute('data-nested', 'true')
    expect(scheduled).toHaveAttribute('data-offset-count', '0')
    fireEvent.click(scheduled)
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('scheduledReminders', [{ when: 'day_before', time: '18:00' }], { shouldDirty: true })
  })

  it('preserves a prefilled end time when the exact time changes', () => {
    const formHelpers = createFormHelpers({ title: 'Run', dueTime: '08:00', dueEndTime: '09:00' })
    renderForm(formHelpers, undefined, true)

    fireEvent.change(screen.getByLabelText('habits.form.exactTime'), { target: { value: '10:00' } })

    expect(formHelpers.form.setValue).toHaveBeenCalledWith('dueTime', '10:00', { shouldDirty: true })
    expect(formHelpers.form.getValues('dueEndTime')).toBe('09:00')
  })

  it('keeps every local control live when the Astra allowance is exhausted', () => {
    mockProfileState.aiMessagesUsed = 5
    const onSuggestSetup = vi.fn(() => SETUP_PROPOSAL)
    const formHelpers = createFormHelpers({ title: 'Run', frequencyQuantity: 3 })
    renderForm(formHelpers, onSuggestSetup)

    const ask = screen.getByRole('button', { name: 'habits.form.askAstra' })
    expect(ask).toBeDisabled()
    fireEvent.click(ask)
    expect(onSuggestSetup).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', false)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    expect(screen.getByText('checklist-editor')).toBeDefined()
  })

  it('disables Astra at the Pro allowance too', () => {
    mockProfileState.hasProAccess = true
    mockProfileState.aiMessagesUsed = 5
    renderForm(createFormHelpers({ title: 'Run' }), vi.fn(() => SETUP_PROPOSAL))

    expect(screen.getByRole('button', { name: 'habits.form.askAstra' })).toBeDisabled()
  })

  it.each([
    ['day', () => fireEvent.click(screen.getByRole('button', { name: 'Monday' }))],
    ['emoji', async () => {
      fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
      fireEvent.click(screen.getByRole('option', { name: 'habits.form.emoji: 🏃' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }],
  ])('resolves a proposed setup on the first %s correction', async (_kind, correct) => {
    const helpers = createFormHelpers({ title: 'Run', frequencyQuantity: 3 })
    renderForm(helpers, async () => {
      applySuggestionSchedule(setupPatch, helpers)
      return SETUP_PROPOSAL
    })

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(screen.getByText('habits.form.understoodAstra')).toBeDefined())

    await correct()

    expect(screen.getByText('habits.form.understood')).toBeDefined()
  })

  it('allows Astra again after the proposed phrase changes', async () => {
    const onSuggestSetup = vi.fn(() => SETUP_PROPOSAL)
    renderForm(createFormHelpers({ title: 'Build a stronger routine' }), onSuggestSetup)

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(onSuggestSetup).toHaveBeenCalledOnce())
    expect(screen.queryByRole('button', { name: 'habits.form.askAstra' })).toBeNull()

    fireEvent.change(screen.getByLabelText('habits.form.describe'), {
      target: { value: 'Build a calmer routine' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))

    await waitFor(() => expect(onSuggestSetup).toHaveBeenCalledTimes(2))
  })

  it('preserves breakdown proposals when correcting proposed setup', async () => {
    mockProfileState.hasProAccess = true
    const formHelpers = createFormHelpers({ title: 'Build a stronger routine' })
    renderForm(formHelpers, () => {
      applySuggestionSchedule(setupPatch, formHelpers)
      formHelpers.testValues.checklistItems = [{ text: 'Prepare', isChecked: false }]
      return COMBINED_PROPOSAL
    }, true)

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(document.querySelectorAll('[data-proposed]')).toHaveLength(2))
    expect(screen.getByText('checklist-editor')).toHaveAttribute('data-proposed-item-count', '1')

    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))

    expect(document.querySelectorAll('[data-proposed]')).toHaveLength(1)
    expect(screen.getByText('checklist-editor')).toHaveAttribute('data-proposed-item-count', '1')
    expect(screen.getByText('sub-habit-editor').closest('[data-proposed]')).not.toBeNull()
  })

  it('keeps a pre-existing checklist normal when Astra proposes only setup', async () => {
    const helpers = createFormHelpers({ title: 'Run', checklistItems: [{ text: 'Shoes', isChecked: false }] })
    renderForm(helpers, () => {
      applySuggestionSchedule(setupPatch, helpers)
      return SETUP_PROPOSAL
    }, true)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(screen.getByText('habits.form.understoodAstra')).toBeDefined())
    expect(screen.getByText('checklist-editor').closest('[data-proposed]')).toBeNull()
  })

  it('marks only an Astra checklist proposal and resolves it when edited', async () => {
    renderForm(
      createFormHelpers({
        title: 'Run',
        frequencyQuantity: 3,
        checklistItems: [{ text: 'Shoes', isChecked: false }],
      }),
      () => CHECKLIST_PROPOSAL,
      true,
    )

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(screen.getByText('checklist-editor')).toHaveAttribute('data-proposed-item-count', '1'))
    expect(screen.queryByRole('button', { name: 'habits.form.askAstra' })).toBeNull()

    fireEvent.click(screen.getByText('checklist-editor'))
    expect(screen.getByText('checklist-editor')).toHaveAttribute('data-proposed-item-count', '0')
  })

  it('resolves a proposed sub-habit section when its parent editor changes it', async () => {
    mockProfileState.hasProAccess = true
    let resolveProposal = () => {}
    renderForm(
      createFormHelpers({ title: 'Run' }),
      () => SUB_HABIT_PROPOSAL,
      true,
      false,
      null,
      (resolve) => { resolveProposal = resolve },
    )

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(screen.getByText('sub-habit-editor').closest('[data-proposed]')).not.toBeNull())

    act(() => resolveProposal())
    expect(screen.getByText('sub-habit-editor').closest('[data-proposed]')).toBeNull()
  })
})


describe('cadence corrections without a type picker', () => {
  it('shows only days for a parsed fixed schedule', () => {
    renderForm(createFormHelpers({ title: 'Read every Monday', days: ['Monday'], frequencyUnit: 'Day', frequencyQuantity: 1 }))
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.getByRole('button', { name: 'Monday' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'habits.form.moreOften' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'habits.form.repeatMore' })).toBeNull()
  })

  it.each([
    { title: 'Run 3 times a week', isFlexible: true, frequencyUnit: 'Week', frequencyQuantity: 3 },
    { title: 'Run', isFlexible: false, frequencyUnit: null, frequencyQuantity: null },
  ])('offers day and count corrections for $title', (values) => {
    const formHelpers = createFormHelpers(values)
    renderForm(formHelpers)
    expect(screen.queryByRole('radiogroup')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.setRecurring).toHaveBeenCalled()
    expect(formHelpers.toggleDay).toHaveBeenCalledWith('Monday', false)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreOften' }))
    expect(formHelpers.setFlexible).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'habits.form.repeatMore' })).toBeNull()
  })
})


describe('cadence correction transitions', () => {
  it('returns to a weekly target when the last selected day is cleared', () => {
    const formHelpers = createFormHelpers({ title: 'Read every Monday', days: ['Monday'], frequencyUnit: 'Day', frequencyQuantity: 1 })
    renderForm(formHelpers)
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }))
    expect(formHelpers.setFlexible).toHaveBeenCalledOnce()
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('frequencyQuantity', 3, { shouldDirty: true })
  })

  it('keeps repeat intervals inside more details', () => {
    const formHelpers = createFormHelpers({ title: 'Read every Monday', days: ['Monday'], frequencyUnit: 'Day', frequencyQuantity: 1 })
    renderForm(formHelpers)
    expect(screen.queryByRole('button', { name: 'habits.form.repeatMore' })).toBeNull()
    fireEvent.click(screen.getByText('habits.form.moreDetails'))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.repeatMore' }))
    expect(formHelpers.form.setValue).toHaveBeenCalledWith('intervalWeeks', 2, { shouldDirty: true })
  })
})


it('reveals the same description failure again after details were collapsed', () => {
  const helpers = createFormHelpers()
  helpers.backendFieldErrors = { description: 'Server description failure' }
  helpers.backendFocusField = 'description'
  helpers.backendFocusRequest = 1
  const view = renderForm(helpers)
  expect(screen.getByLabelText('habits.form.description').closest('[data-open]')).toHaveAttribute('data-open', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
  helpers.backendFocusRequest = 2
  view.rerenderForm()
  expect(screen.getByLabelText('habits.form.description').closest('[data-open]')).toHaveAttribute('data-open', 'true')
})


it('keeps rejected tag Name validation beside its input in the owning habit editor', async () => {
  tagMutations.create.mockRejectedValue({ errors: { Name: ['Tag must have at most 50 characters'] } })
  const helpers = createFormHelpers()
  function OwningForm() {
    const tags = useTagSelection()
    return <HabitFormFields formHelpers={helpers} tags={tags} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />
  }
  render(<OwningForm />)
  fireEvent.click(screen.getByRole('button', { name: /^habits.form.tags/ }))
  fireEvent.click(screen.getByRole('button', { name: 'habits.form.newTag' }))
  const input = screen.getByRole('textbox', { name: 'habits.form.tagName' })
  fireEvent.change(input, { target: { value: 'Health' } })
  fireEvent.click(screen.getByRole('button', { name: 'common.add' }))
  await waitFor(() => {
    expect(input).toHaveAccessibleDescription('Tag must have at most 50 characters')
    expect(input).toHaveFocus()
  })
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveFocus()
  expect(input).toHaveValue('Health')
  expect(screen.getByRole('dialog', { name: 'habits.form.tags' })).toBeInTheDocument()
  expect(screen.getByText('Tag must have at most 50 characters')).not.toHaveAttribute('role', 'alert')
  const commit = screen.getByRole('button', { name: 'common.add' })
  commit.focus()
  fireEvent.click(commit)
  await waitFor(() => {
    expect(input).toHaveFocus()
    expect(tagMutations.create).toHaveBeenCalledTimes(2)
  })
  expect(input).toHaveValue('Health')
  fireEvent.change(input, { target: { value: 'Updated' } })
  expect(input).not.toHaveAttribute('aria-invalid')
  expect(input).not.toHaveAccessibleDescription()
  tagMutations.create.mockResolvedValueOnce({ id: 'tag-created' })
  fireEvent.click(commit)
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'habits.form.tagName' })).toBeNull())
  expect(tagMutations.create).toHaveBeenLastCalledWith({ name: 'Updated', color: expect.any(String) })
  expect(screen.getByText('habits.form.selectedCount:{"count":1}')).toBeInTheDocument()
})

it('exposes tag suggestions from the owning habit form', () => {
  renderForm(createFormHelpers({ title: 'Run', description: 'Outside' }), undefined, true)
  fireEvent.click(screen.getByRole('button', { name: /^habits.form.tags/ }))
  expect(screen.getByRole('button', { name: 'habits.form.suggestTags' })).toBeEnabled()
})

describe('habit tag suggestions', () => {
  function renderTagForm(title = ' Run ', description = ' Outside ', initialIds: string[] = []) {
    const helpers = createFormHelpers({ title, description })
    function OwningForm() {
      const tags = useTagSelection(initialIds)
      return <><output aria-label="Selected tags">{tags.selectedTagIds.join(',')}</output><HabitFormFields formHelpers={helpers} tags={tags} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded /></>
    }
    const view = render(<OwningForm />)
    fireEvent.click(screen.getByRole('button', { name: /^habits.form.tags/ }))
    return { ...view, helpers, refresh: () => view.rerender(<OwningForm />) }
  }

  beforeEach(() => {
    tagCollection.tags = []
    tagMutations.suggest.mockReset()
    tagMutations.create.mockReset()
    tagMutations.delete.mockReset()
    formLocale.language = 'en'
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
    const view = renderTagForm()
    tagMutations.delete.mockImplementation((id: string) => {
      tagCollection.tags = tagCollection.tags.filter((tag) => tag.id !== id)
      view.refresh()
      return Promise.resolve()
    })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    if (phase === 'settled') await act(async () => complete(proposals))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'habits.form.deleteTag: Health' })) })
    expect(tagMutations.delete).toHaveBeenCalledWith('existing')
    if (phase === 'pending') await act(async () => complete(proposals))
    const staleProposal = screen.queryByRole('button', { name: 'Health', pressed: false })
    if (staleProposal) await act(async () => { fireEvent.click(staleProposal) })
    expect(screen.getByLabelText('Selected tags')).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: 'Health', pressed: false })).toBeNull()
    fireEvent.click(within(screen.getByRole('group', { name: 'habits.form.suggestedTagsLabel' })).getByRole('button', { name: 'Outdoors', pressed: false }))
    await waitFor(() => expect(screen.getByLabelText('Selected tags')).toHaveTextContent('outdoors'))
    tagMutations.create.mockResolvedValue({ id: 'created' })
    fireEvent.click(screen.getByRole('button', { name: 'Reading', pressed: false }))
    await waitFor(() => expect(screen.getByLabelText('Selected tags')).toHaveTextContent('outdoors,created'))
    expect(tagMutations.suggest).toHaveBeenCalledTimes(1)
    expect(tagMutations.create).toHaveBeenCalledWith({ name: 'Reading', color: '#7c3aed' })
  })

  it.each(['settled', 'pending', 'error'])('preserves %s suggestion state across tag search changes', async (phase) => {
    tagCollection.tags = Array.from({ length: 25 }, (_, index) => ({ id: `tag-${index}`, name: `Tag ${index}`, color: '#000000' }))
    let complete!: (response: { tags: { name: string; color: string; isExisting: boolean; id: null }[] }) => void
    tagMutations.suggest.mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    if (phase === 'error') tagMutations.suggest.mockRejectedValueOnce(new Error('Unavailable'))
    renderTagForm()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    const proposals = { tags: [{ name: 'Reading', color: '#000000', isExisting: false, id: null }] }
    if (phase === 'settled') await act(async () => complete(proposals))
    if (phase === 'error') expect(await screen.findByRole('alert')).toHaveTextContent('habits.form.suggestTagsError')
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.searchTags' }), { target: { value: 'Tag 24' } })
    if (phase === 'pending') {
      expect(screen.getByRole('button', { name: 'habits.form.suggestTags' })).toBeDisabled()
      expect(screen.getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('habits.form.suggestingTags')
      await act(async () => complete(proposals))
    }
    if (phase === 'error') expect(screen.getByRole('alert')).toHaveTextContent('habits.form.suggestTagsError')
    else expect(await screen.findByRole('button', { name: 'Reading', pressed: false })).toBeEnabled()
    expect(tagMutations.suggest).toHaveBeenCalledTimes(1)
  })

  it.each(['success', 'failure'])('preserves proposals and acceptance status across optimistic virtualization: %s', async (outcome) => {
    tagCollection.tags = Array.from({ length: 20 }, (_, index) => ({ id: `tag-${index}`, name: `Tag ${index}`, color: '#000000' }))
    tagMutations.suggest.mockResolvedValue({ tags: [
      { name: 'Reading', color: '#000000', isExisting: false, id: null },
      { name: 'Outdoors', color: '#000000', isExisting: false, id: null },
    ] })
    const view = renderTagForm()
    let complete!: (response: { id: string }) => void
    let fail!: (error: Error) => void
    tagMutations.create.mockImplementation(() => {
      tagCollection.tags = [...tagCollection.tags, { id: 'optimistic', name: 'Reading', color: '#000000' }]
      view.refresh()
      return new Promise((resolve, reject) => { complete = resolve; fail = reject })
    })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reading', pressed: false }))
    expect(screen.getByRole('textbox', { name: 'habits.form.searchTags' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Outdoors', pressed: false })).toBeDisabled()
    expect(screen.getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('common.loading')
    expect(screen.getByRole('button', { name: 'habits.form.suggestTags' })).toBeDisabled()
    if (outcome === 'success') {
      await act(async () => complete({ id: 'created' }))
      expect(screen.getByLabelText('Selected tags')).toHaveTextContent('created')
      expect(screen.queryByRole('button', { name: 'Reading', pressed: false })).toBeNull()
    } else {
      await act(async () => {
        tagCollection.tags = tagCollection.tags.slice(0, 20)
        view.refresh()
        fail(new Error('Unavailable'))
      })
      expect(screen.getByLabelText('Selected tags')).toHaveTextContent('')
      expect(screen.getByRole('button', { name: 'Reading', pressed: false })).toBeEnabled()
      expect(screen.getByRole('alert')).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Outdoors', pressed: false })).toBeEnabled()
    expect(tagMutations.suggest).toHaveBeenCalledTimes(1)
  })

  it('requests proposals with trimmed context and accepts existing and new tags only on selection', async () => {
    tagCollection.tags = [{ id: 'existing', name: 'Health', color: '#7c3aed' }]
    tagMutations.suggest.mockResolvedValue({ tags: [
      { name: 'Health', color: '#7c3aed', isExisting: true, id: 'existing' },
      { name: 'Reading', color: '#7c3aed', isExisting: false, id: null },
    ] })
    tagMutations.create.mockResolvedValue({ id: 'created' })
    renderTagForm()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    expect(await screen.findByRole('group', { name: 'habits.form.suggestedTagsLabel' })).toHaveAttribute('data-proposed')
    expect(tagMutations.suggest).toHaveBeenCalledWith({ title: 'Run', description: 'Outside', language: 'en' })
    expect(screen.getByLabelText('Selected tags')).toHaveTextContent('')
    expect(tagMutations.create).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('group', { name: 'habits.form.suggestedTagsLabel' })).getByRole('button', { name: 'Health', pressed: false }))
    await waitFor(() => expect(screen.getByLabelText('Selected tags')).toHaveTextContent('existing'))
    expect(tagMutations.create).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reading', pressed: false }))
    await waitFor(() => expect(screen.getByLabelText('Selected tags')).toHaveTextContent('existing,created'))
    expect(tagMutations.create).toHaveBeenCalledWith({ name: 'Reading', color: '#7c3aed' })
    expect(screen.queryByRole('group', { name: 'habits.form.suggestedTagsLabel' })).toBeNull()
  })

  it('preserves the action label while loading and announces an empty result', async () => {
    let resolve!: (response: { tags: [] }) => void
    tagMutations.suggest.mockImplementation(() => new Promise((complete) => { resolve = complete }))
    formLocale.language = 'pt-BR'
    renderTagForm('Run', '   ')
    const action = screen.getByRole('button', { name: 'habits.form.suggestTags' })
    fireEvent.click(action)
    expect(action).toBeDisabled()
    expect(action).toHaveAttribute('aria-busy', 'true')
    expect(action).toHaveAccessibleDescription('habits.form.suggestingTags')
    expect(within(screen.getByRole('dialog', { name: 'habits.form.tags' })).getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('habits.form.suggestingTags')
    fireEvent.click(action)
    expect(tagMutations.suggest).toHaveBeenCalledTimes(1)
    expect(tagMutations.suggest).toHaveBeenCalledWith({ title: 'Run', description: null, language: 'pt-BR' })
    await act(async () => resolve({ tags: [] }))
    expect(within(screen.getByRole('dialog', { name: 'habits.form.tags' })).getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('habits.form.noTagSuggestions')
    expect(action).toBeEnabled()
  })

  it('shows request failure inline and permits a successful retry', async () => {
    tagMutations.suggest.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce({ tags: [] })
    renderTagForm()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('habits.form.suggestTagsError')
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    await waitFor(() => expect(within(screen.getByRole('dialog', { name: 'habits.form.tags' })).getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('habits.form.noTagSuggestions'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('retains a failed new proposal for retry and disables other actions during acceptance', async () => {
    tagMutations.suggest.mockResolvedValue({ tags: [{ name: 'Reading', color: '#7c3aed', isExisting: false, id: null }] })
    let reject!: (error: Error) => void
    tagMutations.create.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail })).mockResolvedValueOnce({ id: 'created' })
    renderTagForm()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reading', pressed: false }))
    expect(screen.getByRole('button', { name: 'Reading', pressed: false })).toBeDisabled()
    expect(screen.getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('common.loading')
    expect(screen.getByRole('button', { name: 'habits.form.suggestTags' })).toBeDisabled()
    await act(async () => reject(new Error('Unavailable')))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByLabelText('Selected tags')).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole('button', { name: 'Reading', pressed: false }))
    await waitFor(() => expect(screen.getByLabelText('Selected tags')).toHaveTextContent('created'))
  })

  it.each([['   ', []], ['Run', ['1', '2', '3', '4', '5']]])('disables suggestions with an empty title or full selection: %s', (title, ids) => {
    const view = renderTagForm(title, '', ids)
    const action = screen.getByRole('button', { name: 'habits.form.suggestTags' })
    expect(action).toBeDisabled()
    fireEvent.click(action)
    expect(tagMutations.suggest).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'habits.form.newTag' })).toBeInTheDocument()
    expect(within(screen.getByRole('dialog', { name: 'habits.form.tags' })).getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent(title.trim() ? 'habits.form.tagLimit' : 'habits.form.titleRequired')
    if (!title.trim()) {
      view.helpers.testValues.title = 'Run'
      view.refresh()
      expect(action).toBeEnabled()
      expect(screen.queryByText('habits.form.titleRequired')).toBeNull()
    }
  })

  it('disables remaining proposals at capacity', async () => {
    tagCollection.tags = [{ id: 'existing', name: 'Health', color: '#7c3aed' }]
    tagMutations.suggest.mockResolvedValue({ tags: [
      { name: 'Health', color: '#7c3aed', isExisting: true, id: 'existing' },
      { name: 'Reading', color: '#7c3aed', isExisting: false, id: null },
    ] })
    renderTagForm('Run', '', ['1', '2', '3', '4'])
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    fireEvent.click(within(await screen.findByRole('group', { name: 'habits.form.suggestedTagsLabel' })).getByRole('button', { name: 'Health', pressed: false }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reading', pressed: false })).toBeDisabled())
    expect(tagMutations.create).not.toHaveBeenCalled()
  })

  it.each(['title', 'description', 'locale', 'returning title', 'account'])('drops an in-flight result when the habit context changes: %s', async (context) => {
    let resolve!: (response: { tags: { name: string; color: string; isExisting: boolean; id: null }[] }) => void
    tagMutations.suggest.mockImplementation(() => new Promise((complete) => { resolve = complete }))
    const view = renderTagForm()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.suggestTags' }))
    await act(async () => {
      if (context === 'locale') formLocale.language = 'pt-BR'
      else if (context === 'account') advanceAccountGeneration()
      else view.helpers.testValues[context === 'description' ? 'description' : 'title'] = 'Read'
      view.refresh()
    })
    if (context === 'returning title') await act(async () => { view.helpers.testValues.title = ' Run '; view.refresh() })
    await act(async () => resolve({ tags: [{ name: 'Outdoors', color: '#7c3aed', isExisting: false, id: null }] }))
    expect(screen.queryByRole('button', { name: 'Outdoors', pressed: false })).toBeNull()
    expect(screen.getByRole('button', { name: 'habits.form.suggestTags' })).toBeEnabled()

  })
})

describe('habit end time', () => {
  function EditingForm({ onSave }: { onSave: (requests: unknown[]) => void }) {
    const helpers = useHabitForm({ initialData: { title: 'Run', dueDate: '2099-01-01' } })
    const save = () => {
      if (helpers.validateAll()) return
      const values = habitFormSchema.parse(helpers.form.getValues())
      onSave([buildCreateHabitRequest(values, [], [], [], []), buildUpdateHabitRequest(values, true, '', [], [])])
    }
    return <><HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} /><button onClick={() => helpers.form.reset({ ...helpers.form.getValues(), dueTime: '08:00', dueEndTime: '09:00' })}>load existing times</button><button onClick={() => helpers.form.reset({ ...helpers.form.getValues(), dueTime: '' })}>remove start elsewhere</button><button onClick={save}>save times</button></>
  }

  it('edits and clears end times, rejects ordering errors, and disables the field without a start', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onSave = vi.fn()
    render(<QueryClientProvider client={client}><EditingForm onSave={onSave} /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    const end = screen.getByLabelText('habits.form.dueEndTime')
    expect(end).toBeDisabled()
    expect(end).toHaveAccessibleDescription('habits.form.endTimeRequiresStart')
    const start = screen.getByLabelText('habits.form.exactTime')
    fireEvent.change(start, { target: { value: '08:00' } })
    expect(end).toBeEnabled()
    fireEvent.change(end, { target: { value: '09:00' } })
    fireEvent.blur(end)
    expect(end).toHaveValue('09:00')
    fireEvent.click(screen.getByRole('button', { name: 'save times' }))
    expect(onSave).toHaveBeenLastCalledWith([expect.objectContaining({ dueTime: '08:00', dueEndTime: '09:00' }), expect.objectContaining({ dueTime: '08:00', dueEndTime: '09:00' })])
    onSave.mockClear()
    fireEvent.change(end, { target: { value: '08:00' } })
    fireEvent.blur(end)
    expect(end).toHaveAttribute('aria-invalid', 'true')
    expect(end).toHaveAccessibleDescription('habits.form.endTimeBeforeStartTime')
    fireEvent.click(screen.getByRole('button', { name: 'save times' }))
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(end, { target: { value: '07:00' } })
    fireEvent.blur(end)
    expect(end).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(end, { target: { value: '10:00' } })
    fireEvent.blur(end)
    expect(end).not.toHaveAttribute('aria-invalid')
    fireEvent.click(within(end.parentElement!).getByRole('button', { name: 'common.clear' }))
    expect(end).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'load existing times' }))
    expect(end).toHaveValue('09:00')
    fireEvent.click(within(start.parentElement!).getByRole('button', { name: 'common.clear' }))
    expect(end).toHaveValue('')
    expect(end).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'load existing times' }))
    fireEvent.click(screen.getByRole('button', { name: 'remove start elsewhere' }))
    await waitFor(() => expect(end).toHaveValue(''))
    expect(end).toBeDisabled()
  })
})
