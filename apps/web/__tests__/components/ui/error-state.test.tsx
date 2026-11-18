import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ErrorState } from '@/components/ui/error-state'

describe('ErrorState', () => {
  it('renders the caller message verbatim and nothing the caller omitted', () => {
    const { container } = render(<ErrorState message="Check the connection and try again." />)

    expect(screen.getByText('Check the connection and try again.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('alert')).toHaveAttribute('aria-atomic', 'true')
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

  it('draws no mascot inside a section, a sheet or a toast', () => {
    const { container } = render(<ErrorState message="Try again." />)
    expect(container.querySelector('[data-asset="orbit-mascot"]')).toBeNull()
  })

  it.each([[1023, '96'], [1024, '128']] as const)('draws Orbit in Parado above a full-surface error at %ipx, never sad, and keeps the message and action', (width, size) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: width >= Number(/min-width: (\d+)px/.exec(query)?.[1] ?? Infinity), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    try {
      const { container } = render(<ErrorState fullSurface message="Check the connection and try again." action={<button>Retry</button>} />)
      const faces = container.querySelectorAll('[data-asset="orbit-mascot"]')
      expect(faces).toHaveLength(1)
      expect(faces[0]).toHaveAttribute('data-orbit-state', 'parado')
      expect(faces[0]).toHaveAttribute('width', size)
      expect(faces[0]).toHaveAttribute('aria-hidden', 'true')
      expect(faces[0]!.nextElementSibling).toHaveTextContent('Check the connection and try again.')
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    } finally { vi.unstubAllGlobals() }
  })
})
