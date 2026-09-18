import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnboardingRemind } from '@/components/onboarding/onboarding-remind'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('OnboardingRemind', () => {
  it('uses gap for the ask heading and body', () => {
    render(<OnboardingRemind state="ask" title="Walk" dueTime="18:00" isLive />)
    const intro = screen.getByRole('heading', { name: 'title' }).parentElement
    expect(intro).toHaveClass('flex', 'flex-col', 'gap-3')
    expect(screen.getByText('body')).not.toHaveClass('mt-3')
    expect(screen.getByText('Walk').parentElement).toHaveClass('flex', 'flex-col', 'gap-1')
    expect(screen.getByText('Walk')).not.toHaveClass('mt-1')
    expect(screen.getByText('fine').parentElement).toHaveClass('flex', 'flex-col', 'gap-2')
  })

  it.each([
    ['ask', 'body', 'signedOutBody'],
    ['denied', 'deniedBody', 'deniedSignedOutBody'],
    ['refused', 'refusedBody', 'refusedSignedOutBody'],
    ['unsupported', 'unsupportedBody', 'unsupportedSignedOutBody'],
    ['failed', 'failedBody', 'failedSignedOutBody'],
  ] as const)('never tells a signed-out run the %s habit is saved to an account', (state, liveBody, signedOutBody) => {
    const { unmount } = render(<OnboardingRemind state={state} title="Walk" dueTime="18:00" isLive={false} />)
    expect(screen.getByText(signedOutBody)).toBeInTheDocument()
    expect(screen.queryByText(liveBody)).toBeNull()
    unmount()

    render(<OnboardingRemind state={state} title="Walk" dueTime="18:00" isLive />)
    expect(screen.getByText(liveBody)).toBeInTheDocument()
  })

  it('keeps one body for a schedule gap, which claims nothing about storage', () => {
    const { unmount } = render(<OnboardingRemind state="no-day" title="Meditate" dueTime="07:00" isLive={false} />)
    expect(screen.getByText('noDayBody')).toBeInTheDocument()
    unmount()

    render(<OnboardingRemind state="no-time" title="Meditate" dueTime="" isLive={false} />)
    expect(screen.getByText('noTimeBody')).toBeInTheDocument()
  })

  it('never promises a reminder to a habit with no day of its own', () => {
    render(<OnboardingRemind state="no-day" title="Meditate" dueTime="07:00" isLive />)
    expect(screen.getByRole('heading', { name: 'noDayTitle' })).toBeInTheDocument()
    expect(screen.getByText('noDayBody')).toBeInTheDocument()
    expect(screen.queryByText('notificationBody')).not.toBeInTheDocument()
    expect(screen.queryByText('fine')).not.toBeInTheDocument()
  })
})
