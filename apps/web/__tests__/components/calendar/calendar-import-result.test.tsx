import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { CalendarImportResult } from '@/app/(app)/calendar/_components/calendar-import-result'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

function renderResult(locale: 'en' | 'pt-BR', count: number | null, onClose = vi.fn()) {
  render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR} timeZone="UTC"><CalendarImportResult count={count} onClose={onClose} /></NextIntlClientProvider>)
  return onClose
}

describe('the result dialog of a calendar import', () => {
  it.each([
    ['en', 1, 'Done!', '1 habit was created from your calendar.', 'View in Today'],
    ['en', 3, 'Done!', '3 habits were created from your calendar.', 'View in Today'],
    ['pt-BR', 1, 'Pronto!', '1 hábito foi criado a partir da sua agenda.', 'Ver no Hoje'],
    ['pt-BR', 3, 'Pronto!', '3 hábitos foram criados a partir da sua agenda.', 'Ver no Hoje'],
  ] as const)('states the server count in %s (%i)', (locale, count, title, sentence, action) => {
    const onClose = renderResult(locale, count)
    const dialog = screen.getByRole('dialog', { name: title })
    expect(dialog).toHaveAccessibleDescription(sentence)
    expect(dialog.querySelector('[data-asset="orbit-mascot"]')?.getAttribute('data-orbit-state')).toBe('feliz')
    fireEvent.click(screen.getByRole('button', { name: action }))
    expect(onClose).toHaveBeenCalled()
    expect(push).toHaveBeenLastCalledWith('/')
  })

  it('is absent until an import succeeds', () => {
    renderResult('en', null)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
