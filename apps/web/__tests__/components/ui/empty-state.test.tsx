import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EmptyState } from '@/components/ui/empty-state'

vi.mock('@/components/ui/orbit-mascot', () => ({
  OrbitMascot: ({ size }: { size: number }) => <svg data-testid="orbit-mascot" data-size={size} />,
  useStateMascotSize: () => 96,
}))

describe('EmptyState', () => {
  it('draws one mascot and always renders its title', () => {
    render(<EmptyState title="Nothing here" />)

    expect(screen.getByText('Nothing here')).toBeInTheDocument()
    expect(screen.getAllByTestId('orbit-mascot')).toHaveLength(1)
    expect(screen.getByTestId('orbit-mascot')).toHaveAttribute('data-size', '96')
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
