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

  it('renders secondary, ghost, and destructive variants', () => {
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
      </>,
    )
    expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ghost' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('exposes its variant as a data attribute so consumers can assert the kit contract', () => {
    render(
      <>
        <PillButton onClick={() => {}}>Default</PillButton>
        <PillButton variant="ghost" onClick={() => {}}>
          Quiet
        </PillButton>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Default' })).toHaveAttribute(
      'data-variant',
      'primary',
    )
    expect(screen.getByRole('button', { name: 'Quiet' })).toHaveAttribute('data-variant', 'ghost')
  })

  it('renders an icon-only square (width = height) when given a leading icon and no label', () => {
    render(
      <PillButton ariaLabel="Create" leading={<span data-testid="icon-only-leading" />} />,
    )
    const button = screen.getByRole('button', { name: 'Create' })
    expect(button).toHaveStyle({ width: '50px', height: '50px' })
    expect(button).toHaveTextContent('')
    expect(screen.getByTestId('icon-only-leading')).toBeInTheDocument()
  })

  it('drives the pill height from the size scale (sm < md < lg)', () => {
    render(
      <>
        <PillButton size="sm" onClick={() => {}}>
          Small
        </PillButton>
        <PillButton onClick={() => {}}>Medium</PillButton>
        <PillButton size="lg" onClick={() => {}}>
          Large
        </PillButton>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Small' })).toHaveStyle({ height: '40px' })
    expect(screen.getByRole('button', { name: 'Medium' })).toHaveStyle({ height: '50px' })
    expect(screen.getByRole('button', { name: 'Large' })).toHaveStyle({ height: '56px' })
  })
})
