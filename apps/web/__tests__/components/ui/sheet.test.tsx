import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { useUIStore } from '@/stores/ui-store'
import { useAppToastStore } from '@/stores/app-toast-store'
import { AppToastHost } from '@/components/ui/app-toast-host'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('Sheet', () => {
  it('places an actionable toast only in the topmost sheet', async () => {
    const undo = vi.fn()
    useUIStore.setState({ openOverlayIds: [] })
    useAppToastStore.setState({ currentToast: null, queue: [] })
    render(
      <>
        <div data-shell-notice=""><AppToastHost /></div>
        <Sheet title="Lower sheet">
          <button type="button">Lower action</button>
          <Sheet title="Upper sheet"><button type="button">Upper action</button></Sheet>
        </Sheet>
      </>,
    )

    act(() => { useAppToastStore.getState().showQueued('Removed', 'Undo', undo) })

    const lower = screen.getByRole('dialog', { name: 'Lower sheet', hidden: true })
    const upper = screen.getByRole('dialog', { name: 'Upper sheet' })
    await waitFor(() => expect(upper.querySelector('[role="status"]')).toHaveTextContent('Removed'))
    expect(lower.querySelector('[role="status"]')).toBeNull()
    expect(document.querySelector('[data-shell-notice] > [role="status"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledOnce()
    expect(upper.querySelector('[role="status"]')).toBeNull()
  })
  it('uses an accessible title without showing a visible heading', () => {
    render(<Sheet open accessibleTitle="Reschedule with AI"><p>Plan</p></Sheet>)
    expect(screen.getByRole('dialog', { name: 'Reschedule with AI' })).toBeInTheDocument()
    expect(screen.getByText('Reschedule with AI')).toHaveClass('sr-only')
  })
  it('registers while open and releases its overlay slot on unmount', () => {
    useUIStore.setState({ openOverlayIds: [] })
    const { unmount } = render(<Sheet open title="Options" />)
    expect(useUIStore.getState().openOverlayIds).toHaveLength(1)
    unmount()
    expect(useUIStore.getState().openOverlayIds).toHaveLength(0)
  })
  it('leaves a 24 pixel content peek on a long sheet', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
      .replaceAll('\r\n', '\n')

    expect(stylesheet).toContain('padding-block-start: var(--space-6);')
    expect(stylesheet).toContain('max-height: 85%;')
  })

  it('keeps the body and fixed action row in separate slots', () => {
    render(
      <Sheet open title="Delete habit" actions={<button type="button">Delete</button>}>
        <p>Permanent action</p>
      </Sheet>,
    )

    expect(screen.getByText('Permanent action').closest('[data-slot="sheet-body"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Delete' }).closest('[data-slot="sheet-actions"]')).not.toBeNull()
  })

  it('finishes its exit before reporting close', async () => {
    const onClose = vi.fn()
    render(<Sheet open title="Options" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('does not expose a dismiss control when no close handler exists', () => {
    render(<Sheet open title="Required action" />)
    expect(screen.queryByRole('button', { name: 'common.close' })).toBeNull()
  })

  it('closes on Escape from its focused content', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Sheet open title="Options" onClose={onClose}><button type="button">Action</button></Sheet>)
    await user.click(screen.getByRole('button', { name: 'Action' }))
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cancels a confirmation on Escape without confirming the action', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ConfirmSheet
        open
        title="Delete habit"
        message="Permanent action"
        confirmLabel="Delete"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    )
    screen.getByRole('button', { name: 'Delete' }).focus()
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('starts a destructive confirmation on its safe cancel action', async () => {
    render(<ConfirmSheet open title="Delete habit" message="Permanent action" confirmLabel="Delete habit" destructive onCancel={vi.fn()} onConfirm={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'common.cancel' })).toHaveFocus())
  })
})

/**
 * The host may never flip its own open state: `onClose` has to arrive from the
 * finished exit, and a scheduled action has to run after it. Mobile depends on
 * this to avoid unmounting a presented TrueSheet, and web keeps the same path.
 */
describe('Sheet close path', () => {
  function Host({
    onClose,
    exitAction,
  }: Readonly<{ onClose: () => void; exitAction?: () => void }>) {
    const { sheetRef, closeSheet } = useSheetHost()
    return (
      <Sheet ref={sheetRef} open title="Options" onClose={onClose}>
        <button type="button" onClick={() => closeSheet(exitAction)}>
          request-close
        </button>
      </Sheet>
    )
  }

  it('reports close only once the exit finishes', async () => {
    const onClose = vi.fn()
    render(<Host onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'request-close' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('runs a scheduled exit action in place of onClose', async () => {
    const onClose = vi.fn()
    const navigate = vi.fn()
    render(<Host onClose={onClose} exitAction={navigate} />)

    fireEvent.click(screen.getByRole('button', { name: 'request-close' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(onClose).not.toHaveBeenCalled()
  })
})
