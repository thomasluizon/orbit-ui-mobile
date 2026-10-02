import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import { MAX_HABIT_INTERVAL_WEEKS } from '@orbit/shared/types/habit'
import { buildHabitUnderstandingLabels, buildHabitUnderstandingSentence, readHabitPhrase } from '@orbit/shared/utils'
import { HabitRepeatInterval, HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'

const translate = createTranslator({ locale: 'en', messages: en }) as (key: string, values?: Record<string, string | number>) => string
const labels = buildHabitUnderstandingLabels(translate)
const dayOptions = Object.entries(en.dates.daysShort).map(([day, label]) => ({
  value: day.charAt(0).toUpperCase() + day.slice(1), label,
  accessibleLabel: en.dates.daysLong[day as keyof typeof en.dates.daysLong],
}))

function EditableUnderstanding({ phrase, scheduleLocked = false, onQuantityChange, onToggleDay }: Readonly<{
  phrase: string
  scheduleLocked?: boolean
  onQuantityChange: (quantity: number) => void
  onToggleDay: (day: string) => void
}>) {
  const parsed = readHabitPhrase(phrase, 'en')
  const [quantity, setQuantity] = useState(parsed.frequencyQuantity ?? 1)
  const [days, setDays] = useState(parsed.days)
  const flexible = parsed.cadence === 'flexible'
  const sentence = buildHabitUnderstandingSentence(days, dayOptions, flexible,
    parsed.cadence === 'fixed' ? 'Day' : flexible ? 'Week' : null, quantity, parsed.dueTime ?? '', 'en', translate)
  return <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <HabitUnderstanding value={phrase} emoji="" days={days} dayOptions={dayOptions} quantity={quantity}
      mode={flexible ? 'flexible' : 'fixed'} sentence={sentence} consumed={parsed.consumed} labels={labels}
      scheduleLocked={scheduleLocked} onValueChange={() => {}} onEmojiSelect={() => {}}
      onQuantityChange={(next) => { setQuantity(next); onQuantityChange(next) }}
      onToggleDay={(day) => { setDays(days.includes(day) ? days.filter((selected) => selected !== day) : [...days, day]); onToggleDay(day) }} />
    <output aria-label="Saved quantity">{quantity}</output>
  </NextIntlClientProvider>
}

function EditableRepeat({ initialWeeks, scheduleLocked = false, onChange }: Readonly<{
  initialWeeks: number
  scheduleLocked?: boolean
  onChange: (weeks: number) => void
}>) {
  const [intervalWeeks, setIntervalWeeks] = useState(initialWeeks)
  return <HabitRepeatInterval visible intervalWeeks={intervalWeeks} scheduleLocked={scheduleLocked} labels={labels}
    onIntervalWeeksChange={(next) => { setIntervalWeeks(next); onChange(next) }} />
}

describe('habit understanding corrections', () => {
  it.each(['Run 3 times a week', 'Read'])('changes the quantity and clamps it at one for %s', (phrase) => {
    const onQuantityChange = vi.fn()
    render(<EditableUnderstanding phrase={phrase} onQuantityChange={onQuantityChange} onToggleDay={vi.fn()} />)
    const initial = readHabitPhrase(phrase, 'en').frequencyQuantity ?? 1
    fireEvent.click(screen.getByRole('button', { name: labels.more }))
    expect(screen.getByLabelText('Saved quantity')).toHaveTextContent(String(initial + 1))
    fireEvent.click(screen.getByRole('button', { name: labels.less }))
    expect(screen.getByLabelText('Saved quantity')).toHaveTextContent(String(initial))
    for (let index = 0; index <= initial; index++) fireEvent.click(screen.getByRole('button', { name: labels.less }))
    expect(screen.getByLabelText('Saved quantity')).toHaveTextContent('1')
    expect(onQuantityChange).toHaveBeenLastCalledWith(1)
  })

  it('changes weekday selection through the real schedule controls', () => {
    const onToggleDay = vi.fn()
    render(<EditableUnderstanding phrase="Run 3 times a week" onQuantityChange={vi.fn()} onToggleDay={onToggleDay} />)
    const monday = screen.getByRole('button', { name: en.dates.daysLong.monday })
    expect(monday).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(monday)
    expect(monday).toHaveAttribute('aria-pressed', 'true')
    expect(onToggleDay).toHaveBeenCalledWith('Monday')
    fireEvent.click(monday)
    expect(monday).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not change a locked quantity or weekday', () => {
    const onQuantityChange = vi.fn()
    const onToggleDay = vi.fn()
    render(<EditableUnderstanding phrase="Run 3 times a week" scheduleLocked onQuantityChange={onQuantityChange} onToggleDay={onToggleDay} />)
    for (const name of [labels.less, labels.more, en.dates.daysLong.monday]) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    expect(onQuantityChange).not.toHaveBeenCalled()
    expect(onToggleDay).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Saved quantity')).toHaveTextContent('3')
  })
})

describe('habit repeat interval', () => {
  it.each([1, MAX_HABIT_INTERVAL_WEEKS])('changes weeks and blocks the bound at %s', (initialWeeks) => {
    const onChange = vi.fn()
    render(<EditableRepeat initialWeeks={initialWeeks} onChange={onChange} />)
    const atMinimum = initialWeeks === 1
    const blockedLabel = atMinimum ? labels.repeatLess : labels.repeatMore
    const allowedLabel = atMinimum ? labels.repeatMore : labels.repeatLess
    const blocked = screen.getByRole('button', { name: blockedLabel })
    expect(blocked).toBeDisabled()
    fireEvent.click(blocked)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(labels.repeat(initialWeeks))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: allowedLabel }))
    expect(screen.getByText(labels.repeat(initialWeeks + (atMinimum ? 1 : -1)))).toBeInTheDocument()
    expect(blocked).toBeEnabled()
    fireEvent.click(blocked)
    expect(screen.getByText(labels.repeat(initialWeeks))).toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('does not change a locked repeat interval', () => {
    const onChange = vi.fn()
    render(<EditableRepeat initialWeeks={2} scheduleLocked onChange={onChange} />)
    for (const name of [labels.repeatLess, labels.repeatMore]) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(labels.repeat(2))).toBeInTheDocument()
  })
})
