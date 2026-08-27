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

  it('requires and exposes the name of an icon-only button', () => {
    render(
      <PillButton onClick={() => {}} iconOnly label="Open menu">
        <span data-testid="leading-node" />
      </PillButton>,
    )
    expect(screen.getByTestId('leading-node')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
  })

  it('no-ops clicks and exposes the loading state', () => {
    const onClick = vi.fn()
    render(
      <PillButton onClick={onClick} loading>
        Saving
      </PillButton>,
    )
    const button = screen.getByRole('button', { name: 'Saving' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders all five variants', () => {
    render(
      <>
        <PillButton variant="secondary" onClick={() => {}}>
          Secondary
        </PillButton>
        <PillButton variant="ghost" onClick={() => {}}>
          Ghost
        </PillButton>
        <PillButton variant="destructive" onClick={() => {}}>
          Delete
        </PillButton>
        <PillButton variant="caution" onClick={() => {}}>
          Caution
        </PillButton>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ghost' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Caution' })).toBeInTheDocument()
  })

  it('drives the pill height from the two-size scale', () => {
    render(
      <>
        <PillButton size="sm" onClick={() => {}}>
          Small
        </PillButton>
        <PillButton onClick={() => {}}>Medium</PillButton>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Small' })).toHaveStyle({ height: '40px' })
    expect(screen.getByRole('button', { name: 'Medium' })).toHaveStyle({ height: '50px' })
  })
})
