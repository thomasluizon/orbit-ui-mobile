import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PillButton } from '@/components/ui/pill-button'

describe('PillButton', () => {
  it('renders its label', () => {
    render(<PillButton onClick={() => {}}>Continue</PillButton>)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })

  it('fires onClick when clicked', () => {
    const onClick = vi.fn()
    render(<PillButton onClick={onClick}>Continue</PillButton>)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn()
    render(
      <PillButton onClick={onClick} disabled>
        Continue
      </PillButton>,
    )
    const button = screen.getByRole('button', { name: 'Continue' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders a leading node', () => {
    render(
      <PillButton onClick={() => {}} leading={<span data-testid="leading-node" />}>
        Go
      </PillButton>,
    )
    expect(screen.getByTestId('leading-node')).toBeInTheDocument()
  })

  it('no-ops clicks and exposes the busy state while busy', () => {
    const onClick = vi.fn()
    render(
      <PillButton onClick={onClick} busy>
        Saving
      </PillButton>,
    )
    const button = screen.getByRole('button', { name: 'Saving' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders white and ghost variants', () => {
    render(
      <>
        <PillButton variant="white" onClick={() => {}}>
          White
        </PillButton>
        <PillButton variant="ghost" onClick={() => {}}>
          Ghost
        </PillButton>
      </>,
    )
    expect(screen.getByRole('button', { name: 'White' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ghost' })).toBeInTheDocument()
  })
})
