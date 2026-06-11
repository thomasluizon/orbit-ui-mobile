import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { VerifiedBadge } from '@/components/ui/verified-badge'

describe('VerifiedBadge', () => {
  it('renders the scalloped check svg inside the disc', () => {
    const { container } = render(<VerifiedBadge />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('scales the inner check to half the disc size', () => {
    const { container } = render(<VerifiedBadge size={64} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '32')
  })
})
