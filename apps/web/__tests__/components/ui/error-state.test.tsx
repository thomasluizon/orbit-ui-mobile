import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ErrorState } from '@/components/ui/error-state'

describe('ErrorState', () => {
  it('renders the caller message verbatim and nothing the caller omitted', () => {
    const { container } = render(<ErrorState message="Check the connection and try again." />)

    expect(screen.getByText('Check the connection and try again.')).toBeInTheDocument()
    expect(container.querySelector('[data-error-state-action]')).toBeNull()
  })

  it('renders one caller-provided text action', () => {
    const onAction = vi.fn()
    render(
      <ErrorState
        message="Try again."
        action={<button onClick={onAction}>Retry</button>}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
