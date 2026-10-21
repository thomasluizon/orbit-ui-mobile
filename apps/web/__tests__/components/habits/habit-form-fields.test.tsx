import { appConfigSchema } from '@orbit/shared/types/config'
import { createMockConfigResponse, createMockHabit } from '@orbit/shared/__tests__/factories'
import React from 'react'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import type { HabitTag } from '@orbit/shared/types/habit'
import userEvent from '@testing-library/user-event'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { habitFormSchema } from '@orbit/shared/validation'
import { buildCreateHabitRequest, buildUpdateHabitRequest, buildHabitFormPatchFromSuggestion } from '@orbit/shared/utils'
import { applySuggestionSchedule } from '@/components/habits/create-habit-modal/apply-suggestion'
import type { HabitFormProposal } from '@orbit/shared/utils'
import { useHabitForm, type HabitFormHelpers } from '@/hooks/use-habit-form'
import { useTagSelection, type TagSelectionState } from '@/hooks/use-tag-selection'

const tagCollection = vi.hoisted(() => ({ tags: [] as HabitTag[] }))
const tagMutations = vi.hoisted(() => ({ create: vi.fn(), suggest: vi.fn(), delete: vi.fn() }))
const formLocale = vi.hoisted(() => ({ language: 'en', realReminders: false, realDates: false, realDateCopy: false }))
const mockProfileState = vi.hoisted(() => ({ aiMessagesUsed: 0, hasProAccess: false, timeZone: 'UTC' }))
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

vi.mock('react-hook-form', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-hook-form')>(),
  useController: () => ({ field: { ref: vi.fn() } }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => translateTestValue,
  useLocale: () => formLocale.language,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockRouterPush }) }))
const dateRequests = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/hooks/use-date-interpretation', () => ({ useDateInterpretation: () => ({ mutateAsync: dateRequests.request }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
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
  useHabitDetail: () => ({ data: null, isPending: false, error: null }),
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

describe('HabitFormFields', () => {
  it('omits an empty sub-habit section when the edit form supplies no editor', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><HabitFormFields formHelpers={createFormHelpers()} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded /></QueryClientProvider>)
    expect(screen.queryByText('habits.form.subHabits')).toBeNull()
  })

  it.each([false, true])('keeps the sub-habit editor available with Pro access %s', (hasProAccess) => {
    mockProfileState.hasProAccess = hasProAccess
    renderForm(createFormHelpers({ title: 'Run' }), undefined, true)
    expect(screen.queryByText('sub-habit-editor')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /common\.upgrade/ }) !== null).toBe(false)
  })

  it.each(['', '   ', 'Swim'])('reaches the emoji action without replacing setup for title %j', async (title) => {
    const onSuggestEmoji = vi.fn().mockResolvedValue(SETUP_PROPOSAL)
    renderForm(createFormHelpers({ title }), undefined, false, false, null, undefined, { onSuggestEmoji })
    const button = screen.getByRole('button', { name: 'habits.form.emojiSuggest' })
    expect(button.hasAttribute('disabled')).toBe(!title.trim())
    if (title.trim()) {
      const user = userEvent.setup()
      button.focus()
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
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.describe' }), { target: { value: 'Run every day' } })
    await waitFor(() => expect(screen.getByRole('region', { name: 'habits.form.understood' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' }))
    fireEvent.click(screen.getByRole('option', { name: 'habits.form.emoji: 🌱' }))
    expect(screen.getByRole('button', { name: 'habits.form.emojiOpenPicker' })).toHaveTextContent('🌱')

    const expectHidden = () => {
      expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'habits.form.emojiOpenPicker' })).toBeNull()
      expect(formHelpers.form.getValues('emoji')).toBe('🌱')
    }
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.describe' }), { target: { value: '' } })
    expectHidden()
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.describe' }), { target: { value: 'Run every day' } })
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

  it.each(['en', 'pt-BR'])('renders an editable date in %s', (locale) => {
    formLocale.language = locale
    formLocale.realDates = true
    renderForm(createFormHelpers({ itemType: 'task' }))
    expect(screen.getByRole('button', { name: /habits.form.taskDate/ })).toBeVisible()
    expect(screen.queryByText('habits.form.startDateReason')).toBeNull()
    formLocale.realDates = false
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

  it('starts with type, title and editable date fields and closed details', () => {
    renderForm()
    expect(screen.getByLabelText('habits.form.describe')).toBeDefined()
    expect(screen.getByRole('button', { name: 'habits.form.moreDetails' })).toBeDefined()
    expect(screen.queryByText('habits.form.oneTimeTask')).toBeNull()
    expect(screen.queryByText('habits.form.recurring')).toBeNull()
    expect(screen.queryByText('habits.form.flexible')).toBeNull()
    expect(screen.queryByText('habits.form.general')).toBeNull()
    expect(screen.getByText('habits.form.taskDate')).toBeDefined()
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
    expect(screen.getAllByText('date-field').length).toBeGreaterThan(0)
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

    expect(screen.queryByText('habits.form.endDate')).toBeNull()
  })

  it('keeps sub-habits and goals available without an upgrade row', () => {
    renderForm(createFormHelpers({ title: 'Run' }), undefined, true)

    expect(screen.getByText('sub-habit-editor')).toBeDefined()
    expect(mockRouterPush).not.toHaveBeenCalled()
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
    await waitFor(() => expect(screen.getByText('sub-habit-editor').closest('[data-proposed]')).not.toBeNull())
    expect(screen.getByRole('spinbutton').closest('[data-proposed]')).not.toBeNull()
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
    expect(screen.queryByRole('radiogroup', { name: 'habits.form.frequency' })).toBeNull()
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
    expect(screen.queryByRole('radiogroup', { name: 'habits.form.frequency' })).toBeNull()
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
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: 'habits.form.suggestedTagsLabel' })).getByRole('button', { name: 'Outdoors', pressed: false }))
    })
    await waitFor(() => {
      expect(screen.getByLabelText('Selected tags')).toHaveTextContent('outdoors')
      expect(screen.getByRole('button', { name: 'Reading', pressed: false })).toBeEnabled()
      expect(screen.getByRole('status', { name: 'habits.form.suggestTags' })).toHaveTextContent('habits.form.suggestedTagsLabel')
    })
    tagMutations.create.mockResolvedValue({ id: 'created' })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reading', pressed: false })) })
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
    expect(screen.getByRole('dialog', { name: 'habits.form.tags' }).querySelector('[data-asset^="astra-mark"]')).toBeNull()
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
    expect(screen.getByRole('dialog', { name: 'habits.form.tags' }).querySelector('[data-asset^="astra-mark"]')).toBeNull()
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

describe('manual schedule creation', () => {
  beforeEach(() => {
    formLocale.language = 'en'
    mockProfileState.aiMessagesUsed = 0
  })
  it.each(['Day', 'Week', 'Month', 'Year'] as const)('creates every interval and flexible %s schedule without Astra', async (unit) => {
    mockProfileState.aiMessagesUsed = 5
    const ask = vi.fn()
    let helpers!: HabitFormHelpers
    function OwningForm() {
      helpers = useHabitForm({ initialData: { itemType: 'habit', title: 'Read', dueDate: '2026-09-02' } })
      return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={ask} readPhraseLocally />
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><OwningForm /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.every' }))
    fireEvent.click(screen.getByRole('radio', { name: `habits.form.unit${unit}` }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'habits.form.frequency' }), { target: { value: '12' } })
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 12, isFlexible: false, days: [] })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.repeatMore' }))
    expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 12, intervalWeeks: 2 })
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.timesPerUnit' }))
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 12, isFlexible: true, days: [] })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'habits.form.frequency' }), { target: { value: '0' } })
    expect(screen.getByRole('spinbutton')).toHaveAccessibleDescription('habits.form.frequencyRequired')
    expect(helpers.validateAll()).toBe('habits.form.frequencyRequired')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } })
    expect(screen.queryByRole('region', { name: 'habits.form.understood' })).toBeNull()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } })
    expect(helpers.validateAll()).toBeNull()
    expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 4, isFlexible: true })
    fireEvent.change(screen.getByLabelText('habits.form.describe'), { target: { value: 'Read books' } })
    expect(helpers.form.getValues()).toMatchObject({ frequencyUnit: unit, frequencyQuantity: 4, isFlexible: true })
    expect(ask).not.toHaveBeenCalled()
  })

  it.each(['quantity', 'unit', 'mode', 'day', 'interval'] as const)('marks an Astra schedule as proposed until a %s edit', async (edit) => {
    const patch = buildHabitFormPatchFromSuggestion({ emoji: null, frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday'], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] })
    let helpers!: HabitFormHelpers
    function OwningForm() {
      helpers = useHabitForm({ initialData: { itemType: 'habit', title: 'Read', dueDate: '2099-01-01' } })
      return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} onSuggestSetup={() => ({ ...SETUP_PROPOSAL, setup: applySuggestionSchedule(patch, helpers) })} readPhraseLocally />
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(<QueryClientProvider client={queryClient}><OwningForm /></QueryClientProvider>)
    expect(view.container.querySelector('[data-proposed]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askAstra' }))
    await waitFor(() => expect(helpers.form.getValues('days')).toEqual(['Monday']))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    const quantity = screen.getByRole('spinbutton', { name: 'habits.form.frequency' })
    for (const control of [quantity, screen.getByRole('radio', { name: 'habits.form.every' }), screen.getByRole('radio', { name: 'habits.form.unitDay' }), screen.getByRole('button', { name: helpers.daysList.find((day) => day.value === 'Monday')!.accessibleLabel })]) {
      expect(control.closest('[data-proposed]')).not.toBeNull()
    }
    expect(quantity).toHaveValue(1)
    expect((quantity as HTMLInputElement).style.color).toBe('var(--fg-3)')
    expect(screen.getByRole('button', { name: helpers.daysList.find((day) => day.value === 'Monday')!.accessibleLabel })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: 'habits.form.describe' }).closest('[data-proposed]')).toBeNull()
    quantity.focus()
    if (edit === 'quantity') fireEvent.change(quantity, { target: { value: '2' } })
    else if (edit === 'unit') fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitMonth' }))
    else if (edit === 'mode') fireEvent.click(screen.getByRole('radio', { name: 'habits.form.timesPerUnit' }))
    else fireEvent.click(screen.getByRole('button', { name: edit === 'day' ? helpers.daysList.find((day) => day.value === 'Tuesday')!.accessibleLabel : 'habits.form.repeatMore' }))
    expect(view.container.querySelector('[data-proposed]')).toBeNull()
    if (edit === 'quantity') {
      expect(screen.getByRole('spinbutton')).toBe(quantity)
      expect(quantity).toHaveFocus()
      expect(quantity).toHaveValue(2)
      expect((quantity as HTMLInputElement).style.color).toBe('var(--fg-1)')
    }
    expect(helpers.form.getValues('title')).toBe('Read')
  })

  it('disables manual scheduling for a locked parent', () => {
    renderForm(createFormHelpers({ title: 'Read', isGeneral: true }), undefined, true, false, true)
    expect(screen.getByRole('radio', { name: /habits.form.every/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('radio', { name: /habits.form.unitMonth/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('spinbutton', { name: 'habits.form.frequency' })).toBeDisabled()
  })
})

describe('habit end time', () => {
  function EditingForm({ onSave }: { onSave: (requests: unknown[]) => void }) {
    const helpers = useHabitForm({ initialData: { itemType: 'habit', title: 'Run', dueDate: '2099-01-01' } })
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

describe('restored end-date control', () => {
  it.each([false, true])('clears the selected end date through the existing update request, flexible: %s', (isFlexible) => {
    formLocale.realDates = true
    let helpers!: HabitFormHelpers
    function OwningForm() {
      helpers = useHabitForm({ initialData: { itemType: 'habit', title: 'Run', frequencyUnit: 'Day', frequencyQuantity: 1, isFlexible, endDate: '2026-11-01' } })
      return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(<QueryClientProvider client={queryClient}><OwningForm /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.removeEndDate' }))
    const request = buildUpdateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), false, '2026-11-01', [], [])
    expect(request.clearEndDate).toBe(true)
    expect(request.endDate).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'habits.form.removeEndDate' })).toBeNull()
    expect(screen.getByRole('button', { name: 'habits.form.endDate, common.selectDate' })).toHaveFocus()
    view.unmount()
    formLocale.realDates = false
  })

  it('keeps the remove action absent until an end date is selected', () => {
    renderForm(createFormHelpers(), undefined, true)
    expect(screen.queryByRole('button', { name: 'habits.form.removeEndDate' })).toBeNull()
  })
})


describe('restored type and editable date', () => {
  it('offers an explicit task choice before the title', () => {
    renderForm(createFormHelpers(), undefined, false)
    const task = screen.getByRole('radio', { name: 'habits.form.typeTask' })
    expect(task.compareDocumentPosition(screen.getByRole('textbox', { name: 'habits.form.describe' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('offers the editable task date with details closed', () => {
    formLocale.realDates = true
    renderForm(createFormHelpers({ itemType: 'task' }), undefined, false)
    expect(screen.getByRole('button', { name: /habits.form.taskDate/ })).toBeVisible()
    formLocale.realDates = false
  })
})


describe('type and date owning form workflow', () => {
  it('requires a type, preserves drafts, creates the requested date locally and restores General', () => {
    let helpers!: HabitFormHelpers
    function OwningForm() {
      helpers = useHabitForm({ initialData: { dueDate: '2026-10-20' } })
      return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} readPhraseLocally />
    }
    render(<QueryClientProvider client={new QueryClient()}><OwningForm /></QueryClientProvider>)
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.describe' }), { target: { value: 'migrar chats do ChatGPT para o Claude' } })
    act(() => { expect(helpers.validateAll()).toBe('habits.form.typeRequired') })
    expect(screen.getByRole('radio', { name: 'habits.form.typeTask' })).toHaveFocus()
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.typeTask' }))
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date'] })
    try {
      fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.datePhrase' }), { target: { value: 'dia 26' } })
      expect(helpers.form.getValues('dueDate')).toBe('2026-10-26')
      expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])).toMatchObject({ title: 'migrar chats do ChatGPT para o Claude', dueDate: '2026-10-26' })
      fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.describe' }), { target: { value: 'Read every Monday' } })
      expect(helpers.form.getValues('itemType')).toBe('task')
      expect(helpers.form.getValues('frequencyUnit')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Monday' })).toBeNull()
      fireEvent.click(screen.getByRole('radio', { name: 'habits.form.typeHabit' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.datePhrase' }), { target: { value: 'dia 28' } })
      fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
      fireEvent.click(screen.getByRole('radio', { name: /habits.form.noSchedule/ }))
      expect(buildCreateHabitRequest(habitFormSchema.parse(helpers.form.getValues()), [], [], [], [])).toMatchObject({ isGeneral: true })
      expect(screen.queryByRole('textbox', { name: 'habits.form.datePhrase' })).toBeNull()
      expect(screen.queryByRole('switch', { name: 'habits.form.habitTypeAvoid' })).toBeNull()
      fireEvent.click(screen.getByRole('radio', { name: 'habits.form.every' }))
      expect(helpers.form.getValues('isGeneral')).toBe(false)
      expect(helpers.form.getValues('dueDate')).toBe('2026-10-28')
      fireEvent.click(screen.getByRole('radio', { name: 'habits.form.typeTask' }))
      expect(helpers.form.getValues('dueDate')).toBe('2026-10-26')
      expect(helpers.form.getValues('datePhrase')).toBe('dia 26')
    } finally { vi.useRealTimers() }
  })
})

it('defaults an unregistered create date to account today once the profile is known', () => {
  vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date'] })
  let helpers!: HabitFormHelpers
  function OwningForm() {
    helpers = useHabitForm()
    return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />
  }
  try {
    render(<QueryClientProvider client={new QueryClient()}><OwningForm /></QueryClientProvider>)
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-20')
  } finally { vi.useRealTimers() }
})

it('blocks an unaccepted Astra date, preserves the saved date and focuses its calendar on acceptance', async () => {
  mockProfileState.aiMessagesUsed = 0
  dateRequests.request.mockResolvedValue({ date: '2026-10-26', referenceDate: '2026-10-20' })
  formLocale.realDates = true
  vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date'] })
  let helpers!: HabitFormHelpers
  function OwningForm() {
    helpers = useHabitForm({ initialData: { itemType: 'task', title: 'Read', dueDate: '2026-10-20' } })
    return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />
  }
  try {
    render(<QueryClientProvider client={new QueryClient()}><OwningForm /></QueryClientProvider>)
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.datePhrase' }), { target: { value: 'after vacation' } })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askDate' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'habits.form.acceptDate' })).toBeVisible())
    act(() => { expect(helpers.validateAll()).toBe('habits.form.dateConfirmationRequired') })
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-20')
    expect(dateRequests.request).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.acceptDate' }))
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-26')
    expect(helpers.form.getValues('datePhrase')).toBe('')
    expect(screen.getByRole('button', { name: /habits.form.taskDate/ })).toHaveFocus()
    expect(helpers.validateAll()).toBeNull()
  } finally { vi.useRealTimers(); formLocale.realDates = false }
})

describe('date candidate confirmation', () => {
  let helpers: HabitFormHelpers
  const saved = vi.fn()
  beforeEach(() => {
    dateRequests.request.mockReset()
    dateRequests.request.mockResolvedValue({ date: '2026-10-26', referenceDate: '2026-10-20' })
    saved.mockReset()
    mockProfileState.aiMessagesUsed = 0
    mockProfileState.timeZone = 'UTC'
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
  function OwningForm() {
    helpers = useHabitForm({ initialData: { itemType: 'task', title: 'Read', dueDate: '2026-10-20' } })
    const save = async (event: React.SubmitEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!await helpers.form.trigger(undefined, { shouldFocus: true }) || helpers.validateAll()) return
      const values = habitFormSchema.parse(helpers.form.getValues())
      saved([buildCreateHabitRequest(values, [], [], [], []), buildUpdateHabitRequest(values, helpers.isOneTime, '', [], [])])
    }
    return <form onSubmit={(event) => void save(event)}>
      <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} />
      <button type="submit">Save</button>
    </form>
  }
  function mount() {
    render(<QueryClientProvider client={new QueryClient()}><OwningForm /></QueryClientProvider>)
  }
  const phraseInput = () => screen.getByRole('textbox', { name: 'habits.form.datePhrase' })
  async function propose() {
    fireEvent.change(phraseInput(), { target: { value: 'after vacation' } })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askDate' }))
    await screen.findByRole('button', { name: 'habits.form.acceptDate' })
  }

  it.each(['en', 'pt-BR'])('retires unresolved feedback and the paid action when a date is proposed in %s', async (locale) => {
    formLocale.language = locale
    const messages = locale === 'en' ? en : ptBR
    mount()
    fireEvent.change(phraseInput(), { target: { value: 'after vacation' } })
    expect(screen.getByText(messages.habits.form.datePhraseUnresolved)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askDate' }))
    await screen.findByRole('button', { name: 'habits.form.acceptDate' })
    expect(screen.queryByText(messages.habits.form.datePhraseUnresolved)).toBeNull()
    expect(phraseInput()).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('status')).toHaveTextContent(messages.habits.form.dateProposed)
    expect(screen.queryByRole('button', { name: 'habits.form.askDate' })).toBeNull()
    expect(screen.queryByText(/^habits.form.askAstraCost/)).toBeNull()
    expect(helpers.form.getValues()).toMatchObject({ dueDate: '2026-10-20', datePhrase: 'after vacation', dateIssue: '' })
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })

  it.each([['en', 'Save'], ['en', 'Enter'], ['pt-BR', 'Save'], ['pt-BR', 'Enter']])('blocks an unaccepted candidate in %s through %s and focuses accurate confirmation guidance', async (locale, submission) => {
    formLocale.language = locale
    const confirmation = locale === 'en' ? 'Use the suggested date or choose another in the calendar.' : 'Use a data sugerida ou escolha outra no calendário.'
    mount()
    await propose()
    const user = userEvent.setup()
    if (submission === 'Save') await user.click(screen.getByRole('button', { name: 'Save' }))
    else { phraseInput().focus(); await user.keyboard('{Enter}') }
    expect(saved).not.toHaveBeenCalled()
    await waitFor(() => expect(phraseInput()).toHaveFocus())
    expect(helpers.form.getValues('dueDate')).toBe('2026-10-20')
    expect(phraseInput()).toHaveAttribute('aria-invalid', 'true')
    expect(phraseInput()).toHaveAccessibleDescription(expect.stringContaining(confirmation))
    expect(screen.queryByText(en.habits.form.datePhraseUnresolved)).toBeNull()
    expect(screen.getByRole('button', { name: 'habits.form.acceptDate' })).toBeEnabled()
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })

  it('offers another paid consultation only after the proposed phrase changes', async () => {
    mount()
    await propose()
    expect(screen.queryByRole('button', { name: 'habits.form.askDate' })).toBeNull()
    expect(screen.queryByText(/^habits.form.askAstraCost/)).toBeNull()
    fireEvent.change(phraseInput(), { target: { value: 'after my next vacation' } })
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    expect(screen.getByRole('button', { name: 'habits.form.askDate' })).toBeEnabled()
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })

  it('retains failed consultation recovery and clears manual validation after a local date edit', async () => {
    dateRequests.request.mockRejectedValueOnce(new Error('provider timeout'))
    mount()
    fireEvent.change(phraseInput(), { target: { value: 'after vacation' } })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askDate' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'habits.form.askDate' })).toBeEnabled())
    expect(screen.getByText(en.habits.form.datePhraseUnresolved)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
    await waitFor(() => expect(phraseInput()).toHaveAttribute('aria-invalid', 'true'))
    expect(saved).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askDate' }))
    await screen.findByRole('button', { name: 'habits.form.acceptDate' })
    expect(phraseInput()).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(en.habits.form.datePhraseUnresolved)).toBeNull()
    fireEvent.change(phraseInput(), { target: { value: 'dia 26' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(dateRequests.request).toHaveBeenCalledTimes(2)
  })

  it.each(['accept', 'same', 'different'])('saves only the owned date after %s resolves a blocked proposal', async (resolution) => {
    mount()
    await propose()
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
    await waitFor(() => expect(phraseInput()).toHaveAttribute('aria-invalid', 'true'))
    expect(saved).not.toHaveBeenCalled()
    const date = resolution === 'different' ? '2026-10-27' : '2026-10-26'
    if (resolution === 'accept') fireEvent.click(screen.getByRole('button', { name: 'habits.form.acceptDate' }))
    else {
      fireEvent.click(screen.getByRole('button', { name: /habits.form.taskDate/ }))
      fireEvent.click(document.querySelector<HTMLButtonElement>(`button[data-day="${date}"]`)!)
    }
    if (resolution === 'accept') expect(screen.getByRole('button', { name: /habits.form.taskDate/ })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    expect(phraseInput()).not.toHaveAttribute('aria-invalid')
    expect(helpers.form.getValues()).toMatchObject({ dueDate: date, datePhrase: '', dateIssue: '' })
    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(saved).toHaveBeenLastCalledWith([expect.objectContaining({ dueDate: date, title: 'Read' }), expect.objectContaining({ dueDate: date, title: 'Read' })])
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })
})

describe.each(['create', 'edit'] as const)('actual %s modal submit feedback', (owner) => {
  const closed = vi.fn()
  beforeEach(() => {
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
  const phraseInput = () => screen.getByRole('textbox', { name: 'habits.form.datePhrase' })
  const submitButton = () => screen.getByRole('button', { name: owner === 'create' ? 'habits.createHabit' : 'common.save' })
  const mutation = () => owner === 'create' ? modalFeedback.create : modalFeedback.update
  async function mount(type: 'task' | 'habit' | null) {
    const habit = createMockHabit({ title: 'Read', frequencyUnit: type === 'habit' ? 'Day' : null, dueDate: '2026-10-20', startDate: '2026-10-20' })
    render(<QueryClientProvider client={new QueryClient()}>{owner === 'create'
      ? <CreateHabitModal open onOpenChange={closed} initialTitle="Read" />
      : <EditHabitModal open onOpenChange={closed} habit={habit} />}</QueryClientProvider>)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'habits.form.describe' })).toHaveValue('Read'))
    const dialog = screen.getByRole('dialog', { name: owner === 'create' ? 'habits.form.newHabit' : 'habits.editHabit' })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'common.close' })).toHaveFocus())
    if (type) fireEvent.click(screen.getByRole('radio', { name: type === 'task' ? 'habits.form.typeTask' : 'habits.form.typeHabit' }))
  }
  async function submit(method = 'click') {
    const user = userEvent.setup()
    if (method === 'form') await act(async () => { fireEvent.submit(phraseInput().closest('form')!) })
    else if (method === 'Enter') { phraseInput().focus(); await user.keyboard('{Enter}') }
    else await user.click(submitButton())
  }

  it('waits for modal opening focus before starting date interactions', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    let ready = false
    const opening = mount('habit').then(() => { ready = true })
    await screen.findByRole('dialog', { name: owner === 'create' ? 'habits.form.newHabit' : 'habits.editHabit' })
    expect(ready).toBe(false)
    expect(screen.getByRole('button', { name: 'common.close' })).not.toHaveFocus()
    await act(async () => { vi.advanceTimersToNextFrame() })
    await opening
    expect(screen.getByRole('button', { name: 'common.close' })).toHaveFocus()
    fireEvent.change(phraseInput(), { target: { value: 'after vacation' } })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askDate' }))
    await screen.findByRole('button', { name: 'habits.form.acceptDate' })
    await submit('form')
    await waitFor(() => expect(phraseInput()).toHaveAttribute('aria-invalid', 'true'))
    expect(phraseInput()).toHaveFocus()
    await act(async () => { vi.advanceTimersToNextFrame() })
    expect(phraseInput()).toHaveFocus()
    expect(mutation()).not.toHaveBeenCalled()
    expect(closed).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  it.each([
    ['en', 'task', 'accept', 'click'],
    ['en', 'habit', 'manual', owner === 'create' ? 'Enter' : 'form'],
    ['pt-BR', 'task', 'manual', 'click'],
    ['pt-BR', 'habit', 'accept', owner === 'create' ? 'Enter' : 'form'],
  ] as const)('keeps %s %s candidate refusal inline through %s recovery after %s', async (locale, type, recovery, method) => {
    formLocale.language = locale
    const messages = locale === 'en' ? en : ptBR
    await mount(type)
    fireEvent.change(phraseInput(), { target: { value: 'after vacation' } })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askDate' }))
    await screen.findByRole('button', { name: 'habits.form.acceptDate' })
    await submit(method)
    await waitFor(() => expect(phraseInput()).toHaveAttribute('aria-invalid', 'true'))
    expect(phraseInput()).toHaveFocus()
    expect(phraseInput()).toHaveValue('after vacation')
    expect(phraseInput()).toHaveAccessibleDescription(expect.stringContaining(messages.habits.form.dateConfirmationRequired))
    expect(mutation()).not.toHaveBeenCalled()
    expect(closed).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
    const picker = () => screen.getByRole('button', { name: new RegExp(type === 'task' ? 'habits.form.taskDate' : 'habits.form.habitStartDate') })
    const date = recovery === 'accept' ? '2026-10-26' : '2026-10-27'
    if (recovery === 'accept') {
      fireEvent.click(screen.getByRole('button', { name: 'habits.form.acceptDate' }))
      expect(picker()).toHaveFocus()
    } else {
      fireEvent.click(picker())
      fireEvent.click(document.querySelector<HTMLButtonElement>(`button[data-day="${date}"]`)!)
    }
    expect(phraseInput()).not.toHaveAttribute('aria-invalid')
    expect(phraseInput()).toHaveValue('')
    expect(screen.queryByText(messages.habits.form.dateConfirmationRequired)).toBeNull()
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    const request = expect.objectContaining({ title: 'Read', [type === 'task' ? 'dueDate' : 'startDate']: date })
    expect(mutation()).toHaveBeenCalledWith(owner === 'create' ? request : { habitId: 'habit-1', data: request })
    expect(closed).toHaveBeenCalledWith(false)
    expect(dateRequests.request).toHaveBeenCalledOnce()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  it.each([false, true].flatMap((flexible) => [false, true].map((editAfterReturn) => ({ flexible, editAfterReturn }))))('saves the restored monthly draft after General, flexible=$flexible, edited=$editAfterReturn', async ({ flexible, editAfterReturn }) => {
    await mount('habit')
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.describe' }), { target: { value: 'Read every Monday' } })
    if (owner === 'create') fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
    if (flexible) fireEvent.click(screen.getByRole('radio', { name: 'habits.form.timesPerUnit' }))
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitMonth' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'habits.form.frequency' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.repeatMore' }))
    fireEvent.change(phraseInput(), { target: { value: 'tomorrow' } })
    fireEvent.click(screen.getByRole('button', { name: /habits.form.endDate/ }))
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[data-day="2026-10-22"]')!)
    await waitFor(() => expect(screen.queryByRole('grid')).toBeNull())
    fireEvent.click(screen.getByRole('radio', { name: /habits.form.noSchedule/ }))
    fireEvent.click(screen.getByRole('radio', { name: flexible ? 'habits.form.timesPerUnit' : 'habits.form.every' }))
    if (editAfterReturn) {
      fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitYear' }))
      fireEvent.change(screen.getByRole('spinbutton', { name: 'habits.form.frequency' }), { target: { value: '4' } })
    }
    fireEvent.click(screen.getByRole('button', { name: /habits.form.habitStartDate/ }))
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[data-day="2026-10-21"]')!)
    await waitFor(() => expect(screen.queryByRole('grid')).toBeNull())
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
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
    if (transition === 'task-before-title') expect(screen.getByRole('radio', { name: 'habits.form.typeTask' })).toBeChecked()
    const title = locale === 'en' ? 'Read every Monday' : 'Ler toda segunda'
    fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.describe' }), { target: { value: title } })
    if (transition === 'general') {
      fireEvent.click(screen.getByRole('button', { name: 'habits.form.moreDetails' }))
      fireEvent.click(screen.getByRole('radio', { name: /habits.form.noSchedule/ }))
    } else if (transition !== 'recurring' && transition !== 'task-before-title') fireEvent.click(screen.getByRole('radio', { name: 'habits.form.typeTask' }))
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
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

  if (owner === 'create') it('keeps a missing type inline and saves the retained draft after selection', async () => {
    await mount(null)
    await submit()
    expect(screen.getByText('habits.form.typeRequired')).toBeVisible()
    expect(screen.getByRole('radio', { name: 'habits.form.typeTask' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'habits.form.describe' })).toHaveValue('Read')
    expect(mutation()).not.toHaveBeenCalled()
    expect(modalFeedback.showError).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.typeTask' }))
    expect(screen.queryByText('habits.form.typeRequired')).toBeNull()
    await submit()
    await waitFor(() => expect(mutation()).toHaveBeenCalledOnce())
    expect(modalFeedback.showError).not.toHaveBeenCalled()
  })

  it('keeps genuine save failures on the existing global error path', async () => {
    mutation().mockRejectedValueOnce(new Error('save failed'))
    await mount('task')
    await submit()
    await waitFor(() => expect(modalFeedback.showError).toHaveBeenCalledOnce())
    expect(modalFeedback.showError).toHaveBeenCalledWith(owner === 'create' ? 'errors.createHabit' : 'errors.updateHabit')
    expect(mutation()).toHaveBeenCalledOnce()
    expect(closed).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'habits.form.describe' })).toHaveValue('Read')
  })
})

describe('date ownership across form transitions', () => {
  beforeEach(() => {
    dateRequests.request.mockReset()
    mockProfileState.aiMessagesUsed = 0
    mockProfileState.timeZone = 'UTC'
    formLocale.language = 'en'
    formLocale.realDates = true
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
    mockProfileState.timeZone = 'UTC'
    formLocale.language = 'en'
    formLocale.realDates = false
    document.documentElement.removeAttribute('style')
  })

  function mountDateForm(isFlexible = false) {
    let helpers!: HabitFormHelpers
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function OwningForm() {
      helpers = useHabitForm({ initialData: { itemType: 'habit', title: 'Read', dueDate: '2026-10-20', frequencyUnit: 'Day', frequencyQuantity: 1, isFlexible, endDate: '2026-12-01' } })
      return <HabitFormFields formHelpers={helpers} tags={createTags()} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} reminderTimes={[]} onReminderTimesChange={vi.fn()} defaultExpanded />
    }
    const form = () => <QueryClientProvider client={client}><OwningForm /></QueryClientProvider>
    const view = render(form())
    const phrase = (value: string) => fireEvent.change(screen.getByRole('textbox', { name: 'habits.form.datePhrase' }), { target: { value } })
    const general = () => fireEvent.click(screen.getByRole('radio', { name: /habits.form.noSchedule/ }))
    const recurring = () => fireEvent.click(screen.getByRole('radio', { name: 'habits.form.every' }))
    return { values: () => helpers.form.getValues(), helpers: () => helpers, phrase, general, recurring, refresh: () => view.rerender(form()) }
  }

  it.each([false, true])('clears the persisted end date in a real task conversion, flexible: %s', (flexible) => {
    const owner = mountDateForm(flexible)
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.typeTask' }))
    expect(owner.values()).toMatchObject({ endDate: '', frequencyUnit: null, isFlexible: false, itemType: 'task' })
    act(() => { expect(owner.helpers().validateAll()).toBeNull() })
    const request = buildUpdateHabitRequest(habitFormSchema.parse(owner.values()), owner.helpers().isOneTime, '2026-12-01', [], [])
    expect(request).toMatchObject({ clearEndDate: true, dueDate: '2026-10-20' })
    expect(request).not.toHaveProperty('endDate')
    expect(request).not.toHaveProperty('startDate')
    expect(request.frequencyUnit).toBeUndefined()
  })

  it.each(['after my vacation', '31 February', '03/04'])('restores parse recovery after General for %s without consulting', (phrase) => {
    const owner = mountDateForm()
    owner.phrase(phrase)
    owner.general()
    expect(screen.queryByRole('textbox', { name: 'habits.form.datePhrase' })).toBeNull()
    owner.recurring()
    expect(owner.values().datePhrase).toBe(phrase)
    expect(Boolean(screen.queryByRole('button', { name: 'habits.form.askDate' }))).toBe(phrase === 'after my vacation')
    expect(screen.getByRole('button', { name: /habits.form.habitStartDate/ })).toBeEnabled()
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  it.each(['day', 'timezone', 'locale', 'account'] as const)('requires manual confirmation after General and changed %s', (change) => {
    const owner = mountDateForm()
    owner.phrase('tomorrow')
    expect(owner.values().dueDate).toBe('2026-10-21')
    owner.general()
    if (change === 'day') vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
    if (change === 'timezone') mockProfileState.timeZone = 'America/Sao_Paulo'
    if (change === 'locale') formLocale.language = 'pt-BR'
    if (change === 'account') advanceAccountGeneration()
    owner.refresh()
    owner.recurring()
    expect(owner.values()).toMatchObject({ datePhrase: 'tomorrow', dueDate: '2026-10-21', dateIssue: 'habits.form.dateStale' })
    act(() => { expect(owner.helpers().validateAll()).toBe('habits.form.dateStale') })
    fireEvent.click(screen.getByRole('button', { name: /habits.form.habitStartDate/ }))
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[data-day="2026-10-21"]')!)
    act(() => { expect(owner.helpers().validateAll()).toBeNull() })
    expect(owner.values()).toMatchObject({ datePhrase: '', dateIssue: '', dueDate: '2026-10-21' })
    expect(dateRequests.request).not.toHaveBeenCalled()
  })

  function changeCadence(change: string, owner: ReturnType<typeof mountDateForm>) {
    if (change === 'unit') fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitWeek' }))
    if (change === 'quantity') fireEvent.change(screen.getByRole('spinbutton', { name: 'habits.form.frequency' }), { target: { value: '2' } })
    if (change === 'days') fireEvent.click(screen.getByRole('button', { name: owner.helpers().daysList[0]!.accessibleLabel }))
    if (change === 'interval') fireEvent.click(screen.getByRole('button', { name: 'habits.form.repeatMore' }))
    if (change === 'flexible') fireEvent.click(screen.getByRole('radio', { name: 'habits.form.timesPerUnit' }))
    if (change === 'general') { owner.general(); owner.recurring() }
  }

  it.each(['unit', 'quantity', 'days', 'interval', 'flexible', 'general'])('retires the delayed response after %s changes', async (change) => {
    let finish!: (value: { date: string; referenceDate: string }) => void
    dateRequests.request.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const owner = mountDateForm()
    owner.phrase('after my vacation')
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askDate' }))
    changeCadence(change, owner)
    await act(async () => { finish({ date: '2026-10-26', referenceDate: '2026-10-20' }) })
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    expect(owner.values()).toMatchObject({ dueDate: '2026-10-20', datePhrase: 'after my vacation' })
    expect(dateRequests.request).toHaveBeenCalledOnce()
  })

  it.each(['unit', 'quantity', 'days', 'interval', 'flexible', 'general'])('retires a visible candidate before acceptance after %s changes', async (change) => {
    dateRequests.request.mockResolvedValue({ date: '2026-10-26', referenceDate: '2026-10-20' })
    const owner = mountDateForm()
    owner.phrase('after my vacation')
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askDate' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'habits.form.acceptDate' })).toBeVisible())
    changeCadence(change, owner)
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    expect(owner.values().dueDate).toBe('2026-10-20')
  })

  it('keeps the candidate acceptance action intrinsic before acceptance', async () => {
    dateRequests.request.mockResolvedValue({ date: '2026-10-26', referenceDate: '2026-10-20' })
    const owner = mountDateForm()
    owner.phrase('after my vacation')
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askDate' }))
    const accept = await screen.findByRole('button', { name: 'habits.form.acceptDate' })
    expect(accept.closest('[data-slot="action-row"]')).toHaveStyle({ flexDirection: 'row', justifyContent: 'flex-end' })
    expect(accept.style.width).toBe('auto')
  })

  it.each(['dark', 'light'] as const)('renders candidate ink and an intrinsic action, then restores normal ink in %s', async (theme) => {
    document.documentElement.style.setProperty('--fg-1', theme === 'dark' ? '#f4f4f6' : '#1a1a1d')
    document.documentElement.style.setProperty('--fg-3', theme === 'dark' ? '#8f8f93' : '#68686d')
    dateRequests.request.mockResolvedValue({ date: '2026-10-26', referenceDate: '2026-10-20' })
    const owner = mountDateForm()
    const picker = () => screen.getByRole('button', { name: /habits.form.habitStartDate/ })
    owner.phrase('after my vacation')
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askDate' }))
    const accept = await screen.findByRole('button', { name: 'habits.form.acceptDate' })
    expect(picker().closest('[data-proposed]')).not.toBeNull()
    expect(getComputedStyle(picker().querySelector('span')!).color).toBe('var(--fg-3)')
    expect(accept.closest('[data-slot="action-row"]')).toHaveStyle({ flexDirection: 'row', justifyContent: 'flex-end' })
    expect(accept.style.width).toBe('auto')
    fireEvent.click(accept)
    expect(picker().closest('[data-proposed]')).toBeNull()
    expect(getComputedStyle(picker().querySelector('span')!).color).toBe('var(--fg-1)')
    expect(picker()).toHaveFocus()
    owner.phrase('after my vacation')
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.askDate' }))
    await screen.findByRole('button', { name: 'habits.form.acceptDate' })
    fireEvent.click(picker())
    fireEvent.click(document.querySelector<HTMLButtonElement>('button[data-day="2026-10-26"]')!)
    expect(screen.queryByRole('button', { name: 'habits.form.acceptDate' })).toBeNull()
    expect(getComputedStyle(picker().querySelector('span')!).color).toBe('var(--fg-1)')
  })
})
