import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditNameSheet } from '@/app/(app)/profile/_components/edit-name-sheet'
import { ChecklistTemplates } from '@/components/habits/checklist-templates'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Alex' }, patchProfile: vi.fn(), invalidate: vi.fn() }) }))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [] }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))

async function openForm(form: 'name' | 'template', dirty: boolean) {
  const onOpenChange = vi.fn()
  render(<QueryClientProvider client={new QueryClient()}>{form === 'name'
    ? <EditNameSheet open onOpenChange={onOpenChange} />
    : <ChecklistTemplates items={[{ text: 'Shoes', isChecked: false }]} onLoad={vi.fn()} />}</QueryClientProvider>)
  if (form === 'name') {
    if (dirty) fireEvent.change(screen.getByRole('textbox', { name: 'profile.editName.label' }), { target: { value: 'Alex edited' } })
  } else {
    await userEvent.click(screen.getByText('habits.form.useTemplate'))
    await userEvent.click(screen.getByRole('button', { name: 'habits.form.saveCurrentList' }))
    if (dirty) fireEvent.change(screen.getByPlaceholderText('habits.form.templateNamePlaceholder'), { target: { value: 'Workout' } })
  }
  return onOpenChange
}

const paths = ['escape', 'backdrop', 'close icon', 'cancel'] as const
async function attempt(path: typeof paths[number], form: 'name' | 'template') {
  if (path === 'escape') await userEvent.keyboard('{Escape}')
  else if (path === 'backdrop') await userEvent.click(document.querySelector('.orbit-sheet-backdrop')!)
  else if (path === 'cancel' && form === 'name') await userEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
  else {
    const close = screen.getAllByRole('button', { name: 'common.close' })
    await userEvent.click(close[path === 'cancel' ? close.length - 1 : 0]!)
  }
}

describe.each(['name', 'template'] as const)('%s form dismissal', form => {
  it.each(paths)('confirms unsaved input through %s', async path => {
    const onOpenChange = await openForm(form, true)
    await attempt(path, form)
    const discard = await screen.findByRole('dialog', { name: 'common.discardChangesTitle' })
    expect(onOpenChange).not.toHaveBeenCalled()
    await userEvent.click(within(discard).getByRole('button', { name: 'common.keepEditing' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'common.discardChangesTitle' })).not.toBeInTheDocument())
    expect(screen.getByDisplayValue(form === 'name' ? 'Alex edited' : 'Workout')).toBeInTheDocument()
    await attempt(path, form)
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'common.discardChangesTitle' })).getByRole('button', { name: 'common.discardChangesAction' }))
    if (form === 'name') await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    else await waitFor(() => expect(screen.queryByPlaceholderText('habits.form.templateNamePlaceholder')).not.toBeInTheDocument())
  })

  it.each(paths)('closes clean input through %s', async path => {
    const onOpenChange = await openForm(form, false)
    await attempt(path, form)
    expect(screen.queryByRole('dialog', { name: 'common.discardChangesTitle' })).not.toBeInTheDocument()
    if (form === 'name') await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    else await waitFor(() => expect(screen.queryByPlaceholderText('habits.form.templateNamePlaceholder')).not.toBeInTheDocument())
  })
})
