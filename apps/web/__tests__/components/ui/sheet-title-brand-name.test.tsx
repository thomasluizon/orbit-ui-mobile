import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { Sheet } from '@/components/ui/sheet'

describe.each([{ locale: 'en', messages: en }, { locale: 'pt-BR', messages: ptBR }] as const)('the sheet title in $locale', ({ locale, messages }) => {
  it.each([messages.profile.connections.notionQuestion, messages.onboarding.featureGuide.question])('keeps only the name Orbit out of a page translator in %s', (question) => {
    render(<NextIntlClientProvider locale={locale} messages={messages}><Sheet title={question} onClose={vi.fn()}><p>body</p></Sheet></NextIntlClientProvider>)
    expect(screen.getByRole('dialog', { name: question })).toBeInTheDocument()
    const title = document.querySelector('.orbit-sheet-title')!
    expect(title).toHaveTextContent(question)
    expect(title).not.toHaveAttribute('translate')
    expect([...title.querySelectorAll('[translate="no"]')].map((node) => node.textContent)).toEqual(['Orbit'])
  })

  it('leaves a title with no Orbit in it free to translate', () => {
    render(<NextIntlClientProvider locale={locale} messages={messages}><Sheet title={messages.common.never} onClose={vi.fn()}><p>body</p></Sheet></NextIntlClientProvider>)
    expect(document.querySelector('.orbit-sheet-title [translate="no"]')).toBeNull()
  })
})
