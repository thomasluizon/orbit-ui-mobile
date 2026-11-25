import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditNameSheet } from '@/app/(app)/profile/_components/edit-name-sheet'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Alex' }, patchProfile: vi.fn(), invalidate: vi.fn() }) }))

function openForm(dirty: boolean) {
  const onOpenChange = vi.fn()
  render(<QueryClientProvider client={new QueryClient()}><EditNameSheet open onOpenChange={onOpenChange} /></QueryClientProvider>)
  if (dirty) fireEvent.change(screen.getByRole('textbox', { name: 'profile.editName.label' }), { target: { value: 'Alex edited' } })
  return onOpenChange
}

const paths = ['escape', 'backdrop', 'close icon', 'cancel'] as const
async function attempt(path: typeof paths[number]) {
  if (path === 'escape') await userEvent.keyboard('{Escape}')
  else if (path === 'backdrop') await userEvent.click(document.querySelector('.orbit-sheet-backdrop')!)
  else if (path === 'cancel') await userEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
  else await userEvent.click(screen.getAllByRole('button', { name: 'common.close' })[0]!)
}

describe('name form dismissal', () => {
  it.each(paths)('confirms unsaved input through %s', async path => {
    const onOpenChange = openForm(true)
    await attempt(path)
    const discard = await screen.findByRole('dialog', { name: 'common.discardChangesTitle' })
    expect(onOpenChange).not.toHaveBeenCalled()
    await userEvent.click(within(discard).getByRole('button', { name: 'common.keepEditing' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'common.discardChangesTitle' })).not.toBeInTheDocument())
    expect(screen.getByDisplayValue('Alex edited')).toBeInTheDocument()
    await attempt(path)
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'common.discardChangesTitle' })).getByRole('button', { name: 'common.discardChangesAction' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it.each(paths)('closes clean input through %s', async path => {
    const onOpenChange = openForm(false)
    await attempt(path)
    expect(screen.queryByRole('dialog', { name: 'common.discardChangesTitle' })).not.toBeInTheDocument()
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})
