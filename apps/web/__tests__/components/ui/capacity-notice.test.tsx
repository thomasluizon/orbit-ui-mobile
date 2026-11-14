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

  it('draws no mascot on a boundary of a surface that works without the AI', () => {
    const { container } = render(<CapacityNotice message="Ten habits per goal." />)
    expect(container.querySelector('[data-asset="orbit-mascot"]')).toBeNull()
  })

  it('rests Orbit at 48 beside the reason where the AI is the missing part, with neutral tokens and no upgrade action', () => {
    const { container } = render(<CapacityNotice message="Five messages today." mascotState="descansando" />)
    const face = container.querySelector('[data-asset="orbit-mascot"]')!
    expect(face).toHaveAttribute('data-orbit-state', 'descansando')
    expect(face).toHaveAttribute('width', '48')
    expect(face.nextElementSibling).toHaveTextContent('Five messages today.')
    expect(container.innerHTML).not.toContain('--status-bad')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
