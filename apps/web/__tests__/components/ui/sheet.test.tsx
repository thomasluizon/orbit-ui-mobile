import { useState } from 'react'
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { runServerAction } from '@/lib/client-action'
import { setApiFetchTranslate } from '@/lib/api-fetch'
import { useVersionGateStore } from '@/stores/version-gate-store'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { DiscardChangesSheet } from '@/components/ui/discard-changes-sheet'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
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
import { WidgetInfoOverlay } from '@/components/advanced/advanced-sections'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

function NestedReloadSheets() {
  const [upperOpen, setUpperOpen] = useState(true)
  return <><UpdateAvailableBanner /><AppToastHost /><Sheet title="Lower sheet">
    {upperOpen ? <Sheet title="Upper sheet" onClose={() => setUpperOpen(false)}>
      <button type="button" onClick={() => { void runServerAction(Promise.reject(new UnrecognizedActionError('Unknown action'))) }}>Save</button>
    </Sheet> : null}
  </Sheet></>
}

describe('Sheet', () => {
  it('opens the complete typed title with one press and preserves the underlying sheet', async () => {
    const title = 'Ler um capítulo inteiro do livro de história antes de dormir e anotar as ideias para conversar com meus amigos amanhã cedo.'
    const onClose = vi.fn()
    render(<Sheet title={title} titleMode="typed" onClose={onClose}><input aria-label="Draft" defaultValue="Keep this" /></Sheet>)
    const trigger = screen.getByRole('button', { name: title })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.type(screen.getByRole('textbox', { name: 'Draft' }), ' edited')
    const body = screen.getByRole('dialog', { name: title }).querySelector<HTMLElement>('[data-slot="sheet-body"]')!
    body.scrollTop = 120
    await userEvent.click(trigger)
    expect(body.scrollTop).toBe(0)
    const dialog = screen.getByRole('dialog', { name: title })
    expect(dialog.querySelector('[data-slot="sheet-body"]')).toHaveTextContent(title)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(body.scrollTop).toBe(120)
    expect(trigger).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Keep this edited')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps product titles as noninteractive headings', () => {
    render(<Sheet title="Options" />)
    expect(screen.getByRole('heading', { name: 'Options' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Options' })).toBeNull()
  })

  it('returns focus to its trigger after ordinary dismissal without a focus policy', async () => {
    const user = userEvent.setup()
    function Host() {
      const [open, setOpen] = useState(false)
      return <>
        <button type="button" onClick={() => setOpen(true)}>Open sheet</button>
        {open ? <Sheet title="Options" onClose={() => setOpen(false)}><button type="button">Action</button></Sheet> : null}
      </>
    }
    render(<Host />)
    const trigger = screen.getByRole('button', { name: 'Open sheet' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('leaves the short widget sheet bottom inset to the primitive', () => {
    render(<WidgetInfoOverlay open onOpenChange={vi.fn()} t={(key) => key} />)
    const body = screen.getByRole('dialog').querySelector('[data-slot="sheet-body"]')!
    const caller = body.firstElementChild!
    expect(Number.parseFloat(getComputedStyle(caller).paddingBottom) || 0).toBe(0)
  })
  it('announces a stale action once inside the active dialog', async () => {
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    setApiFetchTranslate((key) => key)

    render(<><UpdateAvailableBanner /><AppToastHost /><Sheet title="Options"><button type="button" onClick={() => { void runServerAction(Promise.reject(new UnrecognizedActionError('Unknown action'))) }}>Save</button></Sheet></>)
    const dialog = screen.getByRole('dialog')
    const region = dialog.querySelector('[data-update-live-region]')
    expect(region).toBeEmptyDOMElement()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(region).toHaveTextContent('errors.api.appUpdated')
    expect(screen.getAllByText('errors.api.appUpdated')).toHaveLength(1)
    expect(dialog).toContainElement(screen.getByRole('button', { name: 'errors.api.reload' }))
    expect(document.querySelectorAll('[data-update-banner]')).toHaveLength(1)
  })

  it('keeps one reload notice in the topmost sheet and restores the lower host on close', async () => {
    useVersionGateStore.setState(useVersionGateStore.getInitialState())
    setApiFetchTranslate((key) => key)
    render(<NestedReloadSheets />)
    await act(async () => {})
    const lower = screen.getByRole('dialog', { name: 'Lower sheet', hidden: true }).querySelector('[data-update-live-region]')
    const upper = screen.getByRole('dialog', { name: 'Upper sheet' }).querySelector('[data-update-live-region]')
    expect(lower).toBeEmptyDOMElement()
    expect(upper).toBeEmptyDOMElement()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(lower).toBeEmptyDOMElement()
    expect(upper).toHaveTextContent('errors.api.appUpdated')
    expect(document.querySelectorAll('[data-update-banner]')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Upper sheet' })).toBeNull())
    expect(lower).toHaveTextContent('errors.api.appUpdated')
    expect(document.querySelectorAll('[data-update-banner]')).toHaveLength(1)
  })

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
    await waitFor(() => expect(upper.querySelector('[role="status"]:not([data-update-live-region])')).toHaveTextContent('Removed'))
    expect(lower.querySelector('[role="status"]:not([data-update-live-region])')).toBeNull()
    expect(document.querySelector('[data-shell-notice] > [role="status"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledOnce()
    expect(upper.querySelector('[role="status"]:not([data-update-live-region])')).toBeNull()
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
  it('leaves at least a 24 pixel content peek while clearing the top inset on a long sheet', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
      .replaceAll('\r\n', '\n')

    expect(stylesheet).toContain('padding-block-start: max(var(--space-6), var(--safe-top));')
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

  it.each([1, 14])('separates footer actions from a %i-row body with space only', (rowCount) => {
    const stylesheet = document.createElement('style')
    stylesheet.textContent = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
    document.head.append(stylesheet)
    try {
      render(
        <Sheet open title="Options" actions={<button type="button">Save</button>}>
          {Array.from({ length: rowCount }, (_, index) => <p key={index}>Row {index + 1}</p>)}
        </Sheet>,
      )
      const dialog = screen.getByRole('dialog')
      const body = dialog.querySelector('[data-slot="sheet-body"]')!
      const footer = screen.getByRole('button', { name: 'Save' }).closest<HTMLElement>('[data-slot="sheet-actions"]')!
      expect(body).not.toContainElement(footer)
      expect(getComputedStyle(body).paddingBottom).toBe('24px')
      const footerStyle = getComputedStyle(footer)
      expect(footerStyle.paddingTop).toBe('16px')
      expect(Number.parseFloat(footerStyle.borderTopWidth) || 0).toBe(0)
      expect(footerStyle.boxShadow).toMatch(/^(none)?$/)
    } finally {
      stylesheet.remove()
    }
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

function DirtyForm({ onOpenChange }: Readonly<{ onOpenChange: (open: boolean) => void }>) {
  const [title, setTitle] = useState('')
  const { sheetRef, closeSheet } = useSheetHost()
  const guard = useDismissGuard({ isDirty: title.length > 0, onDismiss: () => closeSheet(() => onOpenChange(false)) })
  return <>
    <Sheet ref={sheetRef} title="Create habit" onClose={guard.canDismiss ? () => onOpenChange(false) : undefined} onAttemptDismiss={guard.requestDismiss}>
      <input aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
      <button type="button" onClick={guard.requestDismiss}>Cancel</button>
    </Sheet>
    <DiscardChangesSheet open={guard.showDiscardDialog} onKeepEditing={guard.cancelDismiss} onDiscard={guard.confirmDismiss} />
  </>
}

function DiscardHost({ onOpenChange }: Readonly<{ onOpenChange: (open: boolean) => void }>) {
  const [open, setOpen] = useState(true)
  return open ? <DirtyForm onOpenChange={(nextOpen) => { onOpenChange(nextOpen); setOpen(nextOpen) }} /> : <button type="button" onClick={() => setOpen(true)}>Reopen</button>
}

describe('dirty sheet dismissal', () => {
  it('routes the close control and Escape to the guard without closing', async () => {
    const user = userEvent.setup()
    const attempt = vi.fn()
    render(<Sheet title="Create habit" onAttemptDismiss={attempt}><button type="button">Field</button></Sheet>)
    await user.click(screen.getByRole('button', { name: 'common.close' }))
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Field' }))
    await user.keyboard('{Escape}')
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('routes a backdrop press to the guard without closing', async () => {
    const user = userEvent.setup()
    const attempt = vi.fn()
    render(<Sheet title="Create habit" onAttemptDismiss={attempt}><button type="button">Field</button></Sheet>)
    const viewport = document.querySelector('.orbit-sheet-viewport')
    expect(viewport).not.toBeNull()
    await user.click(viewport!)
    expect(attempt).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it.each(['Escape', 'Cancel'])('discards through %s, closes both sheets once and reopens empty', async (trigger) => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<DiscardHost onOpenChange={onOpenChange} />)
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Run Monday')
    if (trigger === 'Escape') await user.keyboard('{Escape}')
    else await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog', { name: 'common.discardChangesTitle' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'common.discardChangesAction' }))
    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0))
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false)
    await user.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('')
  })

  it('keeps the title when editing continues and focuses the keep pill', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<DiscardHost onOpenChange={onOpenChange} />)
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Run Monday')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'common.keepEditing' })).toHaveFocus())
    expect(screen.getByRole('button', { name: 'common.discardChangesAction' })).toHaveAttribute('data-variant', 'destructive')
    await user.click(screen.getByRole('button', { name: 'common.keepEditing' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'common.discardChangesTitle' })).toBeNull())
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Run Monday')
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
