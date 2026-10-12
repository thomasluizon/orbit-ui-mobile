import { useState } from 'react'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import type { OnboardingSchedule } from '@orbit/shared/utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { OnboardingCreateHabit } from '@/components/onboarding/onboarding-create-habit'

const translations = vi.hoisted(() => ({
  locale: 'en',
  current: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key,
}))

vi.mock('next-intl', () => ({ useLocale: () => translations.locale, useTranslations: (namespace?: string) => (key: string, values?: Record<string, unknown>) => translations.current(namespace ? `${namespace}.${key}` : key, values) }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: () => <div data-testid="time-field" /> }))

const schedule = { frequencyUnit: 'Week' as const, frequencyQuantity: 3, intervalWeeks: 2, days: [], isGeneral: false, isFlexible: true, dueTime: '' }
const base = { title: 'Walk outside', emoji: '🚶', days: [], dueTime: '', schedule, proposed: false, correcting: true, canSaveRepeatWeeks: true, atLimit: false, allowance: 5, onCorrect: vi.fn(), onToggleDay: vi.fn(), onTimeChange: vi.fn(), onModeChange: vi.fn(), onFrequencyUnitChange: vi.fn(), onQuantityChange: vi.fn(), onIntervalWeeksChange: vi.fn() }

const everyThirdMonday = { ...schedule, frequencyUnit: 'Day' as const, frequencyQuantity: 1, intervalWeeks: 3, days: ['Monday'], isFlexible: false }

function EditableSchedule({ initialSchedule, onQuantityChange = () => {}, onIntervalWeeksChange = () => {} }: Readonly<{
  initialSchedule: OnboardingSchedule
  onQuantityChange?: (quantity: number) => void
  onIntervalWeeksChange?: (weeks: number) => void
}>) {
  const [currentSchedule, setSchedule] = useState(initialSchedule)
  return <>
    <OnboardingCreateHabit {...base} schedule={currentSchedule}
      onQuantityChange={(frequencyQuantity) => { setSchedule({ ...currentSchedule, frequencyQuantity }); onQuantityChange(frequencyQuantity) }}
      onIntervalWeeksChange={(intervalWeeks) => { setSchedule({ ...currentSchedule, intervalWeeks }); onIntervalWeeksChange(intervalWeeks) }} />
    <output aria-label="Saved quantity">{currentSchedule.frequencyQuantity}</output>
    <output aria-label="Saved repeat weeks">{currentSchedule.intervalWeeks}</output>
  </>
}

const weekdayCases = [
  ['Sunday', 'todo domingo', 'domingos', false],
  ['Monday', 'toda segunda', 'segundas', true],
  ['Tuesday', 'toda terça', 'terças', true],
  ['Wednesday', 'toda quarta', 'quartas', true],
  ['Thursday', 'toda quinta', 'quintas', true],
  ['Friday', 'toda sexta', 'sextas', true],
  ['Saturday', 'todo sábado', 'sábados', false],
] as const
const scheduleCases = [
  ...weekdayCases.map(([day, single]) => ({ days: [day], portuguese: single, english: `every ${day}`, weeks: 1 })),
  ...weekdayCases.flatMap(([first, , firstPlural, firstFeminine], index) =>
    weekdayCases.slice(index + 1).map(([second, , secondPlural, secondFeminine]) => ({
      days: [first, second],
      portuguese: `${firstFeminine ? 'às' : 'aos'} ${firstPlural} e ${firstFeminine === secondFeminine ? '' : secondFeminine ? 'às ' : 'aos '}${secondPlural}`,
      english: `every ${first} and ${second}`, weeks: 1,
    }))),
  { days: ['Monday', 'Thursday', 'Saturday'], portuguese: 'às segundas, quintas e aos sábados', english: 'every Monday, Thursday and Saturday', weeks: 1 },
  { days: ['Sunday'], portuguese: 'a cada 2 semanas, aos domingos', english: 'every 2 weeks on Sunday', weeks: 2 },
  { days: ['Monday'], portuguese: 'a cada 2 semanas, às segundas', english: 'every 2 weeks on Monday', weeks: 2 },
  { days: ['Friday', 'Saturday'], portuguese: 'a cada 2 semanas, às sextas e aos sábados', english: 'every 2 weeks on Friday and Saturday', weeks: 2 },
  { days: weekdayCases.map(([day]) => day), portuguese: 'a cada 2 semanas, aos domingos, às segundas, terças, quartas, quintas, sextas e aos sábados', english: 'every 2 weeks on Sunday, Monday, Tuesday, Wednesday, Thursday, Friday and Saturday', weeks: 2 },
]
const localizedScheduleCases = scheduleCases.flatMap((scheduleCase) =>
  (['en', 'pt-BR'] as const).flatMap((locale) => ['', '08:00'].map((time) => ({
    ...scheduleCase, locale, time,
    expected: `${locale === 'en' ? scheduleCase.english : scheduleCase.portuguese}${time ? `${locale === 'en' ? ' at ' : ' às '}${time}` : ''}`,
  }))))

describe('OnboardingCreateHabit', () => {
  beforeAll(async () => {
    const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
    const translate = createTranslator({ locale: 'en', messages: en })
    const translateKey = translate as unknown as (key: string, values?: Record<string, unknown>) => string
    translations.current = (key, values) => translateKey(key, values)
  })

  it.each(localizedScheduleCases)('formats onboarding $days in $locale at $time every $weeks weeks', async ({ days, locale, time, weeks, expected }) => {
    const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
    const previous = translations.current
    translations.locale = locale
    translations.current = createTranslator({ locale, messages: locale === 'en' ? en : ptBR }) as (key: string, values?: Record<string, unknown>) => string
    try {
      const { container } = render(<OnboardingCreateHabit {...base} proposed correcting={false} schedule={{ ...everyThirdMonday, days, intervalWeeks: weeks, dueTime: time }} />)
      expect(container.textContent).not.toMatch(/toda (sábado|domingo)|todo (segunda|terça|quarta|quinta|sexta)/)
      expect(container.querySelector('p')?.textContent).toBe(expected)
      expect(screen.getByRole('button', { name: locale === 'en' ? 'Correct schedule. Emoji proposed by Astra' : 'Corrigir agenda. Emoji proposto pela Astra' })).toHaveAccessibleDescription(expect.stringContaining(expected))
    } finally {
      translations.locale = 'en'
      translations.current = previous
    }
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
    const proposal = screen.getByRole('button', { name: 'Correct schedule. Emoji proposed by Astra' })
    expect(proposal).toHaveAccessibleDescription(/Walk outside.*3 times a week, any day.*Any time/)
    fireEvent.click(proposal)
    expect(onCorrect).toHaveBeenCalledOnce()
  })

  it('announces the proposal emoji through the correction button', () => {
    render(<OnboardingCreateHabit {...base} proposed correcting={false} />)
    expect(screen.getByRole('img', { name: 'Emoji proposed by Astra' })).toHaveTextContent('🚶')
    expect(screen.getByRole('button', { name: 'Correct schedule. Emoji proposed by Astra' })).toHaveAccessibleDescription(/Walk outside.*3 times a week, any day.*Any time/)
  })

  it('omits the proposal emoji well when no emoji was proposed', () => {
    render(<OnboardingCreateHabit {...base} emoji="" proposed correcting={false} />)
    expect(screen.queryByRole('img', { name: 'Emoji proposed by Astra' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Correct schedule' })).toBeInTheDocument()
  })

  it('names the proposal emoji in Portuguese', async () => {
    const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
    const translate = createTranslator({ locale: 'pt-BR', messages: ptBR }) as (key: string, values?: Record<string, unknown>) => string
    const previous = translations.current
    translations.current = translate
    try {
      render(<OnboardingCreateHabit {...base} proposed correcting={false} />)
      expect(screen.getByRole('img', { name: 'Emoji proposto pela Astra' })).toHaveTextContent('🚶')
      expect(screen.getByRole('button', { name: 'Corrigir agenda. Emoji proposto pela Astra' })).toBeInTheDocument()
    } finally {
      translations.locale = 'en'
      translations.current = previous
    }
  })

  it('states the daily allowance at the ceiling', () => {
    render(<OnboardingCreateHabit {...base} atLimit />)
    expect(screen.getByText(/5/)).toBeInTheDocument()
  })

  it('shows and corrects a flexible cadence without weekdays', () => {
    const onModeChange = vi.fn()
    const { rerender } = render(<OnboardingCreateHabit {...base} proposed correcting={false} onModeChange={onModeChange} />)

    expect(screen.getByText((_content, element) => element?.tagName === 'P' && element.textContent === '3 times a week, any day')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Correct schedule. Emoji proposed by Astra' }))
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
  it.each([
    ['flexible', schedule, 'Fewer times', 'More times'],
    ['interval', { ...schedule, frequencyQuantity: 3, isFlexible: false }, 'Repeat sooner', 'Repeat later'],
  ] as const)('updates the %s quantity and blocks the minimum', (_mode, initialSchedule, lessLabel, moreLabel) => {
    const onQuantityChange = vi.fn()
    render(<EditableSchedule initialSchedule={initialSchedule} onQuantityChange={onQuantityChange} />)
    fireEvent.click(screen.getByRole('button', { name: lessLabel }))
    expect(screen.getByLabelText('Saved quantity')).toHaveTextContent('2')
    fireEvent.click(screen.getByRole('button', { name: moreLabel }))
    expect(screen.getByLabelText('Saved quantity')).toHaveTextContent('3')
    fireEvent.click(screen.getByRole('button', { name: lessLabel }))
    fireEvent.click(screen.getByRole('button', { name: lessLabel }))
    expect(screen.getByLabelText('Saved quantity')).toHaveTextContent('1')
    onQuantityChange.mockClear()
    const less = screen.getByRole('button', { name: lessLabel })
    expect(less).toBeDisabled()
    fireEvent.click(less)
    expect(onQuantityChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Saved quantity')).toHaveTextContent('1')
  })

  it.each([1, MAX_HABIT_INTERVAL_WEEKS])('updates repeat weeks and blocks the bound at %s', (intervalWeeks) => {
    const onIntervalWeeksChange = vi.fn()
    render(<EditableSchedule initialSchedule={{ ...everyThirdMonday, intervalWeeks }} onIntervalWeeksChange={onIntervalWeeksChange} />)
    const atMinimum = intervalWeeks === 1
    const blockedLabel = atMinimum ? en.onboarding.flow.when.intervalLess : en.onboarding.flow.when.intervalMore
    const allowedLabel = atMinimum ? en.onboarding.flow.when.intervalMore : en.onboarding.flow.when.intervalLess
    const blocked = screen.getByRole('button', { name: blockedLabel })
    expect(blocked).toBeDisabled()
    fireEvent.click(blocked)
    expect(onIntervalWeeksChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Saved repeat weeks')).toHaveTextContent(String(intervalWeeks))
    fireEvent.click(screen.getByRole('button', { name: allowedLabel }))
    expect(screen.getByLabelText('Saved repeat weeks')).toHaveTextContent(String(intervalWeeks + (atMinimum ? 1 : -1)))
    expect(blocked).toBeEnabled()
    fireEvent.click(blocked)
    expect(screen.getByLabelText('Saved repeat weeks')).toHaveTextContent(String(intervalWeeks))
    expect(onIntervalWeeksChange).toHaveBeenCalledTimes(2)
  })

})
