import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

let mockProfile: { isTrialActive: boolean; hasProAccess: boolean } = {
  isTrialActive: true,
  hasProAccess: true,
}
let mockTrialDaysLeft = 5

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mockProfile }),
  useTrialDaysLeft: () => mockTrialDaysLeft,
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
            React.forwardRef(function MotionMock(
              props: Record<string, unknown> & { children?: React.ReactNode },
              ref: React.Ref<HTMLElement>,
            ) {
              const { children, initial, animate, exit, transition, ...rest } = props
              return React.createElement(tag, { ...rest, ref }, children)
            }),
          )
        }
        return cache.get(tag)
      },
    }),
  }
})

import { TrialBanner } from '@/components/ui/trial-banner'

describe('TrialBanner', () => {
  it('renders nothing for a Pro account outside a trial', () => {
    mockProfile = { isTrialActive: false, hasProAccess: true }
    const { container } = render(<TrialBanner />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the free-plan variant outside a trial', () => {
    mockProfile = { isTrialActive: false, hasProAccess: false }
    render(<TrialBanner />)
    expect(screen.getByText('trial.banner.freeLine')).toBeInTheDocument()
  })

  it('renders banner when trial is active', () => {
    mockProfile = { isTrialActive: true, hasProAccess: true }
    mockTrialDaysLeft = 5
    render(<TrialBanner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows upgrade link', () => {
    mockProfile = { isTrialActive: true, hasProAccess: true }
    render(<TrialBanner />)
    const link = screen.getByText('trial.banner.upgrade')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', '/upgrade')
  })

  it('shows last day message when 0 days left', () => {
    mockProfile = { isTrialActive: true, hasProAccess: true }
    mockTrialDaysLeft = 0
    render(<TrialBanner />)
    expect(screen.getByText('trial.banner.lastDay')).toBeInTheDocument()
  })

  it('uses the singular day-count variant when 1 day is left', () => {
    mockProfile = { isTrialActive: true, hasProAccess: true }
    mockTrialDaysLeft = 1
    render(<TrialBanner />)
    expect(document.body.textContent).toContain('trial.banner.daysLeft')
    expect(screen.queryByText('trial.banner.lastDay')).not.toBeInTheDocument()
  })

  it('shows the plural days-left count', () => {
    mockProfile = { isTrialActive: true, hasProAccess: true }
    mockTrialDaysLeft = 5
    render(<TrialBanner />)
    expect(document.body.textContent).toContain('trial.banner.daysLeft')
  })

  it('dismisses when dismiss button clicked', () => {
    mockProfile = { isTrialActive: true, hasProAccess: true }
    render(<TrialBanner />)
    const dismissBtn = screen.getByLabelText('common.dismiss')
    fireEvent.click(dismissBtn)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
