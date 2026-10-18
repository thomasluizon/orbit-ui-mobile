import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitScheduleFields } from '@/components/habits/habit-form-fields/habit-schedule-fields'

describe.each([
  { locale: 'en', messages: en, units: ['day', 'week', 'month', 'year'] },
  { locale: 'pt-BR', messages: ptBR, units: ['dia', 'semana', 'mês', 'ano'] },
])('flexible schedule copy in $locale', ({ locale, messages, units }) => {
  it.each(['Day', 'Week', 'Month', 'Year'] as const)('renders whole singular and plural sentences for %s', (unit) => {
    const period = units[['Day', 'Week', 'Month', 'Year'].indexOf(unit)]
    const sentence = (quantity: number) => locale === 'en'
      ? `Complete ${quantity === 1 ? 'once' : `${quantity} times`} a ${period}`
      : `Conclua ${quantity === 1 ? 'uma vez' : `${quantity} vezes`} por ${period}`
    const fields = (quantity: number) => <NextIntlClientProvider locale={locale} messages={messages}>
      <HabitScheduleFields unit={unit} quantity={quantity} flexible disabled={false} onChange={vi.fn()} />
    </NextIntlClientProvider>
    const view = render(fields(1))
    expect(screen.getByText(sentence(1))).toBeVisible()
    view.rerender(fields(3))
    expect(screen.getByText(sentence(3))).toBeVisible()
    view.rerender(fields(0))
    expect(screen.queryByText(sentence(0))).toBeNull()
    expect(screen.getByRole('spinbutton')).toHaveAccessibleDescription(messages.habits.form.frequencyRequired)
  })
})
