import React from 'react'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verificationValidationResponses } from '@orbit/shared/test-support/validation-fixtures'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mutation = vi.hoisted(() => vi.fn())
const showError = vi.hoisted(() => vi.fn())
let currentForm!: import('@/hooks/use-habit-form').HabitFormHelpers
vi.mock('@/components/habits/habit-form-fields', async (original) => {
  const actual = await original<typeof import('@/components/habits/habit-form-fields')>()
  return { HabitFormFields: (props: React.ComponentProps<typeof actual.HabitFormFields>) => {
    currentForm = props.formHelpers
    return <actual.HabitFormFields {...props} />
  } }
})
const habit = createMockHabit({ title: 'Walk every day' })

vi.mock('@/hooks/use-habits', () => ({
  useCreateHabit: () => useMutation({ mutationFn: mutation }),
  useCreateSubHabit: () => useMutation({ mutationFn: mutation }),
  useUpdateHabit: () => useMutation({ mutationFn: mutation }),
  useHabitDetail: () => ({ data: null, isPending: false, error: null }),
}))
vi.mock('@/hooks/use-date-interpretation', () => ({ useDateInterpretation: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => true,
  useProfile: () => ({ profile: { hasProAccess: true, uses24HourClock: true, timeZone: 'UTC' } }),
}))
vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({ config: { features: { 'sub_habits': { enabled: true, planRequirement: 'Pro' } } } }),
}))
vi.mock('@/hooks/use-tags', () => ({ useSuggestTags: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useTags: () => ({ tags: [] }),
  useCreateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useAssignTags: () => ({ isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError, showSuccess: vi.fn(), showInfo: vi.fn() }),
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/habits/habit-checklist', () => ({ HabitChecklist: () => null }))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => null }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => null }))
vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({ ReminderSection: () => null }))
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: () => null }))
vi.mock('@/components/habits/habit-form-fields/slip-alert-section', () => ({ SlipAlertSection: () => null }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: () => null }))
vi.mock('@/components/ui/date-field', () => ({ DateField: () => null }))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))

async function renderSheet(mode: 'create' | 'edit', selectedHabit = habit) {
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const element = (open: boolean) => <QueryClientProvider client={client}>
    {mode === 'create'
      ? <CreateHabitModal open={open} onOpenChange={onClose} initialTitle={habit.title} />
      : <EditHabitModal open={open} onOpenChange={onClose} habit={selectedHabit} />}
  </QueryClientProvider>
  let view!: ReturnType<typeof render>
  await act(async () => { view = render(element(true)) })
  if (mode === 'create') await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'habits.form.typeHabit' })))
  return { onClose, setOpen: async (open: boolean) => { await act(async () => view.rerender(element(open))) }, title: screen.getByRole('textbox', { name: 'habits.form.describe' }), submit: screen.getByRole('button', { name: mode === 'create' ? 'habits.createHabit' : 'common.save' }) }
}

describe.each(['create', 'edit'] as const)('habit %s submit', (mode) => {
  beforeEach(() => { vi.resetAllMocks() })

  it('discards backend errors and focus requests when a persistent owner opens a matching draft', async () => {
    const messages = verificationValidationResponses.en.errors.Code
    mutation.mockRejectedValue({ errors: { Title: [...messages] } })
    const { title, submit, setOpen } = await renderSheet(mode)
    await act(async () => fireEvent.change(title, { target: { value: habit.title } }))
    await act(async () => fireEvent.click(submit))
    await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'))
    expect(currentForm.backendFocusRequest).toBeGreaterThan(0)
    await setOpen(false)
    await setOpen(true)
    const nextTitle = screen.getByRole('textbox', { name: 'habits.form.describe' })
    expect(nextTitle).toHaveValue(habit.title)
    expect(nextTitle).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(messages.join('\n'))).not.toBeInTheDocument()
    expect(currentForm.backendFocusRequest).toBe(0)
    expect(currentForm.backendFocusField).toBeUndefined()
  })

  it.each(['', '   '])('focuses an invalid title and shows its inline error after submit (%j)', async (value) => {
    const { title, submit } = await renderSheet(mode)
    await act(async () => fireEvent.change(title, { target: { value } }))
    expect(submit).toBeEnabled()
    await act(async () => fireEvent.click(submit))
    await waitFor(() => expect(title).toHaveFocus())
    const error = document.getElementById(title.getAttribute('aria-describedby') ?? '')
    expect(error).toHaveTextContent('habits.form.titleRequired')
    expect(error).toHaveAttribute('role', 'alert')
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(mutation).not.toHaveBeenCalled()
  })

  it('keeps its label and shows a spinner only while the request runs', async () => {
    let finish!: () => void
    mutation.mockImplementation(() => new Promise((resolve) => { finish = () => resolve(habit) }))
    const { title, submit, onClose } = await renderSheet(mode)
    await act(async () => fireEvent.change(title, { target: { value: 'Walk every day' } }))
    await act(async () => fireEvent.click(submit))
    await waitFor(() => expect(submit).toHaveAttribute('aria-busy', 'true'))
    expect(submit).toBeDisabled()
    expect(submit).toHaveTextContent(mode === 'create' ? 'habits.createHabit' : 'common.save')
    expect(submit.querySelector('svg')).not.toBeNull()
    await act(async () => fireEvent.click(submit))
    expect(mutation).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    await waitFor(() => expect(submit).toBeEnabled())
    expect(submit).not.toHaveAttribute('aria-busy')
    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('allows retry after the request fails', async () => {
    mutation.mockRejectedValue(new Error('offline'))
    const { title, submit, onClose } = await renderSheet(mode)
    await act(async () => fireEvent.change(title, { target: { value: 'Walk every day' } }))
    await act(async () => fireEvent.click(submit))
    await waitFor(() => expect(showError).toHaveBeenCalled())
    await waitFor(() => expect(submit).toBeEnabled())
    expect(onClose).not.toHaveBeenCalled()
    mutation.mockResolvedValue(habit)
    await act(async () => fireEvent.click(submit))
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(false))
  })
})

describe('habit edit start date', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it.each([
    ['2026-01-01', '2026-01-01'],
    ['2026-08-20', '2026-08-20'],
    ['2026-08-28', '2026-08-28'],
    [undefined, '2026-08-29'],
  ])('shows the API start date %s with legacy timestamp compatibility', async (startDate, expected) => {
    const selectedHabit = { ...habit, startDate, createdAtUtc: '2026-08-29T00:30:00Z' }
    await renderSheet('edit', selectedHabit)
    expect(currentForm.form.getValues('dueDate')).toBe(expected)
  })
})

describe('mounted habit form identifiers', () => {
  beforeEach(() => { vi.resetAllMocks() })

  async function renderOwners(secondMode: 'create' | 'edit') {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    await act(async () => {
      render(<QueryClientProvider client={client}>
        <section aria-label="First owner"><CreateHabitModal open presentation="screen" onOpenChange={vi.fn()} initialTitle={habit.title} /></section>
        <section aria-label="Second owner">{secondMode === 'create'
          ? <CreateHabitModal open presentation="screen" onOpenChange={vi.fn()} initialTitle={habit.title} />
          : <EditHabitModal open onOpenChange={vi.fn()} habit={habit} />}</section>
      </QueryClientProvider>)
    })
    return [screen.getByRole('region', { name: 'First owner' }), screen.getByRole('region', { name: 'Second owner' })] as const
  }

  it.each(['create', 'edit'] as const)('keeps phrase labels and focus with their owner beside %s', async (secondMode) => {
    const owners = await renderOwners(secondMode)
    const user = userEvent.setup()
    for (const owner of owners) {
      const title = owner.querySelector<HTMLTextAreaElement>('textarea')!
      const label = within(owner).getByText('habits.form.describe', { selector: 'label' }) as HTMLLabelElement
      expect(label.control).toBe(title)
      expect(title).toHaveAccessibleName('habits.form.describe')
      await user.click(label)
      expect(title).toHaveFocus()
    }
  })

  it.each(['create', 'edit'] as const)('keeps phrase errors with their owner beside %s', async (secondMode) => {
    const owners = await renderOwners(secondMode)
    const user = userEvent.setup()
    for (const owner of owners) {
      const title = owner.querySelector<HTMLTextAreaElement>('textarea')!
      await user.click(within(owner).getByRole('radio', { name: 'habits.form.typeTask' }))
      await user.clear(title)
      await user.click(within(owner).getByRole('button', { name: owner === owners[0] || secondMode === 'create' ? 'habits.createHabit' : 'common.save' }))
      await waitFor(() => expect(title).toHaveAttribute('aria-invalid', 'true'))
      const error = document.getElementById(title.getAttribute('aria-describedby') ?? '')
      expect(error).toHaveTextContent('habits.form.titleRequired')
      expect(owner).toContainElement(error)
    }
    expect(mutation).not.toHaveBeenCalled()
  })

  it('keeps simultaneous required-type errors attached as another owner recovers', async () => {
    const owners = await renderOwners('create')
    for (const owner of owners) {
      await act(async () => fireEvent.click(within(owner).getByRole('button', { name: 'habits.createHabit' })))
    }
    const groups = owners.map((owner) => within(owner).getByRole('radiogroup'))
    const errorIds = groups.map((group) => group.getAttribute('aria-describedby'))
    for (const [index, group] of groups.entries()) {
      expect(group).toHaveAttribute('aria-invalid', 'true')
      const error = document.getElementById(errorIds[index] ?? '')
      expect(error).toHaveTextContent('habits.form.typeRequired')
      expect(owners[index]).toContainElement(error)
    }
    await act(async () => fireEvent.click(within(owners[0]).getByRole('radio', { name: 'habits.form.typeHabit' })))
    expect(groups[0]).not.toHaveAttribute('aria-describedby')
    expect(groups[1]).toHaveAttribute('aria-describedby', errorIds[1])
    expect(document.getElementById(errorIds[1] ?? '')).toHaveTextContent('habits.form.typeRequired')
    expect(mutation).not.toHaveBeenCalled()
  })
})
