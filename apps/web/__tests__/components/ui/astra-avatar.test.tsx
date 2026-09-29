import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AstraAvatar } from '@/components/ui/astra-avatar'

describe('AstraAvatar', () => {
  it('is decorative (hidden from assistive tech) without a label', () => {
    const { container } = render(<AstraAvatar />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('exposes an accessible image when labelled', () => {
    render(<AstraAvatar label="Astra avatar" />)
    expect(screen.getByRole('img', { name: 'Astra avatar' })).toBeInTheDocument()
  })

  it('applies a custom class', () => {
    const { container } = render(<AstraAvatar className="custom" />)
    expect(container.firstChild).toHaveClass('custom')
  })
})
