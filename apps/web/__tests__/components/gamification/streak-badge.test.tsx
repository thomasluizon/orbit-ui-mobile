import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

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
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('stays visible at streak 0 and still routes to the streak page', () => {
    render(<StreakBadge streak={0} />)
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(pushMock).toHaveBeenCalledWith('/streak')
  })

  it('renders badge as a button for positive streak', () => {
    render(<StreakBadge streak={3} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('displays streak count', () => {
    render(<StreakBadge streak={5} />)
    expect(document.body.textContent).toContain('5')
  })

  it('navigates to the streak page when clicked', () => {
    render(<StreakBadge streak={5} />)
    fireEvent.click(screen.getByRole('button'))
    expect(pushMock).toHaveBeenCalledWith('/streak')
  })

  it('shows frozen icon when isFrozen is true', () => {
    const { container } = render(<StreakBadge streak={5} isFrozen={true} />)
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 12 14')
  })

  it('shows the flame emoji instead of the frozen icon by default', () => {
    const { container } = render(<StreakBadge streak={5} />)
    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).toContain('🔥')
  })

  it('has accessible aria-label', () => {
    render(<StreakBadge streak={10} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-label')
  })
})
