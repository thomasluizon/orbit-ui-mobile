import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

import { StreakBadge } from '@/components/gamification/streak-badge'

describe('StreakBadge', () => {
  it('renders nothing when streak is 0', () => {
    const { container } = render(<StreakBadge streak={0} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when streak is negative', () => {
    const { container } = render(<StreakBadge streak={-1} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders badge for positive streak', () => {
    render(<StreakBadge streak={3} />)
    const output = document.querySelector('output')
    expect(output).toBeInTheDocument()
  })

  it('displays streak count', () => {
    render(<StreakBadge streak={5} />)
    expect(document.body.textContent).toContain('5')
  })

  it('applies normal tier for streak < 7', () => {
    render(<StreakBadge streak={3} />)
    const badge = document.querySelector('.streak-badge--normal')
    expect(badge).toBeInTheDocument()
  })

  it('applies strong tier for streak >= 7', () => {
    render(<StreakBadge streak={7} />)
    const badge = document.querySelector('.streak-badge--strong')
    expect(badge).toBeInTheDocument()
  })

  it('applies intense tier for streak >= 30', () => {
    render(<StreakBadge streak={30} />)
    const badge = document.querySelector('.streak-badge--intense')
    expect(badge).toBeInTheDocument()
  })

  it('applies legendary tier for streak >= 100', () => {
    render(<StreakBadge streak={100} />)
    const badge = document.querySelector('.streak-badge--legendary')
    expect(badge).toBeInTheDocument()
  })

  it('shows frozen icon when isFrozen is true', () => {
    render(<StreakBadge streak={5} isFrozen={true} />)
    const frozen = document.querySelector('.streak-badge__frozen')
    expect(frozen).toBeInTheDocument()
  })

  it('does not show frozen icon by default', () => {
    render(<StreakBadge streak={5} />)
    const frozen = document.querySelector('.streak-badge__frozen')
    expect(frozen).not.toBeInTheDocument()
  })

  it('has accessible aria-label', () => {
    render(<StreakBadge streak={10} />)
    const output = document.querySelector('output')
    expect(output).toHaveAttribute('aria-label')
  })
})
