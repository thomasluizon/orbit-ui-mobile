import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTranslator } from 'next-intl'
import { createMockConfigResponse, createMockHabit } from '@orbit/shared/__tests__/factories'
import { appConfigSchema } from '@orbit/shared/types/config'
import { goalKeys } from '@orbit/shared/query'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { GoalLinkingField } from '@/components/habits/goal-linking-field'

const existingHabitId = '22200000-0000-4000-8000-000000000001'
const createdHabitId = '22200000-0000-4000-8000-000000000003'
const mocks = vi.hoisted(() => ({
  createHabit: vi.fn(),
  createGoal: vi.fn(),
  createSubHabit: vi.fn(),
  showError: vi.fn(),
  suggest: vi.fn(),
  interpretDate: vi.fn(),
  locale: 'en',
  habits: { data: { habitsById: new Map<string, ReturnType<typeof createMockHabit>>() }, isLoading: false, isError: false, refetch: vi.fn() },
}))

vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useTranslations: () => createTranslator({ locale: mocks.locale, messages: mocks.locale === 'en' ? en : ptBR }),
  useLocale: () => mocks.locale,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-goals', () => ({ useCreateGoal: () => ({ mutateAsync: mocks.createGoal, isPending: false }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => mocks.habits }))
vi.mock('@/hooks/use-habits', () => ({
  useCreateHabit: () => ({ mutateAsync: mocks.createHabit, isPending: false }),
  useCreateSubHabit: () => ({ mutateAsync: mocks.createSubHabit, isPending: false }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError, showSuccess: vi.fn(), showInfo: vi.fn() }) }))
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ config: appConfigSchema.parse(createMockConfigResponse()) }) }))
vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => false,
  useProfile: () => ({ profile: { uses24HourClock: true, timeZone: 'UTC', weekStartDay: 1 } }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: () => ({ requestPermission: vi.fn(), toggleReminder: vi.fn(), showNotice: false }) }))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: mocks.suggest, isPending: false }) }))
vi.mock('@/hooks/use-date-interpretation', () => ({ useDateInterpretation: () => ({ mutateAsync: mocks.interpretDate }) }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }),
  useCreateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSuggestTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

let queryClient: QueryClient

beforeEach(() => {
  vi.clearAllMocks()
  mocks.locale = 'en'
  mocks.habits.data.habitsById = new Map()
  mocks.createGoal.mockReset().mockResolvedValue({ id: 'created-goal' })
  mocks.createHabit.mockReset().mockImplementation(async () => {
    mocks.habits.data.habitsById = new Map([[createdHabitId, createMockHabit({ id: createdHabitId, title: 'Read every day' })]])
  })
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(goalKeys.lists(), [])
})

afterEach(() => {
  cleanup()
  queryClient.clear()
})

async function openNestedHabit(context: 'create' | 'edit') {
  const parentSubmit = vi.fn()
  const onGoalCreated = vi.fn()
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <form aria-label={`${context} habit draft`} onSubmit={(event) => { event.preventDefault(); parentSubmit() }}>
        <input aria-label="Parent habit title" defaultValue="Retained parent habit" required />
        <GoalLinkingField habitId={context === 'edit' ? existingHabitId : undefined} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()} onGoalCreated={onGoalCreated} />
      </form>
    </QueryClientProvider>,
  )
  const parentForm = view.container.querySelector('form')!
  await user.click(screen.getByRole('button', { name: /^Goals/ }))
  const goals = await screen.findByRole('dialog', { name: en.habits.form.goals })
  await user.click(within(goals).getByRole('button', { name: en.habits.form.createGoal }))
  await user.type(await screen.findByLabelText(en.goals.form.title), 'A reading routine')
  await user.type(screen.getByLabelText(en.goals.form.targetValue), '12')
  await user.type(screen.getByLabelText(en.goals.form.unit), 'books')
  await user.click(screen.getByRole('button', { name: /^Linked habits/ }))
  const habits = await screen.findByRole('dialog', { name: en.goals.linkedHabits })
  expect(within(habits).getByText(en.goals.form.habitsInvitation)).toBeInTheDocument()
  await user.click(within(habits).getByRole('button', { name: en.habits.createHabit }))
  const child = await screen.findByRole('dialog', { name: en.habits.form.newHabit })
  expect(screen.queryByRole('dialog', { name: en.goals.create })).not.toBeInTheDocument()
  expect(parentSubmit).not.toHaveBeenCalled()
  return { user, parentSubmit, parentForm, onGoalCreated, child }
}

function assertPortalForm(child: HTMLElement, parentForm: HTMLFormElement) {
  const title = within(child).getByLabelText(en.habits.form.describe) as HTMLTextAreaElement
  const submit = within(child).getByRole('button', { name: en.habits.createHabit }) as HTMLButtonElement
  expect(title.form).not.toBeNull()
  expect(parentForm).not.toContainElement(title.form)
  expect(submit.form).toBe(title.form)
  expect(submit).toHaveAttribute('form', title.form!.id)
  expect(submit).toHaveAttribute('type', 'submit')
  expect(title.form).not.toContainElement(submit)
}

async function fillHabit(user: ReturnType<typeof userEvent.setup>, child: HTMLElement) {
  await user.click(within(child).getByRole('radio', { name: en.habits.form.typeHabit }))
  await user.type(within(child).getByLabelText(en.habits.form.describe), 'Read every day')
  await user.type(within(child).getByLabelText(en.habits.form.datePhrase), '2030-01-15')
  expect(within(child).getByRole('button', { name: /^Starts on,/ })).toHaveTextContent('2030')
}

describe('nested habit submit ownership through the goal picker', () => {
  it.each(['create', 'edit'] as const)('creates only the deliberate child habit under a %s parent and returns it to goal selection', async (context) => {
    const { user, child, parentForm, parentSubmit, onGoalCreated } = await openNestedHabit(context)
    assertPortalForm(child, parentForm)
    await fillHabit(user, child)
    await user.click(within(child).getByRole('button', { name: en.habits.createHabit }))
    const picker = await screen.findByRole('dialog', { name: en.goals.linkedHabits })
    expect(mocks.createHabit).toHaveBeenCalledExactlyOnceWith({ title: 'Read', emoji: '📖', frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 1, isBadHabit: false, startDate: '2030-01-15', relativeReminders: [] })
    expect(mocks.createGoal).not.toHaveBeenCalled()
    expect(mocks.createSubHabit).not.toHaveBeenCalled()
    expect(parentSubmit, `child mutations: ${mocks.createHabit.mock.calls.length}; parent submissions: ${parentSubmit.mock.calls.length}`).not.toHaveBeenCalled()
    await user.click(within(picker).getByRole('button', { name: 'Read every day', pressed: false }))
    await user.click(within(picker).getByRole('button', { name: en.common.done }))
    expect(await screen.findByLabelText(en.goals.form.title)).toHaveValue('A reading routine')
    await user.click(screen.getByRole('button', { name: en.goals.create }))
    await waitFor(() => expect(onGoalCreated).toHaveBeenCalledExactlyOnceWith('created-goal'))
    expect(mocks.createGoal).toHaveBeenCalledExactlyOnceWith({ title: 'A reading routine', type: 'Standard', targetValue: 12, unit: 'books', habitIds: context === 'edit' ? [existingHabitId, createdHabitId] : [createdHabitId] })
    expect(mocks.createHabit).toHaveBeenCalledTimes(1)
    expect(parentSubmit).not.toHaveBeenCalled()
    expect(within(parentForm).getByLabelText('Parent habit title')).toHaveValue('Retained parent habit')
  })

  it.each(['create', 'edit'] as const)('contains missing type, empty title and invalid date submissions under a %s parent', async (context) => {
    const { user, child, parentSubmit, onGoalCreated } = await openNestedHabit(context)
    const submit = within(child).getByRole('button', { name: en.habits.createHabit })
    await user.click(submit)
    expect(await within(child).findByText(en.habits.form.typeRequired)).toHaveAttribute('role', 'alert')
    expect(mocks.createHabit).not.toHaveBeenCalled()
    expect(parentSubmit).not.toHaveBeenCalled()
    await user.click(within(child).getByRole('radio', { name: en.habits.form.typeHabit }))
    await user.click(submit)
    const title = within(child).getByLabelText(en.habits.form.describe)
    await waitFor(() => expect(title).toHaveFocus())
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(title).toHaveAccessibleDescription()
    expect(mocks.createHabit).not.toHaveBeenCalled()
    expect(parentSubmit).not.toHaveBeenCalled()
    await fillHabit(user, child)
    const date = within(child).getByLabelText(en.habits.form.datePhrase)
    await user.clear(date)
    await user.type(date, 'someday maybe')
    await user.click(submit)
    await waitFor(() => expect(date).toHaveFocus())
    expect(date).toHaveAttribute('aria-invalid', 'true')
    expect(date).toHaveAccessibleDescription(`${en.habits.form.datePhraseUnresolved} ${en.habits.form.habitDateQuestion}`)
    expect(mocks.createHabit).not.toHaveBeenCalled()
    expect(mocks.createGoal).not.toHaveBeenCalled()
    expect(onGoalCreated).not.toHaveBeenCalled()
    expect(parentSubmit).not.toHaveBeenCalled()
    await user.clear(date)
    await user.type(date, '2030-01-15')
    await user.click(submit)
    await screen.findByRole('dialog', { name: en.goals.linkedHabits })
    expect(mocks.createHabit).toHaveBeenCalledTimes(1)
    expect(parentSubmit).not.toHaveBeenCalled()
  })

  it.each(['create', 'edit'] as const)('retains the rejected child draft for a deliberate Enter retry under a %s parent', async (context) => {
    mocks.createHabit.mockRejectedValueOnce(new Error('save failed'))
    const { user, child, parentForm, parentSubmit, onGoalCreated } = await openNestedHabit(context)
    assertPortalForm(child, parentForm)
    await fillHabit(user, child)
    const submit = within(child).getByRole('button', { name: en.habits.createHabit })
    await user.click(submit)
    await waitFor(() => expect(mocks.showError).toHaveBeenCalledOnce())
    expect(mocks.createHabit).toHaveBeenCalledTimes(1)
    expect(within(child).getByLabelText(en.habits.form.describe)).toHaveValue('Read every day')
    expect(within(child).getByRole('radio', { name: en.habits.form.typeHabit })).toHaveAttribute('aria-checked', 'true')
    expect(within(child).getByLabelText(en.habits.form.datePhrase)).toHaveValue('2030-01-15')
    expect(mocks.createGoal).not.toHaveBeenCalled()
    expect(onGoalCreated).not.toHaveBeenCalled()
    expect(parentSubmit).not.toHaveBeenCalled()
    submit.focus()
    await user.keyboard('{Enter}')
    const picker = await screen.findByRole('dialog', { name: en.goals.linkedHabits })
    expect(within(picker).getByRole('button', { name: 'Read every day', pressed: false })).toBeEnabled()
    expect(mocks.createHabit).toHaveBeenCalledTimes(2)
    expect(mocks.createHabit.mock.calls[1]).toEqual(mocks.createHabit.mock.calls[0])
    expect(mocks.createSubHabit).not.toHaveBeenCalled()
    expect(mocks.createGoal).not.toHaveBeenCalled()
    expect(parentSubmit).not.toHaveBeenCalled()
  })

  it.each(['create', 'edit'] as const)('keeps editing then discards only the child draft under a %s parent', async (context) => {
    const { user, child, parentForm, parentSubmit, onGoalCreated } = await openNestedHabit(context)
    await fillHabit(user, child)
    await user.click(within(child).getByRole('button', { name: en.common.cancel }))
    const discard = await screen.findByRole('dialog', { name: en.common.discardChangesTitle })
    await user.click(within(discard).getByRole('button', { name: en.common.keepEditing }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: en.common.discardChangesTitle })).not.toBeInTheDocument())
    expect(within(child).getByLabelText(en.habits.form.describe)).toHaveValue('Read every day')
    expect(within(child).getByLabelText(en.habits.form.datePhrase)).toHaveValue('2030-01-15')
    await user.click(within(child).getByRole('button', { name: en.common.cancel }))
    const confirmation = await screen.findByRole('dialog', { name: en.common.discardChangesTitle })
    await user.click(within(confirmation).getByRole('button', { name: en.common.discardChangesAction }))
    const picker = await screen.findByRole('dialog', { name: en.goals.linkedHabits })
    expect(within(picker).getByText(en.goals.form.habitsInvitation)).toBeInTheDocument()
    await user.click(within(picker).getByRole('button', { name: en.common.done }))
    expect(await screen.findByLabelText(en.goals.form.title)).toHaveValue('A reading routine')
    expect(screen.getByLabelText(en.goals.form.targetValue)).toHaveValue(12)
    expect(screen.getByLabelText(en.goals.form.unit)).toHaveValue('books')
    expect(mocks.createHabit).not.toHaveBeenCalled()
    expect(mocks.createGoal).not.toHaveBeenCalled()
    expect(onGoalCreated).not.toHaveBeenCalled()
    expect(parentSubmit).not.toHaveBeenCalled()
    expect(within(parentForm).getByLabelText('Parent habit title')).toHaveValue('Retained parent habit')
  })

  it.each(['en', 'pt-BR'])('keeps standalone form-associated keyboard creation usable in %s', async (locale) => {
    mocks.locale = locale
    const messages = locale === 'en' ? en : ptBR
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<QueryClientProvider client={queryClient}><CreateHabitModal open onOpenChange={onOpenChange} /></QueryClientProvider>)
    const child = await screen.findByRole('dialog', { name: messages.habits.form.newHabit })
    await user.click(within(child).getByRole('radio', { name: messages.habits.form.typeTask }))
    await user.type(within(child).getByLabelText(messages.habits.form.describe), 'Collect a book')
    await user.type(within(child).getByLabelText(messages.habits.form.datePhrase), '2030-01-15')
    const submit = within(child).getByRole('button', { name: messages.habits.createHabit }) as HTMLButtonElement
    const title = within(child).getByLabelText(messages.habits.form.describe) as HTMLTextAreaElement
    expect(submit.form).toBe(title.form)
    expect(title.form).not.toContainElement(submit)
    submit.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false))
    expect(mocks.createHabit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ title: 'Collect a book', dueDate: '2030-01-15' }))
    expect(mocks.createSubHabit).not.toHaveBeenCalled()
    expect(mocks.createGoal).not.toHaveBeenCalled()
  })
})
