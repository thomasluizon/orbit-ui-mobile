import React from 'react'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verificationValidationResponses } from '@orbit/shared/test-support/validation-fixtures'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

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
vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => true,
  useProfile: () => ({ profile: { hasProAccess: true, uses24HourClock: true, timeZone: 'UTC' } }),
}))
vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({ config: { features: { 'habits.subHabits': { enabled: true, planRequirement: 'Pro' } } } }),
}))
vi.mock('@/hooks/use-tags', () => ({
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

async function renderSheet(mode: 'create' | 'edit') {
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const element = (open: boolean) => <QueryClientProvider client={client}>
    {mode === 'create'
      ? <CreateHabitModal open={open} onOpenChange={onClose} initialTitle={habit.title} />
      : <EditHabitModal open={open} onOpenChange={onClose} habit={habit} />}
  </QueryClientProvider>
  let view!: ReturnType<typeof render>
  await act(async () => { view = render(element(true)) })
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
    expect(screen.getByRole('alert')).toHaveTextContent('habits.form.titleRequired')
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