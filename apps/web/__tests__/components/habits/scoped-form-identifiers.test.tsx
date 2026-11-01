import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTranslator } from 'next-intl'
import { createMockConfigResponse, createMockHabit } from '@orbit/shared/__tests__/factories'
import { appConfigSchema } from '@orbit/shared/types/config'
import { goalKeys } from '@orbit/shared/query'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { useUIStore } from '@/stores/ui-store'

const mocks = vi.hoisted(() => ({
  locale: 'en',
  createHabit: vi.fn(),
  createGoal: vi.fn(),
  updateHabit: vi.fn(),
  assignTags: vi.fn(),
  showError: vi.fn(),
  habits: { data: { habitsById: new Map() }, isLoading: false, isError: false, refetch: vi.fn() },
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
  useCreateSubHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateHabit: () => ({ mutateAsync: mocks.updateHabit, isPending: false }),
  useHabitDetail: () => ({ data: undefined, isPending: false, error: null }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mocks.showError, showSuccess: vi.fn(), showInfo: vi.fn() }) }))
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ config: appConfigSchema.parse(createMockConfigResponse()) }) }))
vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => false,
  useProfile: () => ({ profile: { uses24HourClock: true, timeZone: 'UTC', weekStartDay: 1 } }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, toggleReminder: () => void) => ({ requestPermission: vi.fn(), toggleReminder, showNotice: false }) }))
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-date-interpretation', () => ({ useDateInterpretation: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }),
  useCreateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSuggestTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssignTags: () => ({ mutateAsync: mocks.assignTags, isPending: false }),
}))

type Context = 'create' | 'edit'
type User = ReturnType<typeof userEvent.setup>
let queryClient: QueryClient

beforeEach(() => {
  vi.clearAllMocks()
  mocks.locale = 'en'
  useUIStore.setState({ activeView: 'today' })
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(goalKeys.lists(), [])
})

afterEach(() => {
  cleanup()
  queryClient.clear()
})

function phrase(owner: HTMLElement) {
  const field = owner.querySelector('[data-habit-phrase-field]')!
  const title = field.querySelector('textarea')!
  const label = field.parentElement!.querySelector('label')!
  return { title, label }
}

function typeGroup(owner: HTMLElement) {
  return owner.querySelector<HTMLElement>('[role="radiogroup"][aria-required]')!
}

function submitFor(title: HTMLTextAreaElement) {
  const buttons = Array.from(document.querySelectorAll('button')).filter((button) => button.type === 'submit' && button.form === title.form)
  expect(buttons).toHaveLength(1)
  const button = buttons[0]!
  expect(title.form).not.toContainElement(button)
  return button
}

function describedAlert(control: HTMLElement, owner: HTMLFormElement) {
  const tokens = control.getAttribute('aria-describedby')?.split(/\s+/) ?? []
  expect(tokens).toHaveLength(1)
  const matches = Array.from(document.querySelectorAll<HTMLElement>('[id]')).filter((element) => element.id === tokens[0])
  expect(matches, 'Each error reference must resolve exactly once in the document').toHaveLength(1)
  const alert = matches[0]!
  expect(owner, 'The error must belong to the same form as its control').toContainElement(alert)
  expect(alert).toHaveAttribute('role', 'alert')
  expect(alert.textContent.trim()).not.toBe('')
  expect(control).toHaveAccessibleDescription(alert.textContent)
  return alert
}

async function renderParent(context: Context = 'create') {
  const user = userEvent.setup()
  const words = mocks.locale === 'en' ? en : ptBR
  const onOpenChange = vi.fn()
  const habit = createMockHabit({ id: '22200000-0000-4000-8000-000000000001', title: 'Retained parent habit' })
  const root = <QueryClientProvider client={queryClient}>
    {context === 'create'
      ? <CreateHabitModal open presentation="screen" initialTitle="Retained parent habit" onOpenChange={onOpenChange} />
      : <EditHabitModal open habit={habit} onOpenChange={onOpenChange} />}
  </QueryClientProvider>
  const view = render(root)
  const parent = context === 'create'
    ? view.container.querySelector<HTMLElement>('[data-habit-create-screen]')!
    : await screen.findByRole('dialog', { name: words.habits.editHabit })
  const { title } = phrase(parent)
  await waitFor(() => expect(title).toHaveValue('Retained parent habit'))
  expect(title).toHaveAccessibleName(context === 'create' ? words.habits.form.taskDescribe : words.habits.form.describe)
  return { user, words, parent, root, view, onOpenChange }
}

async function openChild(parent: HTMLElement, user: User, words: typeof en) {
  const details = within(parent).getByRole('button', { name: words.habits.form.moreDetails })
  if (details.getAttribute('aria-expanded') !== 'true') await user.click(details)
  await user.click(within(parent).getByRole('button', { name: new RegExp(`^${words.habits.form.goals}`) }))
  const goals = await screen.findByRole('dialog', { name: words.habits.form.goals })
  await user.click(within(goals).getByRole('button', { name: words.habits.form.createGoal }))
  const goal = await screen.findByRole('dialog', { name: words.goals.create })
  await user.click(within(goal).getByRole('button', { name: new RegExp(`^${words.goals.linkedHabits}`) }))
  const picker = await screen.findByRole('dialog', { name: words.goals.linkedHabits })
  expect(within(picker).getByText(words.goals.form.habitsInvitation)).toBeInTheDocument()
  await user.click(within(picker).getByRole('button', { name: words.habits.createHabit }))
  const child = await screen.findByRole('dialog', { name: words.habits.form.newTask })
  expect(phrase(parent).title.form).not.toContainElement(phrase(child).title.form)
  expect(phrase(child).title.form).not.toBe(phrase(parent).title.form)
  return child
}

function expectNoWrites() {
  expect(mocks.createHabit).not.toHaveBeenCalled()
  expect(mocks.createGoal).not.toHaveBeenCalled()
  expect(mocks.updateHabit).not.toHaveBeenCalled()
  expect(mocks.assignTags).not.toHaveBeenCalled()
}

describe('habit form identifiers across retained real owners', () => {
  it('disables the open timing sheet throughout an edit request', async () => {
    let finish!: () => void
    mocks.updateHabit.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    const { parent, user, words } = await renderParent('edit')
    const title = phrase(parent).title
    await user.click(within(parent).getByText(words.habits.form.timingAndReminder, { exact: true }))
    const timing = await screen.findByRole('dialog', { name: words.habits.form.timingAndReminder })
    const reminder = within(timing).getByRole('switch', { name: words.habits.form.reminder })
    if (reminder.getAttribute('aria-checked') !== 'true') await user.click(reminder)
    await user.click(within(timing).getByRole('radio', { name: words.habits.form.repeatEvery }))
    const allDay = within(timing).getByRole('switch', { name: words.habits.form.repeatAllDay })
    expect(reminder).toBeEnabled()
    expect(allDay).toBeEnabled()
    fireEvent.submit(title.form!)
    await waitFor(() => expect(mocks.updateHabit).toHaveBeenCalledOnce())
    expect(reminder).toBeDisabled()
    expect(allDay).toBeDisabled()
    expect(within(timing).getByRole('button', { name: words.common.done })).toBeEnabled()
    await act(async () => finish())
    await waitFor(() => expect(reminder).toBeEnabled())
    expect(allDay).toBeEnabled()
  })

  it.each([
    ['create', 'en'], ['create', 'pt-BR'], ['edit', 'en'], ['edit', 'pt-BR'],
  ] as const)('owns the visible title label in a %s parent and child in %s', async (context, locale) => {
    mocks.locale = locale
    const { parent, user, words } = await renderParent(context)
    const retained = phrase(parent)
    const child = await openChild(parent, user, words)
    const nested = phrase(child)
    expect(nested.label.control, 'The visible child label must own the child textarea').toBe(nested.title)
    expect(retained.label.control).toBe(retained.title)
    expect(nested.title.id).not.toBe(retained.title.id)
    expect(nested.title.labels).toHaveLength(1)
    expect(nested.title).toHaveAccessibleName(words.habits.form.taskDescribe)
    expect(nested.title).not.toHaveAttribute('aria-label')
    expect(nested.title).not.toHaveAttribute('aria-describedby')
    expectNoWrites()
  })

  it('focuses the child textarea by clicking its real visible label', async () => {
    const { parent, user, words } = await renderParent()
    const child = await openChild(parent, user, words)
    const { title, label } = phrase(child)
    await user.click(label)
    expect(title).toHaveFocus()
    expect(phrase(parent).title).not.toHaveFocus()
    expectNoWrites()
  })

  it('focuses empty child title validation through its registered field ref', async () => {
    const { parent, user, words } = await renderParent()
    const child = await openChild(parent, user, words)
    await user.click(within(child).getByRole('radio', { name: `${words.habits.form.typeTask}${words.habits.form.typeTaskHint}` }))
    const { title } = phrase(child)
    await user.click(submitFor(title))
    await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'))
    await waitFor(() => expect(title).toHaveFocus())
    expect(phrase(parent).title).not.toHaveFocus()
    expectNoWrites()
  })

  it('focuses the child type group when the default Task receives a repeating phrase', async () => {
    const { parent, user, words } = await renderParent()
    const child = await openChild(parent, user, words)
    await user.type(phrase(child).title, 'Read a book')
    const date = within(child).getByRole('textbox', { name: words.habits.form.datePhrase })
    await user.clear(date)
    await user.type(date, 'every week')
    await user.click(submitFor(phrase(child).title))
    await waitFor(() => expect(within(child).getByRole('radio', { name: `${words.habits.form.typeTask}${words.habits.form.typeTaskHint}` })).toHaveFocus())
    expect(describedAlert(date, phrase(child).title.form!)).toHaveTextContent(words.habits.form.recurrenceRequiresHabit)
    expect(typeGroup(parent).contains(document.activeElement)).toBe(false)
    expectNoWrites()
  })

  it.each(['create', 'edit'] as const)('keeps simultaneous title errors inside their own %s and child forms when one clears', async (context) => {
    const { parent, user, words } = await renderParent(context)
    await user.click(within(parent).getByRole('radio', { name: `${words.habits.form.typeTask}${words.habits.form.typeTaskHint}` }))
    const retained = phrase(parent).title
    await user.clear(retained)
    await user.click(submitFor(retained))
    await waitFor(() => expect(retained).toHaveAttribute('aria-invalid', 'true'))
    const parentAlert = describedAlert(retained, retained.form!)
    const child = await openChild(parent, user, words)
    await user.click(within(child).getByRole('radio', { name: `${words.habits.form.typeTask}${words.habits.form.typeTaskHint}` }))
    const nested = phrase(child).title
    await user.click(submitFor(nested))
    await waitFor(() => expect(nested).toHaveAttribute('aria-invalid', 'true'))
    const childAlert = describedAlert(nested, nested.form!)
    expect(childAlert.id).not.toBe(parentAlert.id)
    expect(describedAlert(retained, retained.form!)).toBe(parentAlert)
    await user.type(nested, 'Collect a book')
    await user.clear(within(child).getByRole('textbox', { name: words.habits.form.datePhrase }))
    await user.type(within(child).getByRole('textbox', { name: words.habits.form.datePhrase }), 'someday maybe')
    await user.click(submitFor(nested))
    await waitFor(() => expect(nested).not.toHaveAttribute('aria-describedby'))
    expect(childAlert).not.toBeInTheDocument()
    expect(describedAlert(retained, retained.form!)).toBe(parentAlert)
    expectNoWrites()
  })

  it('keeps simultaneous date errors local while the child chooses Habit and revalidates', async () => {
    const { parent, user, words } = await renderParent()
    const parentDate = within(parent).getByRole('textbox', { name: words.habits.form.datePhrase })
    await user.clear(parentDate)
    await user.type(parentDate, 'every week')
    await user.click(submitFor(phrase(parent).title))
    const parentAlert = describedAlert(parentDate, phrase(parent).title.form!)
    const child = await openChild(parent, user, words)
    const childDate = within(child).getByRole('textbox', { name: words.habits.form.datePhrase })
    await user.clear(childDate)
    await user.type(childDate, 'every week')
    await user.click(submitFor(phrase(child).title))
    const childAlert = describedAlert(childDate, phrase(child).title.form!)
    expect(childAlert.id).not.toBe(parentAlert.id)
    expect(describedAlert(parentDate, phrase(parent).title.form!)).toBe(parentAlert)
    await user.click(within(child).getByRole('radio', { name: `${words.habits.form.typeHabit}${words.habits.form.typeHabitHint}` }))
    await user.click(submitFor(phrase(child).title))
    await waitFor(() => expect(phrase(child).title).toHaveAttribute('aria-invalid', 'true'))
    expect(childDate).not.toHaveAttribute('aria-describedby')
    expect(childAlert).not.toBeInTheDocument()
    expect(describedAlert(parentDate, phrase(parent).title.form!)).toBe(parentAlert)
    expectNoWrites()
  })

  it('retains parent identifiers through rerenders, child schedule changes, discard and reopening', async () => {
    const { parent, user, words, root, view } = await renderParent()
    const parentDate = within(parent).getByRole('textbox', { name: words.habits.form.datePhrase })
    await user.clear(parentDate)
    await user.type(parentDate, 'every week')
    await user.click(submitFor(phrase(parent).title))
    const retained = phrase(parent)
    const parentId = retained.title.id
    const parentError = describedAlert(parentDate, retained.title.form!)
    const parentErrorId = parentError.id
    const child = await openChild(parent, user, words)
    const nested = phrase(child)
    const childId = nested.title.id
    await user.type(nested.title, 'Read every day')
    await user.click(within(child).getByRole('radio', { name: `${words.habits.form.typeHabit}${words.habits.form.typeHabitHint}` }))
    await user.click(within(child).getByRole('radio', { name: `${words.habits.form.noSchedule}${words.habits.form.noScheduleHint}` }))
    await user.click(within(child).getByRole('radio', { name: `${words.habits.form.typeTask}${words.habits.form.typeTaskHint}` }))
    view.rerender(root)
    expect(phrase(child).title.id).toBe(childId)
    expect(nested.label.control).toBe(nested.title)
    await user.click(within(child).getByRole('button', { name: words.common.cancel }))
    const keep = await screen.findByRole('dialog', { name: words.common.discardChangesTitle })
    await user.click(within(keep).getByRole('button', { name: words.common.keepEditing }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: words.common.discardChangesTitle })).not.toBeInTheDocument())
    expect(phrase(child).title.id).toBe(childId)
    await user.click(within(child).getByRole('button', { name: words.common.cancel }))
    const discard = await screen.findByRole('dialog', { name: words.common.discardChangesTitle })
    await user.click(within(discard).getByRole('button', { name: words.common.discardChangesAction }))
    const picker = await screen.findByRole('dialog', { name: words.goals.linkedHabits })
    await user.click(within(picker).getByRole('button', { name: words.habits.createHabit }))
    const reopened = await screen.findByRole('dialog', { name: words.habits.form.newTask })
    expect(phrase(reopened).label.control).toBe(phrase(reopened).title)
    expect(phrase(reopened).title.id).not.toBe(parentId)
    expect(phrase(parent).title).toBe(retained.title)
    expect(retained.title.id).toBe(parentId)
    expect(retained.label.control).toBe(retained.title)
    expect(retained.title).toHaveValue('Retained parent habit')
    expect(describedAlert(parentDate, retained.title.form!)).toBe(parentError)
    expect(parentError.id).toBe(parentErrorId)
    expectNoWrites()
  })
})
