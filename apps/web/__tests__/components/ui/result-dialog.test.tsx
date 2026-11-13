import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResultDialog } from '@/components/ui/result-dialog'

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))

function stubMedia(matching: readonly string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching.some((feature) => query.includes(feature)),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

const props = {
  title: 'Pronto!', sentence: 'A tarefa foi criada para amanhã às 8:00.', primaryLabel: 'Ver no Calendário',
  secondaryLabel: 'Criar outro', onPrimary: vi.fn(), onSecondary: vi.fn(), onClose: vi.fn(),
}

beforeEach(() => { stubMedia([]); Object.values(props).forEach((value) => { if (typeof value === 'function') (value as ReturnType<typeof vi.fn>).mockClear() }) })
afterEach(() => vi.unstubAllGlobals())

describe('ResultDialog', () => {
  it('is a dialog named by its title and described by its sentence', async () => {
    render(<ResultDialog {...props} />)
    const dialog = await screen.findByRole('dialog', { name: 'Pronto!' })
    expect(dialog).toHaveAccessibleDescription('A tarefa foi criada para amanhã às 8:00.')
  })

  it('moves focus to the filled action', async () => {
    render(<ResultDialog {...props} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver no Calendário' })).toHaveFocus())
  })

  it('runs the two actions', async () => {
    render(<ResultDialog {...props} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Ver no Calendário' }))
    await userEvent.click(screen.getByRole('button', { name: 'Criar outro' }))
    expect(props.onPrimary).toHaveBeenCalledTimes(1)
    expect(props.onSecondary).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and never dismisses itself', async () => {
    render(<ResultDialog {...props} />)
    await screen.findByRole('dialog')
    expect(props.onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1))
  })

  it('shows Orbit in Feliz by default and in Parado after a destructive flow', async () => {
    const { unmount } = render(<ResultDialog {...props} />)
    await screen.findByRole('dialog')
    expect(document.querySelector('svg[data-asset="orbit-mascot"]')).toHaveAttribute('data-orbit-state', 'feliz')
    unmount()
    render(<ResultDialog {...props} orbitState="parado" />)
    await screen.findByRole('dialog')
    expect(document.querySelector('svg[data-asset="orbit-mascot"]')).toHaveAttribute('data-orbit-state', 'parado')
  })

  it('is centred at every width and has no grabber', async () => {
    render(<ResultDialog {...props} />)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('data-centred', 'true')
  })

  it('draws the mascot at 128', async () => {
    render(<ResultDialog {...props} />)
    await screen.findByRole('dialog')
    expect(document.querySelector('svg[data-asset="orbit-mascot"]')).toHaveAttribute('width', '128')
  })
})
