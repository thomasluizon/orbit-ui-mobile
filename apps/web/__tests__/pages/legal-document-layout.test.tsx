import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import PrivacyPage from '@/app/(public)/privacy/page'
import TermsPage from '@/app/(public)/terms/page'

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (select: (state: { isAuthenticated: boolean }) => boolean) =>
    select({ isAuthenticated: false }),
}))

const cases = [
  {
    Page: PrivacyPage,
    key: 'privacy',
    sectionKeys: [
      'intro',
      'controller',
      'dataCollected',
      'howWeUse',
      'thirdParty',
      'retention',
      'googleScopes',
      'dataResidency',
      'automatedProcessing',
      'minors',
      'export',
      'noSell',
      'security',
      'deletion',
    ],
  },
  {
    Page: TermsPage,
    key: 'terms',
    sectionKeys: [
      'intro',
      'provider',
      'eligibility',
      'license',
      'subscription',
      'ai',
      'noMedicalAdvice',
      'warranty',
      'liability',
      'termination',
      'governingLaw',
      'changes',
    ],
  },
] as const

type DocumentMessages = {
  title: string
  lastUpdated: string
  contact: { title: string; body: string }
  [sectionKey: string]: string | { title: string; body?: string }
}

describe.each([
  { locale: 'en', messages: en },
  { locale: 'pt-BR', messages: ptBR },
])('legal document layout in $locale', ({ locale, messages }) => {
  it.each(cases)('renders $key through the shared measured layout', ({ Page, key, sectionKeys }) => {
    const document = messages[key] as DocumentMessages
    const { container } = render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <Page />
      </NextIntlClientProvider>,
    )

    const layout = container.querySelector('[data-legal-document]')
    const sections = container.querySelector('[data-legal-document-sections]')
    const closingNote = container.querySelector('[data-legal-document-closing]')

    expect(layout).toHaveAttribute('data-measure', '62ch')
    expect(layout).toHaveAttribute('data-reflow', 'wrap')
    expect(layout).toHaveClass('min-w-0')
    expect(layout!.querySelector('main')).toHaveClass('min-w-0', 'px-4')
    expect(layout).toHaveTextContent(document.title)
    expect(layout).toHaveTextContent(document.lastUpdated)
    expect(closingNote).toHaveTextContent(document.contact.title)
    expect(closingNote).toHaveTextContent(document.contact.body)

    const renderedSectionTitles = Array.from(sections!.querySelectorAll('h2')).map(
      (heading) => heading.textContent,
    )
    expect(renderedSectionTitles).toEqual(
      sectionKeys.map((sectionKey) => {
        const section = document[sectionKey]
        if (typeof section === 'string' || section === undefined) {
          throw new Error(`${sectionKey} is not a section`)
        }
        return section.title
      }),
    )
    expect(layout!.querySelectorAll('[class*="overflow-wrap:anywhere"]')).not.toHaveLength(0)
  })
})
