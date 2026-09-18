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
const base = { title: 'Walk outside', emoji: '🚶', days: [], dueTime: '', schedule, proposed: false, correcting: true, canSaveRepeatWeeks: true, atLimit: false, allowance: 5, onCorrect: vi.fn(), onToggleDay: vi.fn(), onTimeChange: vi.fn(), onModeChange: vi.fn(), onFrequencyUnitChange: vi.fn(), onQuantityChange: vi.fn(), onIntervalWeeksChange: vi.fn() }

const everyThirdMonday = { ...schedule, frequencyUnit: 'Day' as const, frequencyQuantity: 1, intervalWeeks: 3, days: ['Monday'], isFlexible: false }

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
    expect(screen.getByText('Walk outside')).toBeInTheDocument()
    expect(screen.getByText('Leave empty for any time of day')).toBeInTheDocument()
    const proposal = screen.getByRole('button', { name: 'Correct schedule' })
    expect(proposal).toHaveAccessibleDescription(/Walk outside.*3 times a week, any day.*Any time/)
    fireEvent.click(proposal)
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
    fireEvent.click(screen.getByRole('button', { name: 'Correct schedule' }))
    rerender(<OnboardingCreateHabit {...base} proposed correcting onModeChange={onModeChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Set days' }))

    expect(onModeChange).toHaveBeenCalledWith('fixed')
    expect(screen.getByRole('button', { name: 'More times' })).toBeInTheDocument()
  })

  it.each([
    [{ ...schedule, frequencyUnit: null, frequencyQuantity: null, intervalWeeks: 1, isFlexible: false }, 'once'],
    [{ ...schedule, frequencyUnit: 'Week' as const, frequencyQuantity: 2, intervalWeeks: 1, isFlexible: false }, 'every 2 weeks'],
    [{ ...schedule, frequencyUnit: 'Month' as const, frequencyQuantity: 3, intervalWeeks: 1, isFlexible: false }, 'every 3 months'],
  ])('shows the saved cadence as %s', (savedSchedule, sentence) => {
    render(<OnboardingCreateHabit {...base} schedule={savedSchedule} proposed correcting={false} />)
    expect(screen.getByText((_content, element) => element?.tagName === 'P' && element.textContent === sentence)).toBeInTheDocument()
  })

  it('gives every weekday chip its full localized name', () => {
    render(<OnboardingCreateHabit {...base} schedule={{ ...schedule, frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 1, days: ['Monday'], isFlexible: false }} />)
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveTextContent('Sun')
    expect(screen.getByRole('button', { name: 'Saturday' })).toHaveTextContent('Sat')
  })

  it('never offers a repeat interval the saved habit would drop', () => {
    render(<OnboardingCreateHabit {...base} schedule={{ ...schedule, frequencyUnit: null, frequencyQuantity: null, intervalWeeks: 4, days: [], isGeneral: true, isFlexible: false }} />)
    expect(screen.getByRole('radio', { name: 'Set days' })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Repeat more often' })).not.toBeInTheDocument()
  })

  it('offers the repeat interval once a weekday carries it', () => {
    render(<OnboardingCreateHabit {...base} schedule={{ ...schedule, frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 4, days: ['Monday'], isFlexible: false }} />)
    expect(screen.getByRole('button', { name: 'Repeat more often' })).toBeInTheDocument()
    expect(screen.getByText('Every 4 weeks')).toBeInTheDocument()
  })

  it('hides the repeat stepper from a signed-out run, which cannot save one', () => {
    render(<OnboardingCreateHabit {...base} canSaveRepeatWeeks={false} schedule={everyThirdMonday} />)
    expect(screen.queryByRole('button', { name: 'Repeat more often' })).not.toBeInTheDocument()
    expect(screen.queryByText('Every 3 weeks')).not.toBeInTheDocument()
  })

  it('drops the interval from a signed-out cadence sentence', () => {
    const { rerender } = render(<OnboardingCreateHabit {...base} proposed correcting={false} canSaveRepeatWeeks={false} schedule={everyThirdMonday} />)
    const sentence = () => screen.getByText((_content, element) => element?.tagName === 'P').textContent
    expect(sentence()).toBe('every Monday')
    rerender(<OnboardingCreateHabit {...base} proposed correcting={false} canSaveRepeatWeeks schedule={everyThirdMonday} />)
    expect(sentence()).toBe('every 3 weeks on Monday')
  })

  it('lets a recurring proposal change its unit and quantity', () => {
    const onFrequencyUnitChange = vi.fn()
    const onQuantityChange = vi.fn()
    render(
      <OnboardingCreateHabit
        {...base}
        schedule={{ ...schedule, frequencyUnit: 'Week', frequencyQuantity: 2, isFlexible: false }}
        onFrequencyUnitChange={onFrequencyUnitChange}
        onQuantityChange={onQuantityChange}
      />,
    )

    expect(screen.getByRole('radio', { name: 'Repeat' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Months' }))
    fireEvent.click(screen.getByRole('button', { name: 'Repeat later' }))
    expect(onFrequencyUnitChange).toHaveBeenCalledWith('Month')
    expect(onQuantityChange).toHaveBeenCalledWith(3)
  })

  it.each([
    ['Day', 'times a day'],
    ['Week', 'times a week'],
    ['Month', 'times a month'],
    ['Year', 'times a year'],
  ] as const)('describes a flexible quantity using the selected %s unit', (frequencyUnit, description) => {
    render(
      <OnboardingCreateHabit
        {...base}
        schedule={{ ...schedule, frequencyUnit }}
      />,
    )
    expect(screen.getByText(description)).toBeInTheDocument()
  })

  it('shows a one-time proposal as the selected correction mode', () => {
    render(
      <OnboardingCreateHabit
        {...base}
        schedule={{ ...schedule, frequencyUnit: null, frequencyQuantity: null, isFlexible: false }}
      />,
    )
    expect(screen.getByRole('radio', { name: 'Once' })).toBeChecked()
  })
})
