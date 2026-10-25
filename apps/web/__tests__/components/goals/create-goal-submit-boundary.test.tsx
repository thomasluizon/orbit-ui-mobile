import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTranslator } from 'next-intl'
import { createMockGoal, createMockHabit } from '@orbit/shared/__tests__/factories'
import { goalKeys } from '@orbit/shared/query'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'
import { GoalLinkingField } from '@/components/habits/goal-linking-field'

const readingId = '22200000-0000-4000-8000-000000000001'
const walkingId = '22200000-0000-4000-8000-000000000002'
const mocks = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: 'created-goal' }),
  locale: 'en',
  habits: { data: { habitsById: new Map<string, ReturnType<typeof createMockHabit>>() }, isLoading: false, isError: false, refetch: vi.fn() },
}))

vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useTranslations: () => createTranslator({ locale: mocks.locale, messages: mocks.locale === 'en' ? en : ptBR }),
  useLocale: () => mocks.locale,
}))
vi.mock('@/hooks/use-goals', () => ({ useCreateGoal: () => ({ mutateAsync: mocks.create, isPending: false }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => mocks.habits }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <input aria-label="Deadline" type="date" value={value} onChange={(event) => onChange(event.target.value)} />,
}))

let queryClient: QueryClient

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue({ id: 'created-goal' })
  mocks.locale = 'en'
  mocks.habits.data.habitsById = new Map([
    [readingId, createMockHabit({ id: readingId, title: 'Read' })],
    [walkingId, createMockHabit({ id: walkingId, title: 'Walk' })],
  ])
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(goalKeys.lists(), [])
})

afterEach(() => {
  cleanup()
  queryClient.clear()
})

function renderUnderHabitForm(child: ReactNode) {
  const parentSubmit = vi.fn()
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <form aria-label="Habit draft" onSubmit={(event) => { event.preventDefault(); parentSubmit() }}>
        <input aria-label="Habit title" defaultValue="Retained habit draft" required />
        {child}
      </form>
    </QueryClientProvider>,
  )
  const parentForm = view.container.querySelector('form')!
  return { user, parentSubmit, parentForm }
}

function assertPortalForm(parentForm: HTMLFormElement) {
  const dialog = screen.getByRole('dialog', { name: en.goals.create })
  const title = within(dialog).getByLabelText('Title') as HTMLInputElement
  const submit = within(dialog).getByRole('button', { name: en.goals.create }) as HTMLButtonElement
  expect(title.form).not.toBeNull()
  expect(parentForm).not.toContainElement(title.form)
  expect(submit.form).toBe(title.form)
  expect(submit).toHaveAttribute('form', title.form!.id)
  expect(title.form).not.toContainElement(submit)
  expect(submit).toHaveAttribute('type', 'submit')
}

async function fillGoal(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Title'), 'Read every day')
  await user.type(screen.getByLabelText('Quantity'), '12')
  await user.type(screen.getByLabelText('Unit'), 'books')
}

async function openLinkedGoal(habitId?: string, populated = false) {
  const onGoalCreated = vi.fn()
  const onToggleGoal = vi.fn()
  if (populated) queryClient.setQueryData(goalKeys.lists(), [createMockGoal({ id: 'existing-goal', title: 'Existing goal' })])
  const harness = renderUnderHabitForm(
    <GoalLinkingField habitId={habitId} selectedGoalIds={populated ? ['existing-goal'] : []} atGoalLimit={false} onToggleGoal={onToggleGoal} onGoalCreated={onGoalCreated} />,
  )
  await harness.user.click(screen.getByRole('button', { name: /^Goals/ }))
  const picker = await screen.findByRole('dialog', { name: 'Goals' })
  if (populated) expect(within(picker).getByRole('button', { name: 'Existing goal', pressed: true })).toBeEnabled()
  else expect(within(picker).getByText(en.habits.form.goalInvitation)).toBeInTheDocument()
  await harness.user.click(within(picker).getByRole('button', { name: en.goals.create }))
  await screen.findByLabelText('Title')
  assertPortalForm(harness.parentForm)
  expect(harness.parentSubmit).not.toHaveBeenCalled()
  expect(mocks.create).not.toHaveBeenCalled()
  return { ...harness, onGoalCreated, onToggleGoal }
}

async function openHabitPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Linked habits/ }))
  return screen.findByRole('dialog', { name: en.goals.linkedHabits })
}

describe('goal submit ownership through the sheet portal', () => {
  it('submits the portaled goal without submitting its React ancestor habit form', async () => {
    const onCreated = vi.fn()
    const { user, parentForm, parentSubmit } = renderUnderHabitForm(
      <CreateGoalSheet open onClose={vi.fn()} onCreated={onCreated} initialHabitIds={[readingId, walkingId]} />,
    )
    assertPortalForm(parentForm)
    await fillGoal(user)
    await user.click(screen.getByRole('button', { name: en.goals.create }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('created-goal', [readingId, walkingId]))
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ title: 'Read every day', type: 'Standard', targetValue: 12, unit: 'books', habitIds: [readingId, walkingId] })
    expect(parentSubmit, `goal mutations: ${mocks.create.mock.calls.length}; parent submissions: ${parentSubmit.mock.calls.length}`).not.toHaveBeenCalled()
  })

  it.each([
    { context: 'create', habitId: undefined, populated: false },
    { context: 'edit', habitId: readingId, populated: false },
    { context: 'create', habitId: undefined, populated: true },
    { context: 'edit', habitId: readingId, populated: true },
  ])('submits only the goal from the $context entry, populated picker: $populated', async ({ habitId, populated }) => {
    const { user, parentSubmit, parentForm, onGoalCreated, onToggleGoal } = await openLinkedGoal(habitId, populated)
    await fillGoal(user)
    const picker = await openHabitPicker(user)
    expect(within(picker).getByRole('button', { name: 'Read', pressed: Boolean(habitId) })).toBeEnabled()
    await user.click(within(picker).getByRole('button', { name: 'Done' }))
    await screen.findByLabelText('Title')
    await user.click(screen.getByRole('button', { name: en.goals.create }))
    await waitFor(() => expect(onGoalCreated).toHaveBeenCalledExactlyOnceWith('created-goal'))
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ title: 'Read every day', type: 'Standard', targetValue: 12, unit: 'books', habitIds: habitId ? [habitId] : [] })
    expect(onToggleGoal).not.toHaveBeenCalled()
    expect(parentSubmit).not.toHaveBeenCalled()
    expect(within(parentForm).getByLabelText('Habit title')).toHaveValue('Retained habit draft')
  })

  it('focuses each invalid goal field without submitting a valid parent draft', async () => {
    const { user, parentSubmit, onGoalCreated } = await openLinkedGoal(readingId)
    for (const [label, value] of [['Quantity', '12'], ['Unit', 'books'], ['Title', 'Read every day']]) {
      await user.click(screen.getByRole('button', { name: en.goals.create }))
      const invalid = screen.getByLabelText(label!)
      await waitFor(() => expect(invalid).toHaveFocus())
      expect(invalid).toHaveAttribute('aria-invalid', 'true')
      expect(invalid).toHaveAccessibleDescription()
      await user.type(invalid, value!)
    }
    expect(mocks.create).not.toHaveBeenCalled()
    expect(onGoalCreated).not.toHaveBeenCalled()
    expect(parentSubmit).not.toHaveBeenCalled()
  })

  it('retains a rejected goal draft and its selected habits for a deliberate keyboard retry', async () => {
    mocks.create.mockRejectedValueOnce(new Error('save failed'))
    const { user, parentSubmit, onGoalCreated } = await openLinkedGoal(readingId)
    await fillGoal(user)
    await user.click(screen.getByRole('button', { name: en.goals.create }))
    expect(await screen.findByRole('alert')).toHaveTextContent(en.goals.form.createError)
    expect(screen.getByLabelText('Title')).toHaveValue('Read every day')
    expect(screen.getByLabelText('Quantity')).toHaveValue(12)
    expect(screen.getByLabelText('Unit')).toHaveValue('books')
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(onGoalCreated).not.toHaveBeenCalled()
    expect(parentSubmit).not.toHaveBeenCalled()
    screen.getByRole('button', { name: en.goals.create }).focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(onGoalCreated).toHaveBeenCalledExactlyOnceWith('created-goal'))
    expect(mocks.create).toHaveBeenCalledTimes(2)
    for (const [request] of mocks.create.mock.calls) {
      expect(request).toEqual({ title: 'Read every day', type: 'Standard', targetValue: 12, unit: 'books', habitIds: [readingId] })
    }
    expect(parentSubmit).not.toHaveBeenCalled()
  })

  it('keeps editing through cancel and picker actions, then discards without either submit', async () => {
    const { user, parentSubmit, onGoalCreated } = await openLinkedGoal(readingId)
    await fillGoal(user)
    await user.click(screen.getByRole('button', { name: en.common.cancel }))
    const discard = await screen.findByRole('dialog', { name: en.common.discardChangesTitle })
    await user.click(within(discard).getByRole('button', { name: en.common.keepEditing }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: en.common.discardChangesTitle })).not.toBeInTheDocument())
    expect(screen.getByLabelText('Title')).toHaveValue('Read every day')
    const picker = await openHabitPicker(user)
    expect(within(picker).getByRole('button', { name: 'Read', pressed: true })).toBeEnabled()
    await user.click(within(picker).getByRole('button', { name: 'Walk', pressed: false }))
    await user.click(within(picker).getByRole('button', { name: 'Done' }))
    await screen.findByLabelText('Title')
    await user.click(screen.getByRole('button', { name: en.common.cancel }))
    const confirmation = await screen.findByRole('dialog', { name: en.common.discardChangesTitle })
    await user.click(within(confirmation).getByRole('button', { name: en.common.discardChangesAction }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: en.goals.create })).not.toBeInTheDocument())
    expect(mocks.create).not.toHaveBeenCalled()
    expect(onGoalCreated).not.toHaveBeenCalled()
    expect(parentSubmit).not.toHaveBeenCalled()
  })

  it('honors explicit deselection of the starting habit without saving its parent', async () => {
    const { user, parentSubmit, onGoalCreated } = await openLinkedGoal(readingId)
    await fillGoal(user)
    const picker = await openHabitPicker(user)
    await user.click(within(picker).getByRole('button', { name: 'Read', pressed: true }))
    await user.click(within(picker).getByRole('button', { name: 'Done' }))
    await screen.findByLabelText('Title')
    await user.click(screen.getByRole('button', { name: en.goals.create }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: en.goals.create })).not.toBeInTheDocument())
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ habitIds: [] }))
    expect(onGoalCreated).not.toHaveBeenCalled()
    expect(parentSubmit).not.toHaveBeenCalled()
  })

  it.each(['en', 'pt-BR'])('retains standalone form-associated keyboard submission in %s', async (locale) => {
    mocks.locale = locale
    const messages = locale === 'en' ? en : ptBR
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CreateGoalSheet open onClose={onClose} />)
    await user.type(screen.getByLabelText(messages.goals.form.title), 'Read every day')
    await user.type(screen.getByLabelText(messages.goals.form.targetValue), '12')
    await user.type(screen.getByLabelText(messages.goals.form.unit), 'books')
    const submit = screen.getByRole('button', { name: messages.goals.create }) as HTMLButtonElement
    expect(submit.form).toBe((screen.getByLabelText(messages.goals.form.title) as HTMLInputElement).form)
    submit.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ title: 'Read every day', type: 'Standard', targetValue: 12, unit: 'books', habitIds: [] })
  })
})
