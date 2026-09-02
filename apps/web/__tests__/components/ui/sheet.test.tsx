import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('Sheet', () => {
  it('leaves a 24 pixel content peek on a long sheet', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
      .replaceAll('\r\n', '\n')

    expect(stylesheet).toContain('max-height: calc(85dvh - 24px);')
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
