import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { OnboardingComplete } from '@/components/onboarding/onboarding-complete'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('OnboardingComplete', () => {
  it('shows the created habit and uses the signed-out ending', () => {
    const onFinish = vi.fn()
    render(<OnboardingComplete createdHabit="Exercise" emoji="🏃" remindersOff={false} skipped={false} signedOut onFinish={onFinish} />)
    expect(screen.getByText('signedOutTitle')).toBeInTheDocument()
    expect(screen.getByText('Exercise')).toBeInTheDocument()
    fireEvent.click(screen.getByText('signIn'))
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('clears the landing ring when the browser cannot animate it', () => {
    const { container } = render(<OnboardingComplete createdHabit="Exercise" emoji="🏃" remindersOff={false} skipped={false} signedOut={false} onFinish={vi.fn()} />)
    const accent = container.querySelector('circle[stroke="var(--primary)"]')
    expect(accent).not.toBeNull()
    expect(accent).toHaveAttribute('opacity', '0')
  })

  it('names the no-reminders outcome without plan copy', () => {
    render(<OnboardingComplete createdHabit="Read" emoji="📖" remindersOff skipped={false} signedOut={false} onFinish={vi.fn()} />)
    expect(screen.getByText('remindersOffBody')).toBeInTheDocument()
    expect(screen.queryByText(/Pro/u)).not.toBeInTheDocument()
  })
})
