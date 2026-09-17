import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import { OnboardingCreateHabit } from '@/components/onboarding/onboarding-create-habit'

const translations = vi.hoisted(() => ({
  current: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key,
}))

vi.mock('next-intl', () => ({ useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => translations.current(`${namespace}.${key}`, values) }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: () => <div data-testid="time-field" /> }))

const schedule = { frequencyUnit: 'Week' as const, frequencyQuantity: 3, intervalWeeks: 2, days: [], isGeneral: false, isFlexible: true, dueTime: '' }
const base = { emoji: '🚶', days: [], dueTime: '', schedule, proposed: false, correcting: true, atLimit: false, allowance: 5, onCorrect: vi.fn(), onEmojiChange: vi.fn(), onToggleDay: vi.fn(), onTimeChange: vi.fn(), onModeChange: vi.fn(), onQuantityChange: vi.fn(), onIntervalWeeksChange: vi.fn() }

describe('OnboardingCreateHabit', () => {
  beforeAll(async () => {
    const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
    const translate = createTranslator({ locale: 'en', messages: en })
    const translateKey = translate as unknown as (key: string, values?: Record<string, unknown>) => string
    translations.current = (key, values) => translateKey(key, values)
  })

  it('shows direct controls without Astra framing', () => {
    render(<OnboardingCreateHabit {...base} />)
    expect(screen.getByText('Pick the days and the time.')).toBeInTheDocument()
    expect(screen.getByTestId('time-field')).toBeInTheDocument()
    expect(screen.queryByText('Proposed by Astra')).not.toBeInTheDocument()
  })

  it('requires a tap before editing a proposed schedule', () => {
    const onCorrect = vi.fn()
    render(<OnboardingCreateHabit {...base} proposed correcting={false} onCorrect={onCorrect} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onCorrect).toHaveBeenCalledOnce()
  })

  it('states the daily allowance at the ceiling', () => {
    render(<OnboardingCreateHabit {...base} atLimit />)
    expect(screen.getByText(/5/)).toBeInTheDocument()
  })

  it('shows and corrects a flexible cadence without weekdays', () => {
    const onModeChange = vi.fn()
    const { rerender } = render(<OnboardingCreateHabit {...base} proposed correcting={false} onModeChange={onModeChange} />)

    expect(screen.getByText((_content, element) => element?.tagName === 'P' && element.textContent === '3 times a week, any day')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    rerender(<OnboardingCreateHabit {...base} proposed correcting onModeChange={onModeChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Set days' }))

    expect(onModeChange).toHaveBeenCalledWith('fixed')
    expect(screen.getByRole('button', { name: 'Repeat more often' })).toBeInTheDocument()
  })
})
