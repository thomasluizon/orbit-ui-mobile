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

  it('shows frozen icon when isFrozen is true', () => {
    // Frozen variant draws a snowflake on a 12x14 viewBox; flame uses 24x24.
    const { container } = render(<StreakBadge streak={5} isFrozen={true} />)
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 12 14')
  })

  it('does not show frozen icon by default', () => {
    const { container } = render(<StreakBadge streak={5} />)
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24')
  })

  it('has accessible aria-label', () => {
    render(<StreakBadge streak={10} />)
    const output = document.querySelector('output')
    expect(output).toHaveAttribute('aria-label')
  })
})
