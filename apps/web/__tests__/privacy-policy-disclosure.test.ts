import React from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../../packages/shared/src/i18n/en.json'
import ptBR from '../../../packages/shared/src/i18n/pt-BR.json'
import {
  mobilePrivacyRetentionKeys as mobileRetentionKeys,
  mobilePrivacyThirdPartyKeys as mobileThirdPartyKeys,
  webPrivacyRetentionKeys as webRetentionKeys,
  webPrivacyThirdPartyKeys as webThirdPartyKeys,
} from '../../../packages/shared/src/i18n'
import PrivacyPage from '@/app/(public)/privacy/page'

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: typeof en
  children?: React.ReactNode
}>

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

const SECTION_METADATA_KEYS = new Set(['title', 'intro'])

function renderedKeys(section: Record<string, string>) {
  return Object.keys(section).filter((key) => !SECTION_METADATA_KEYS.has(key)).sort()
}

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]

  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('privacy policy disclosures', () => {
  it('renders the new processor and retention disclosures on web', () => {
    render(
      React.createElement(
        TestIntlProvider,
        {
          locale: 'en',
          messages: en,
        },
        React.createElement(PrivacyPage),
      ),
    )

    expect(screen.getByText(en.privacy.thirdParty.posthog)).toBeInTheDocument()
    expect(screen.getByText(en.privacy.retention.syncRecords)).toBeInTheDocument()
    expect(screen.getByText(en.privacy.retention.afterDeletion)).toBeInTheDocument()
  })

  it('wires every third party and retention disclosure on web and mobile', () => {
    const thirdPartyKeys = renderedKeys(en.privacy.thirdParty)
    const retentionKeys = renderedKeys(en.privacy.retention)

    expect([...webThirdPartyKeys].sort()).toEqual(thirdPartyKeys)
    expect([...mobileThirdPartyKeys].sort()).toEqual(thirdPartyKeys)
    expect([...webRetentionKeys].sort()).toEqual(retentionKeys)
    expect([...mobileRetentionKeys].sort()).toEqual(retentionKeys)
  })

  it('keeps the complete privacy key set identical across locales', () => {
    expect(flattenKeys(ptBR.privacy).sort()).toEqual(flattenKeys(en.privacy).sort())
  })

  it('names PostHog and Vercel in both locales', () => {
    expect(en.privacy.thirdParty.posthog).toContain('PostHog')
    expect(en.privacy.thirdParty.vercel).toContain('Vercel')
    expect(ptBR.privacy.thirdParty.posthog).toContain('PostHog')
    expect(ptBR.privacy.thirdParty.vercel).toContain('Vercel')
  })

  it.each([
    ['English', en.privacy.retention],
    ['Portuguese', ptBR.privacy.retention],
  ])('states every scheduled retention period in %s', (_locale, retention) => {
    expect(retention.reminderHistory).toContain('90')
    expect(retention.syncRecords).toContain('31')
    expect(retention.calendarSuggestions).toContain('14')
    expect(retention.billingRecords).toContain('30')
    expect(retention.billingRecords).toContain('90')
    expect(retention.afterDeletion).toContain('7')
  })

  it.each([
    ['English', en.privacy, '7 days after confirmation', '7 days after the end'],
    ['Portuguese', ptBR.privacy, '7 dias após a confirmação', '7 dias após o fim'],
  ])(
    'aligns the %s deletion disclosure with both backend deadlines',
    (_locale, privacy, confirmationDeadline, paidDeadline) => {
      expect(privacy.retention.afterDeletion).toContain(confirmationDeadline)
      expect(privacy.retention.afterDeletion).toContain(paidDeadline)
      expect(privacy.deletion.step4).toContain(confirmationDeadline)
      expect(privacy.deletion.step4).toContain(paidDeadline)
    },
  )

  it('discloses United States analytics processing and the current update month', () => {
    expect(en.privacy.dataResidency.body).toContain('United States')
    expect(ptBR.privacy.dataResidency.body).toContain('Estados Unidos')
    expect(en.privacy.lastUpdated).toBe('Last updated: August 2026')
    expect(ptBR.privacy.lastUpdated).toBe('Última atualização: agosto de 2026')
  })
})
