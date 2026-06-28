import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RightRail } from '@/components/shell/right-rail'

describe('RightRail', () => {
  it('renders its children', () => {
    render(
      <RightRail ariaLabel="Today details">
        <p>Rail content</p>
      </RightRail>,
    )

    expect(screen.getByText('Rail content')).toBeInTheDocument()
  })

  it('exposes the aria-label on the complementary landmark', () => {
    render(
      <RightRail ariaLabel="Today details">
        <p>Rail content</p>
      </RightRail>,
    )

    expect(screen.getByRole('complementary', { name: 'Today details' })).toBeInTheDocument()
  })
})
