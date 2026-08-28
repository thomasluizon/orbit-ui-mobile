import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EmptyState } from '@/components/ui/empty-state'

vi.mock('@/components/ui/orbit-mark', () => ({
  OrbitMark: () => <svg data-testid="orbit-mark" />,
}))
vi.mock('@/components/ui/astra-glyph', () => ({
  AstraGlyph: () => <svg data-testid="astra-glyph" />,
}))

describe('EmptyState', () => {
  it('defaults to the orbital mark and always renders its title', () => {
    render(<EmptyState title="Nothing here" />)

    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.getByTestId('orbit-mark')).toBeInTheDocument()
    expect(screen.queryByTestId('astra-glyph')).not.toBeInTheDocument()
  })

  it('renders the Astra glyph for an Astra-owned region', () => {
    render(<EmptyState title="Ask Astra" mark="astra" />)

    expect(screen.getByTestId('astra-glyph')).toBeInTheDocument()
    expect(screen.queryByTestId('orbit-mark')).not.toBeInTheDocument()
  })

  it('renders exactly the one action element supplied by the caller', () => {
    const onAction = vi.fn()
    render(
      <EmptyState
        title="Nothing here"
        action={<button onClick={onAction}>Create</button>}
      />,
    )

    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})
