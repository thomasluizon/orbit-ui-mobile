import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnboardingRemind } from '@/components/onboarding/onboarding-remind'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('OnboardingRemind', () => {
  it('uses gap for the ask heading and body', () => {
    render(<OnboardingRemind state="ask" title="Walk" dueTime="18:00" />)
    const intro = screen.getByRole('heading', { name: 'title' }).parentElement
    expect(intro).toHaveClass('flex', 'flex-col', 'gap-3')
    expect(screen.getByText('body')).not.toHaveClass('mt-3')
    expect(screen.getByText('Walk').parentElement).toHaveClass('flex', 'flex-col', 'gap-1')
    expect(screen.getByText('Walk')).not.toHaveClass('mt-1')
    expect(screen.getByText('fine').parentElement).toHaveClass('flex', 'flex-col', 'gap-2')
  })
})
