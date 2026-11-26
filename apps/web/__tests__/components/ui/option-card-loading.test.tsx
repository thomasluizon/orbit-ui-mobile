import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { OptionCard } from '@/components/ui/option-card'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))

afterEach(cleanup)

describe('a quick option that waits for its own request', () => {
  it('keeps its label and takes the skeleton face, busy and not pressable, with no spinner', () => {
    const onSelect = vi.fn()
    render(<OptionCard label="Registrar hábito" loading onSelect={onSelect} />)
    const card = screen.getByRole('button', { name: 'Registrar hábito' })
    expect(card).toHaveTextContent('Registrar hábito')
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(card).toBeDisabled()
    expect(card.querySelectorAll('[data-slot="skeleton-face"]')).toHaveLength(1)
    expect(card.querySelector('.animate-spin')).toBeNull()
    fireEvent.click(card)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('draws no skeleton face and reports no wait when it does not wait', () => {
    render(<OptionCard label="Agora não" onSelect={vi.fn()} />)
    const card = screen.getByRole('button', { name: 'Agora não' })
    expect(card).not.toHaveAttribute('aria-busy')
    expect(card.querySelector('[data-slot="skeleton-face"]')).toBeNull()
  })

  it('shows the wait on the confirm action of a question sheet, and disables the other action', () => {
    render(<ConfirmSheet open quickOptions loading confirmImmediately title="Quer registrar este hábito?" message="" confirmLabel="Registrar hábito" onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const [cancel, confirm] = [...document.querySelectorAll<HTMLButtonElement>('[data-slot="sheet-actions"] button')]
    expect(document.querySelector('[data-option-card]')).toBeNull()
    expect(confirm).toHaveAttribute('aria-busy', 'true')
    expect(confirm).toHaveTextContent('Registrar hábito')
    expect(confirm).toBeDisabled()
    expect(cancel).toBeDisabled()
  })
})
