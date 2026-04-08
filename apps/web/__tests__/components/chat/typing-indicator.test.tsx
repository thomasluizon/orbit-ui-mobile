import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { TypingIndicator } from '@/components/chat/typing-indicator'

describe('TypingIndicator', () => {
  it('renders the typing indicator', () => {
    const { container } = render(<TypingIndicator />)
    expect(container.firstChild).toBeInTheDocument()
    expect(container.firstChild).toHaveAttribute('role', 'status')
  })

  it('shows the AI sender label', () => {
    render(<TypingIndicator />)
    expect(screen.getByText('chat.senderOrbit')).toBeInTheDocument()
  })

  it('renders three animated dots', () => {
    const { container } = render(<TypingIndicator />)
    const dots = container.querySelectorAll('.animate-gentle-pulse')
    expect(dots.length).toBe(3)
  })

  it('dots have staggered animation delays', () => {
    const { container } = render(<TypingIndicator />)
    const dots = container.querySelectorAll('.animate-gentle-pulse')
    expect(dots[0]).toHaveStyle({ animationDelay: '0ms' })
    expect(dots[1]).toHaveStyle({ animationDelay: '200ms' })
    expect(dots[2]).toHaveStyle({ animationDelay: '400ms' })
  })

  it('renders AI avatar with sparkles icon', () => {
    const { container } = render(<TypingIndicator />)
    const avatar = container.querySelector('.bg-primary\\/20')
    expect(avatar).toBeInTheDocument()
    const svg = avatar?.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
