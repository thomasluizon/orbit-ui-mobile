import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotFoundContent } from '@/components/ui/not-found-content'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { resolveShellDestination } from '@orbit/shared/utils'
it.each([
  { locale: 'en', messages: en, action: 'Go to Today' },
  { locale: 'pt-BR', messages: ptBR, action: 'Ir para Hoje' },
])('exposes the drawn Today action as a keyboard accessible link in $locale', async ({ locale, messages, action }) => {
  const user = userEvent.setup()
  render(<NextIntlClientProvider locale={locale} messages={messages}><NotFoundContent /></NextIntlClientProvider>)
  expect(screen.getByRole('heading')).toHaveTextContent(messages.notFoundPage.title)
  const link = screen.getByRole('link', { name: action })
  expect(link).toHaveAttribute('href', '/')
  const activate = vi.fn((event: Event) => event.preventDefault())
  link.addEventListener('click', activate)
  await user.tab()
  expect(link).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(activate).toHaveBeenCalledOnce()
})

it('leaves an unknown path without a destination', () => {
  expect(resolveShellDestination('/nao-existe')).toBeNull()
})
