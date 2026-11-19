import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarHeader } from '@/app/(app)/calendar/_components/calendar-shell'

Element.prototype.scrollIntoView = vi.fn()

const TODAY = '2026-11-13'

function renderHeader({ locale = 'en', guided = true, currentMonth = new Date(2026, 10, 1) }: { locale?: 'en' | 'pt-BR'; guided?: boolean; currentMonth?: Date } = {}) {
  const handlers = { onCurrentMonth: vi.fn(), onSelectMonth: vi.fn(), onSelectDate: vi.fn() }
  render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC">
    <CalendarHeader currentMonth={currentMonth} todayKey={TODAY} previousMonthLabel="Previous" nextMonthLabel="Next"
      onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} guided={guided} {...handlers} />
  </NextIntlClientProvider>)
  const messages = locale === 'en' ? en : ptBR
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`, ${messages.calendar.monthPicker}$`) }))
  return handlers
}

function typeDate(label: string, phrase: string, action: string) {
  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value: phrase } })
  fireEvent.click(screen.getByRole('button', { name: action }))
}

describe('the month picker as one question', () => {
  it.each([
    ['en', 'Where do you want to go?', ['Today', 'Last month']],
    ['pt-BR', 'Para quando você quer ir?', ['Hoje', 'Mês passado']],
  ] as const)('shows the question as the title, two quick options and the free path in %s', (locale, question, options) => {
    renderHeader({ locale })
    const dialog = screen.getByRole('dialog', { name: question })
    expect(dialog).toHaveTextContent(question)
    for (const option of options) expect(screen.getByRole('button', { name: option })).toBeInTheDocument()
    const messages = locale === 'en' ? en : ptBR
    expect(screen.getByRole('textbox', { name: messages.calendar.monthPickerTyped })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: locale === 'en' ? 'Mar' : 'mar.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `2026, ${messages.common.selectYear}` })).toBeInTheDocument()
  })

  it('answers with the quick options in one press', () => {
    const today = renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(today.onCurrentMonth).toHaveBeenCalledTimes(1)
  })

  it('goes to last month from the quick option', () => {
    const handlers = renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Last month' }))
    expect(handlers.onSelectMonth).toHaveBeenCalledWith(9, 2026)
  })

  it('keeps the month grid as the free path', () => {
    const handlers = renderHeader()
    fireEvent.click(screen.getByRole('button', { name: 'Mar' }))
    expect(handlers.onSelectMonth).toHaveBeenCalledWith(2, 2026)
  })

  it('selects day 20 of the shown month from the typed "dia 20"', () => {
    const handlers = renderHeader({ locale: 'pt-BR', currentMonth: new Date(2026, 11, 1) })
    typeDate(ptBR.calendar.monthPickerTyped, 'dia 20', ptBR.calendar.monthPickerTypedSubmit)
    expect(handlers.onSelectDate).toHaveBeenCalledWith('2026-12-20')
  })

  it('reads the typed "sexta, dia 20" as the next day 20 on a Friday', () => {
    const handlers = renderHeader({ locale: 'pt-BR', currentMonth: new Date(2026, 11, 1) })
    typeDate(ptBR.calendar.monthPickerTyped, 'sexta, dia 20', ptBR.calendar.monthPickerTypedSubmit)
    expect(handlers.onSelectDate).toHaveBeenCalledWith('2027-08-20')
  })

  it('keeps the sheet open with one line of guidance when the text does not resolve', () => {
    const handlers = renderHeader()
    typeDate(en.calendar.monthPickerTyped, 'whenever', en.calendar.monthPickerTypedSubmit)
    expect(handlers.onSelectDate).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: en.calendar.monthPickerQuestion })).toBeInTheDocument()
    expect(screen.getByText(en.calendar.monthPickerTypedUnresolved)).toBeInTheDocument()
  })

  it('keeps the current picker with the guided flows off', () => {
    renderHeader({ guided: false })
    expect(screen.getByRole('dialog', { name: en.calendar.monthPicker })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Last month' })).toBeNull()
    expect(screen.queryByTestId('calendar-jump-question')).toBeNull()
  })
})
