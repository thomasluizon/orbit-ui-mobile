import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

let mockProfile = { isTrialActive: true }
let mockTrialDaysLeft = 5
let mockTrialUrgent = false

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
  useTrialDaysLeft: () => mockTrialDaysLeft,
  useTrialUrgent: () => mockTrialUrgent,
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('motion/react', async () => {
  const React = await import('react')
  const cache = new Map<string, unknown>()
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => false,
    motion: new Proxy({} as Record<string, unknown>, {
      get(_target, tag) {
        if (typeof tag !== 'string') return undefined
        if (!cache.has(tag)) {
          cache.set(
            tag,
            function MotionMock(
              props: Record<string, unknown> & { children?: React.ReactNode; ref?: React.Ref<HTMLElement> },
            ) {
              const { children, initial, animate, exit, transition, ref, ...rest } = props
              return React.createElement(tag, { ...rest, ref }, children)
            },
          )
        }
        return cache.get(tag)
      },
    }),
  }
})

import { TrialBanner } from '@/components/ui/trial-banner'

describe('TrialBanner', () => {
  it('renders nothing when trial is not active', () => {
    mockProfile = { isTrialActive: false }
    const { container } = render(<TrialBanner />)
    expect(container.innerHTML).toBe('')
  })

  it('renders banner when trial is active', () => {
    mockProfile = { isTrialActive: true }
    mockTrialDaysLeft = 5
    render(<TrialBanner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows upgrade link', () => {
    mockProfile = { isTrialActive: true }
    render(<TrialBanner />)
    const link = screen.getByText('trial.banner.upgrade')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', '/upgrade')
  })

  it('shows last day message when 0 days left', () => {
    mockProfile = { isTrialActive: true }
    mockTrialDaysLeft = 0
    render(<TrialBanner />)
    expect(screen.getByText('trial.banner.lastDay')).toBeInTheDocument()
  })

  it('shows the urgent last-day message when no days remain', () => {
    mockProfile = { isTrialActive: true }
    mockTrialUrgent = true
    mockTrialDaysLeft = 0
    render(<TrialBanner />)
    expect(screen.getByText('trial.banner.lastDay')).toBeInTheDocument()
  })

  it('shows the days-left count when trial is not urgent', () => {
    mockProfile = { isTrialActive: true }
    mockTrialUrgent = false
    mockTrialDaysLeft = 5
    render(<TrialBanner />)
    expect(document.body.textContent).toContain('trial.banner.daysLeft')
  })

  it('dismisses when dismiss button clicked', () => {
    mockProfile = { isTrialActive: true }
    render(<TrialBanner />)
    const dismissBtn = screen.getByLabelText('common.dismiss')
    fireEvent.click(dismissBtn)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
