import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { OnboardingComplete } from '@/components/onboarding/onboarding-complete'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('OnboardingComplete', () => {
  it('shows the created habit and uses the signed-out ending', () => {
    const onFinish = vi.fn()
    render(<OnboardingComplete createdHabit="Exercise" emoji="🏃" remindersOff={false} skipped={false} signedOut dueToday onFinish={onFinish} />)
    expect(screen.getByText('signedOutTitle')).toBeInTheDocument()
    expect(screen.getByText('Exercise')).toBeInTheDocument()
    fireEvent.click(screen.getByText('signIn'))
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('clears the landing ring when the browser cannot animate it', () => {
    const { container } = render(<OnboardingComplete createdHabit="Exercise" emoji="🏃" remindersOff={false} skipped={false} signedOut={false} dueToday onFinish={vi.fn()} />)
    const accent = container.querySelector('circle[stroke="var(--primary)"]')
    expect(accent).not.toBeNull()
    expect(accent).toHaveAttribute('opacity', '0')
  })

  it('tells a skipped signed-out run it skipped, not that a plan is ready', () => {
    render(<OnboardingComplete createdHabit="" emoji="◎" remindersOff={false} skipped signedOut dueToday onFinish={vi.fn()} />)
    expect(screen.getByText('skippedTitle')).toBeInTheDocument()
    expect(screen.getByText('skippedBody')).toBeInTheDocument()
    expect(screen.queryByText('signedOutTitle')).not.toBeInTheDocument()
  })

  it('never claims a habit is in the day when it is not due today', () => {
    render(<OnboardingComplete createdHabit="Walk" emoji="🚶" remindersOff={false} skipped={false} signedOut={false} dueToday={false} onFinish={vi.fn()} />)
    expect(screen.getByText('notTodayTitle')).toBeInTheDocument()
    expect(screen.getByText('notTodayBody')).toBeInTheDocument()
    expect(screen.getAllByText('notTodayPending').length).toBeGreaterThan(0)
    expect(screen.queryByText('pending')).not.toBeInTheDocument()
  })

  it('names the no-reminders outcome without plan copy', () => {
    render(<OnboardingComplete createdHabit="Read" emoji="📖" remindersOff skipped={false} signedOut={false} dueToday onFinish={vi.fn()} />)
    expect(screen.getByText('remindersOffBody')).toBeInTheDocument()
    expect(screen.queryByText(/Pro/u)).not.toBeInTheDocument()
  })
})
