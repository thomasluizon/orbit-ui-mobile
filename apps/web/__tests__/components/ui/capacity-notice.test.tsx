import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CapacityNotice } from '@/components/ui/capacity-notice'

describe('CapacityNotice', () => {
  it('renders message and optional body as separate lines', () => {
    render(<CapacityNotice message="Five messages today." body="Try again tomorrow." />)

    expect(screen.getByText('Five messages today.')).toBeInTheDocument()
    expect(screen.getByText('Try again tomorrow.')).toBeInTheDocument()
  })

  it('omits body and a second control when neither is supplied', () => {
    const { container } = render(<CapacityNotice message="Five messages today." />)

    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('uses neutral tokens and renders only one action', () => {
    const { container } = render(
      <CapacityNotice message="Five messages today." action={<button>Change limit</button>} />,
    )

    expect(container.innerHTML).not.toContain('--status-bad')
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
