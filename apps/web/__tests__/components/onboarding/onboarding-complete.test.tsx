import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { OnboardingComplete } from '@/components/onboarding/onboarding-complete'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('OnboardingComplete', () => {
  it.each([true, false])('hands the next habit to Astra when signedOut=%s', (signedOut) => {
    render(<OnboardingComplete createdHabit="Read" emoji="📖" remindersOff={false} skipped={false} signedOut={signedOut} dueToday general={false} onFinish={vi.fn()} />)
    expect(screen.getByText('tellAstra')).toBeVisible()
  })

  it('hides the decorative emoji beside the created habit name', () => {
    render(<OnboardingComplete createdHabit="Exercise" emoji="🏃" remindersOff={false} skipped={false} signedOut={false} dueToday general={false} onFinish={vi.fn()} />)
    expect(screen.getByText('Exercise')).toBeVisible()
    expect(screen.getByText('🏃')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows the created habit and uses the signed-out ending', () => {
    const onFinish = vi.fn()
    render(<OnboardingComplete createdHabit="Exercise" emoji="🏃" remindersOff={false} skipped={false} signedOut dueToday general={false} onFinish={onFinish} />)
    expect(screen.getByText('signedOutTitle')).toBeInTheDocument()
    expect(screen.getByText('Exercise')).toBeInTheDocument()
    fireEvent.click(screen.getByText('signIn'))
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('clears the landing ring when the browser cannot animate it', () => {
    const { container } = render(<OnboardingComplete createdHabit="Exercise" emoji="🏃" remindersOff={false} skipped={false} signedOut={false} dueToday general={false} onFinish={vi.fn()} />)
    const accent = container.querySelector('circle[stroke="var(--primary)"]')
    expect(accent).not.toBeNull()
    expect(accent).toHaveAttribute('opacity', '0')
  })

  it('sends a skipped signed-out run to sign in, and says so', () => {
    render(<OnboardingComplete createdHabit="" emoji="◎" remindersOff={false} skipped signedOut dueToday general={false} onFinish={vi.fn()} />)
    expect(screen.getByText('skippedSignedOutTitle')).toBeInTheDocument()
    expect(screen.getByText('skippedSignedOutBody')).toBeInTheDocument()
    expect(screen.getByText('signIn')).toBeInTheDocument()
    expect(screen.queryByText('signedOutTitle')).not.toBeInTheDocument()
    expect(screen.queryByText('skippedTitle')).not.toBeInTheDocument()
    expect(screen.queryByText('skippedBody')).not.toBeInTheDocument()
  })

  it('sends a skipped signed-in run to the day, and says so', () => {
    render(<OnboardingComplete createdHabit="" emoji="◎" remindersOff={false} skipped signedOut={false} dueToday general={false} onFinish={vi.fn()} />)
    expect(screen.getByText('skippedTitle')).toBeInTheDocument()
    expect(screen.getByText('skippedBody')).toBeInTheDocument()
    expect(screen.getByText('seeDay')).toBeInTheDocument()
  })

  it('never claims a habit is in the day when it is not due today', () => {
    render(<OnboardingComplete createdHabit="Walk" emoji="🚶" remindersOff={false} skipped={false} signedOut={false} dueToday={false} general={false} onFinish={vi.fn()} />)
    expect(screen.getByText('notTodayTitle')).toBeInTheDocument()
    expect(screen.getByText('notTodayBody')).toBeInTheDocument()
    expect(screen.getAllByText('notTodayPending').length).toBeGreaterThan(0)
    expect(screen.queryByText('pending')).not.toBeInTheDocument()
  })

  it('names the reminders-off outcome for a habit that waits for another day', () => {
    render(<OnboardingComplete createdHabit="Walk" emoji="🚶" remindersOff skipped={false} signedOut={false} dueToday={false} general={false} onFinish={vi.fn()} />)
    expect(screen.getByText('notTodayRemindersOffBody')).toBeInTheDocument()
    expect(screen.queryByText('notTodayBody')).not.toBeInTheDocument()
  })

  it('never offers a reminder to a habit with no set days', () => {
    render(<OnboardingComplete createdHabit="Meditate" emoji="🧘" remindersOff skipped={false} signedOut={false} dueToday={false} general onFinish={vi.fn()} />)
    expect(screen.getByText('generalTitle')).toBeInTheDocument()
    expect(screen.getByText('generalBody')).toBeInTheDocument()
    expect(screen.getAllByText('generalPending').length).toBeGreaterThan(0)
    expect(screen.queryByText('notTodayPending')).not.toBeInTheDocument()
    expect(screen.queryByText('notTodayRemindersOffBody')).not.toBeInTheDocument()
    expect(screen.queryByText('remindersOffBody')).not.toBeInTheDocument()
  })

  it('reports the local draft first when a general habit is built signed out', () => {
    render(<OnboardingComplete createdHabit="Meditate" emoji="🧘" remindersOff skipped={false} signedOut dueToday={false} general onFinish={vi.fn()} />)
    expect(screen.getByText('signedOutTitle')).toBeInTheDocument()
    expect(screen.getByText('signedOutBody')).toBeInTheDocument()
    expect(screen.getByText('signIn')).toBeInTheDocument()
    expect(screen.queryByText('generalBody')).not.toBeInTheDocument()
  })

  it('names the no-reminders outcome without plan copy', () => {
    render(<OnboardingComplete createdHabit="Read" emoji="📖" remindersOff skipped={false} signedOut={false} dueToday general={false} onFinish={vi.fn()} />)
    expect(screen.getByText('remindersOffBody')).toBeInTheDocument()
    expect(screen.queryByText(/Pro/u)).not.toBeInTheDocument()
  })

  describe('landing ring sweep', () => {
    const animate = vi.fn(() => ({ onfinish: null as (() => void) | null, cancel: vi.fn() }))
    const originalAnimate = Reflect.get(SVGElement.prototype, 'animate')
    const originalLength = Reflect.get(SVGElement.prototype, 'getTotalLength')
    const durations = motionDurations as unknown as Record<string, number>
    const easings = motionEasings as unknown as Record<string, readonly number[]>
    const originalSlow = durations.slow
    const originalEnter = easings.enter

    afterEach(() => {
      durations.slow = originalSlow!
      easings.enter = originalEnter!
      Reflect.set(SVGElement.prototype, 'animate', originalAnimate)
      Reflect.set(SVGElement.prototype, 'getTotalLength', originalLength)
      animate.mockClear()
    })

    function renderRing() {
      Reflect.set(SVGElement.prototype, 'animate', animate)
      Reflect.set(SVGElement.prototype, 'getTotalLength', () => 97)
      render(<OnboardingComplete createdHabit="Read" emoji="📖" remindersOff={false} skipped={false} signedOut={false} dueToday general={false} onFinish={vi.fn()} />)
    }

    it('sweeps on the shared enter easing', () => {
      easings.enter = [0.1, 0.2, 0.3, 0.4]
      renderRing()
      expect(animate).toHaveBeenCalledOnce()
      const options = (animate.mock.calls[0] as unknown as [unknown, { easing: string }])[1]
      expect(options.easing).toBe('cubic-bezier(0.1, 0.2, 0.3, 0.4)')
    })

    it('sweeps for the shared slow duration', () => {
      durations.slow = 333
      renderRing()
      const options = (animate.mock.calls[0] as unknown as [unknown, { duration: number }])[1]
      expect(options.duration).toBe(333)
    })
  })
})
