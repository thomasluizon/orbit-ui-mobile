import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { OnboardingCreateHabit } from '@/components/onboarding/onboarding-create-habit'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: { allowance: number }) => values ? `${key}:${values.allowance}` : key }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: () => <div data-testid="time-field" /> }))

const base = { emoji: '🚶', days: ['Monday'], dueTime: '18:00', proposed: false, correcting: true, atLimit: false, allowance: 5, onCorrect: vi.fn(), onEmojiChange: vi.fn(), onToggleDay: vi.fn(), onTimeChange: vi.fn() }

describe('OnboardingCreateHabit', () => {
  it('shows direct controls without Astra framing', () => {
    render(<OnboardingCreateHabit {...base} />)
    expect(screen.getByText('when.direct')).toBeInTheDocument()
    expect(screen.getByTestId('time-field')).toBeInTheDocument()
    expect(screen.queryByText('proposedBy')).not.toBeInTheDocument()
  })

  it('requires a tap before editing a proposed schedule', () => {
    const onCorrect = vi.fn()
    render(<OnboardingCreateHabit {...base} proposed correcting={false} onCorrect={onCorrect} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onCorrect).toHaveBeenCalledOnce()
  })

  it('states the daily allowance at the ceiling', () => {
    render(<OnboardingCreateHabit {...base} atLimit />)
    expect(screen.getByText('when.limit:5')).toBeInTheDocument()
  })
})
