import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../../packages/shared/src/i18n/en.json'
import ptBR from '../../../packages/shared/src/i18n/pt-BR.json'
import PrivacyPage from '@/app/(public)/privacy/page'

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: typeof en
  children?: React.ReactNode
}>

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))


const REPO_ROOT = join(__dirname, '..', '..', '..')

type ArchitectureMap = {
  i18nOwnership: {
    byRoute: { sourceFile: string; keys: string[] }[]
    unowned: string[]
  }
}

const architecture: ArchitectureMap = (() => {
  execFileSync(process.execPath, [join(REPO_ROOT, 'tools', 'arch-map.mjs')], { cwd: REPO_ROOT, stdio: 'ignore' })
  return JSON.parse(readFileSync(join(REPO_ROOT, 'architecture.json'), 'utf8')) as ArchitectureMap
})()

const SECTION_METADATA_KEYS = new Set(['title', 'intro'])

function disclosureValues(section: Record<string, string>) {
  return Object.entries(section)
    .filter(([key]) => !SECTION_METADATA_KEYS.has(key))
    .map(([, value]) => value)
}

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]

  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('privacy policy disclosures', () => {
  it.each([
    ['en', en],
    ['pt-BR', ptBR],
  ])('renders cookies, consent, and withdrawal alongside processors in %s', (locale, messages) => {
    render(React.createElement(TestIntlProvider, { locale, messages }, React.createElement(PrivacyPage)))

    expect(messages.privacy).toHaveProperty('cookies')
    for (const disclosure of Object.values(messages.privacy.cookies)) {
      expect(screen.getByText(disclosure)).toBeInTheDocument()
    }
    expect(screen.getByText(messages.privacy.thirdParty.sentry)).toBeInTheDocument()
    const policyText = document.body.textContent
    expect(policyText.indexOf(messages.privacy.thirdParty.posthog)).toBeLessThan(policyText.indexOf(messages.privacy.cookies.title))
    expect(policyText.indexOf(messages.privacy.cookies.title)).toBeLessThan(policyText.indexOf(messages.privacy.retention.title))
  })

  it.each([
    ['English', en.privacy],
    ['Portuguese', ptBR.privacy],
  ])('explains browser storage and website consent in %s', (_locale, privacy) => {
    expect(privacy).toHaveProperty('cookies')
    expect(privacy.cookies.essential).toMatch(/auth_token/)
    expect(privacy.cookies.essential).toMatch(/refresh_token/)
    expect(privacy.cookies.essential).toMatch(/orbit_analytics_consent/)
    expect(privacy.cookies.analytics).toMatch(/PostHog/)
    expect(privacy.cookies.analytics).toMatch(/only after you select Allow|só depois que você escolhe Permitir/)
    expect(privacy.cookies.analytics).toMatch(/page views|páginas visitadas/)
    expect(privacy.cookies.analytics).toMatch(/page exits|saídas do site/)
    expect(privacy.cookies.analytics).toMatch(/Google Play/)
    expect(privacy.cookies.analytics).toMatch(/linked to your account|associado à sua conta/)
    expect(privacy.cookies.withdraw).toMatch(/browser settings|configurações do navegador/)
    expect(privacy.cookies.withdraw).toMatch(/useorbit.org/)
    expect(privacy.cookies.withdraw).toMatch(/Decline|Recusar/)
    expect(privacy.cookies.analytics).not.toMatch(/anonymous|anônim/i)
  })

  it.each([
    ['English', en.privacy],
    ['Portuguese', ptBR.privacy],
  ])('names retained crash identifiers instead of promising identifier removal in %s', (_locale, privacy) => {
    for (const disclosure of [privacy.thirdParty.sentry, privacy.dataCollected.device]) {
      expect(disclosure).toMatch(/device and OS|aparelho e do sistema/)
      expect(disclosure).toMatch(/random installation ID|identificador aleatório da instalação/)
      expect(disclosure).toMatch(/approximate city|cidade aproximada/)
      expect(disclosure).toMatch(/IP/)
      expect(disclosure).not.toMatch(/personal identifiers removed|identificadores pessoais removidos/)
    }
  })

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

    const disclosures = [
      ...disclosureValues(en.privacy.thirdParty),
      ...disclosureValues(en.privacy.retention),
    ]
    for (const disclosure of disclosures) {
      expect(screen.getByText(disclosure)).toBeInTheDocument()
    }
    expect(screen.getByText(en.privacy.thirdParty.posthog)).toBeInTheDocument()
    expect(screen.getByText(en.privacy.retention.syncRecords)).toBeInTheDocument()
    expect(screen.getByText(en.privacy.retention.afterDeletion)).toBeInTheDocument()
  })

  it('keeps the complete privacy key set identical across locales', () => {
    const compareKeys = (left: string, right: string) => left.localeCompare(right)
    expect(flattenKeys(ptBR.privacy).sort(compareKeys)).toEqual(
      flattenKeys(en.privacy).sort(compareKeys),
    )
  })

  it('keeps every processor, retention, and cookie disclosure owned by both privacy routes', () => {
    const disclosureKeys = [
      ...flattenKeys(en.privacy.thirdParty, 'privacy.thirdParty'),
      ...flattenKeys(en.privacy.retention, 'privacy.retention'),
      ...flattenKeys(en.privacy.cookies, 'privacy.cookies'),
    ].filter((key) => !key.endsWith('.title') && !key.endsWith('.intro'))

    for (const sourceFile of [
      'apps/web/app/(public)/privacy/page.tsx',
      'apps/mobile/app/privacy.tsx',
    ]) {
      const route = architecture.i18nOwnership.byRoute.find(
        (candidate) => candidate.sourceFile === sourceFile,
      )
      expect(route?.keys).toEqual(expect.arrayContaining(disclosureKeys))
    }
    expect(architecture.i18nOwnership.unowned).toEqual(
      expect.not.arrayContaining(disclosureKeys),
    )
  })

  it.each([
    ['English', en.privacy],
    ['Portuguese', ptBR.privacy],
  ])('names the cutover processors and removes retired processors in %s', (_locale, privacy) => {
    expect(privacy.thirdParty).toEqual(expect.objectContaining({
      google: expect.stringContaining('Google'),
      ses: expect.stringContaining('Amazon SES'),
      s3: expect.stringContaining('Amazon S3'),
      render: expect.stringContaining('Render'),
      posthog: expect.stringContaining('PostHog'),
      turnstile: expect.stringContaining('Cloudflare Turnstile'),
    }))
    expect(privacy.thirdParty).not.toHaveProperty('resend')
    expect(privacy.thirdParty).not.toHaveProperty('vercel')
    expect(privacy.thirdParty.posthog).toMatch(/traffic|tráfego/)
    expect(privacy.thirdParty.posthog).toMatch(/performance|desempenho/)
    expect(privacy.dataResidency.body).toContain('Ohio')
    expect(privacy.dataResidency.body).toContain('us-east-2')
    expect(privacy.dataResidency.body).not.toMatch(/Supabase|Vercel|Resend/)
  })

  it.each([
    ['English', en.privacy.thirdParty],
    ['Portuguese', ptBR.privacy.thirdParty],
  ])('separates every %s processor name from its purpose the same way', (_locale, thirdParty) => {
    for (const disclosure of disclosureValues(thirdParty)) {
      expect(disclosure).toMatch(/^[^:]+: \S/)
      expect(disclosure).not.toContain(' - ')
    }
  })

  it.each([
    ['en', en, 'Device data: a push notification token (to deliver reminders) and Android crash reports with device and OS details, a random installation ID, and an approximate city inferred from the request IP address. These reports do not include your name, email, or account details.'],
    ['pt-BR', ptBR, 'Dados do dispositivo: um token de notificação push (para enviar lembretes) e relatórios de falhas no Android com informações do aparelho e do sistema, um identificador aleatório da instalação e a cidade aproximada, estimada pelo endereço IP da conexão. Esses relatórios não incluem nome, e-mail nem dados da conta.'],
  ])('omits retired ad disclosures while retaining device disclosures in %s', (locale, messages, deviceDisclosure) => {
    render(React.createElement(TestIntlProvider, { locale, messages }, React.createElement(PrivacyPage)))

    expect(document.body.textContent).not.toMatch(/AdMob|ad SDK|SDK de anúncios|advertising identifier|identificador de publicidade|privacy\.thirdParty\.admob/i)
    expect(messages.privacy.thirdParty).not.toHaveProperty('admob')
    expect(messages.privacy.dataCollected.device).toBe(deviceDisclosure)
    expect(screen.getByText(deviceDisclosure)).toBeInTheDocument()
    expect(screen.getByText(messages.privacy.thirdParty.googlePlay)).toBeInTheDocument()
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

  it('discloses international processor locations and the current update month', () => {
    expect(en.privacy.dataResidency.body).toContain('United States')
    expect(ptBR.privacy.dataResidency.body).toContain('Estados Unidos')
    expect(en.privacy.dataResidency.body).toContain('Render hosts the web application, API, and database')
    expect(ptBR.privacy.dataResidency.body).toContain('A Render hospeda o aplicativo web, a API e o banco de dados')
    expect(en.privacy.lastUpdated).toBe('Last updated: October 2026')
    expect(ptBR.privacy.lastUpdated).toBe('Última atualização: outubro de 2026')
  })
})

it.each([['en', en], ['pt-BR', ptBR]] as const)('renders Notion access and retention disclosures in %s', (locale, messages) => {
  render(React.createElement(TestIntlProvider, { locale, messages }, React.createElement(PrivacyPage)))
  expect(screen.getByText(messages.privacy.thirdParty.notion)).toBeInTheDocument()
  expect(screen.getByText(messages.privacy.retention.notion)).toBeInTheDocument()
})
