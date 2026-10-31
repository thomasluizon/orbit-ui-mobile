import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { goalKeys } from '@orbit/shared/query'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-push-notification-preferences', () => ({ ensurePushSubscription: vi.fn(), isPushNotificationSupported: () => false }))
vi.mock('@/hooks/use-push-subscriptions', () => ({ usePushSubscriptions: () => ({ count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => ({ data: undefined, isSuccess: false, isFetching: false, isError: false }) }))
vi.mock('@/hooks/use-habits', () => ({
  useUpdateHabit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useHabitDetail: () => ({ data: undefined, isPending: false, error: null, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }), useHasProAccess: () => false }))
vi.mock('@/hooks/use-config', async () => {
  const { DEFAULT_CONFIG } = await import('@orbit/shared/types/config')
  return { useConfig: () => ({ config: DEFAULT_CONFIG }) }
})
vi.mock('@/hooks/use-habit-suggestion', () => ({ useHabitSuggestion: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [], isPending: false }),
  useCreateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSuggestTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [] }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ data: [], isLoading: false }), useCreateGoal: () => ({ mutateAsync: vi.fn(), isPending: false }) }))

function renderEditor() {
  const onOpenChange = vi.fn()
  const client = new QueryClient()
  client.setQueryData(goalKeys.lists(), [])
  render(<QueryClientProvider client={client}><EditHabitModal open onOpenChange={onOpenChange}
    habit={createMockHabit({ title: 'Exercise', frequencyUnit: 'Day', checklistItems: [] })} /></QueryClientProvider>)
  return onOpenChange
}

async function addChecklistItem() {
  const input = screen.getByPlaceholderText('habits.form.checklistPlaceholder')
  fireEvent.change(input, { target: { value: 'Shoes' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByDisplayValue('Shoes')).toBeInTheDocument()
}

const paths = ['escape', 'backdrop', 'close icon', 'cancel'] as const
async function attempt(path: typeof paths[number]) {
  if (path === 'escape') await userEvent.keyboard('{Escape}')
  else if (path === 'backdrop') {
    const backdrop = screen.getAllByRole('dialog').at(-1)!.closest('.orbit-sheet-viewport')!
    await userEvent.click(backdrop)
  } else await userEvent.click(screen.getByRole('button', { name: path === 'cancel' ? 'common.cancel' : 'common.close' }))
}

describe('Edit habit dismissal through the web sheet', () => {
  it.each(paths)('asks before discarding an added checklist item through %s', async path => {
    const onOpenChange = renderEditor()
    await addChecklistItem()
    await attempt(path)
    const discard = await screen.findByRole('dialog', { name: 'common.discardChangesTitle' })
    expect(onOpenChange).not.toHaveBeenCalled()
    await userEvent.click(within(discard).getByRole('button', { name: 'common.keepEditing' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'common.discardChangesTitle' })).not.toBeInTheDocument())
    expect(screen.getByDisplayValue('Shoes')).toBeInTheDocument()
    await attempt(path)
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'common.discardChangesTitle' })).getByRole('button', { name: 'common.discardChangesAction' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(onOpenChange).toHaveBeenCalledOnce()
  })

  it.each(paths)('closes an unchanged editor through %s', async path => {
    const onOpenChange = renderEditor()
    await attempt(path)
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(screen.queryByRole('dialog', { name: 'common.discardChangesTitle' })).not.toBeInTheDocument()
  })
})

describe('Nested tag editor dismissal', () => {
  it.each(paths)('confirms the tag name draft through %s', async path => {
    const onOpenChange = renderEditor()
    await userEvent.click(screen.getByText('habits.form.tags'))
    await userEvent.click(screen.getByRole('button', { name: 'habits.form.newTag' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'habits.form.tagName' }), 'Health')
    await attempt(path)
    const discard = await screen.findByRole('dialog', { name: 'common.discardChangesTitle' })
    await userEvent.click(within(discard).getByRole('button', { name: 'common.keepEditing' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'common.discardChangesTitle' })).not.toBeInTheDocument())
    expect(screen.getByDisplayValue('Health')).toBeInTheDocument()
    await attempt(path)
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'common.discardChangesTitle' })).getByRole('button', { name: 'common.discardChangesAction' }))
    await waitFor(() => expect(screen.queryByDisplayValue('Health')).not.toBeInTheDocument())
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe('Pending checklist input', () => {
  it.each(paths)('guards a checklist item before Add through %s', async path => {
    const onOpenChange = renderEditor()
    const input = screen.getByPlaceholderText('habits.form.checklistPlaceholder')
    fireEvent.change(input, { target: { value: 'Shoes' } })
    await attempt(path)
    expect(await screen.findByRole('dialog', { name: 'common.discardChangesTitle' })).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

it('closes directly after the pending checklist item is cleared', async () => {
  const onOpenChange = renderEditor()
  const input = screen.getByPlaceholderText('habits.form.checklistPlaceholder')
  fireEvent.change(input, { target: { value: 'Shoes' } })
  fireEvent.change(input, { target: { value: '' } })
  await attempt('escape')
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(screen.queryByRole('dialog', { name: 'common.discardChangesTitle' })).not.toBeInTheDocument()
})
