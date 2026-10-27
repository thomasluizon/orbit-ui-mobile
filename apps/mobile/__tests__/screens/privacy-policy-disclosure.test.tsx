import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '../../../../packages/shared/src/i18n/en.json'
import ptBR from '../../../../packages/shared/src/i18n/pt-BR.json'
import PrivacyScreen from '@/app/privacy'

const TestRenderer = require('react-test-renderer')

type TestNode = {
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

const translations = vi.hoisted<{ messages: Record<string, unknown> }>(() => ({
  messages: {},
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      let value: unknown = translations.messages
      for (const segment of key.split('.')) {
        value = (value as Record<string, unknown>)[segment]
      }
      return value as string
    },
    i18n: { language: 'en' },
  }),
}))

vi.mock('react-native-safe-area-context', async (original) => ({
  ...await original<typeof import('react-native-safe-area-context')>(),
  SafeAreaView: ({ children }: { children: React.ReactNode }) =>
    React.createElement('SafeAreaView', null, children),
}))

vi.mock('@/hooks/use-go-back-or-fallback', () => ({
  useGoBackOrFallback: () => vi.fn(),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => boolean) =>
    selector({ isAuthenticated: false }),
}))

translations.messages = en
afterEach(() => { translations.messages = en })

const SECTION_METADATA_KEYS = new Set(['title', 'intro'])

function disclosureValues(section: Record<string, string>) {
  return Object.entries(section)
    .filter(([key]) => !SECTION_METADATA_KEYS.has(key))
    .map(([, value]) => value)
}

function rendersText(root: TestNode, text: string) {
  return root.findAll(
    (node) => typeof node.props.children === 'string' && node.props.children.includes(text),
  ).length > 0
}

describe('PrivacyScreen disclosures', () => {
  it.each([
    ['en', en],
    ['pt-BR', ptBR],
  ])('renders cookies, consent, and withdrawal alongside processors in %s', (_locale, messages) => {
    translations.messages = messages
    let tree: { root: TestNode } | undefined
    TestRenderer.act(() => {
      tree = TestRenderer.create(<PrivacyScreen />)
    })

    expect(messages.privacy).toHaveProperty('cookies')
    for (const disclosure of Object.values(messages.privacy.cookies)) {
      expect(rendersText(tree!.root, disclosure)).toBe(true)
    }
    expect(rendersText(tree!.root, messages.privacy.thirdParty.sentry)).toBe(true)
    const textNodes = tree!.root.findAll((node) => typeof node.props.children === 'string')
    const text = textNodes.map((node) => node.props.children).join(' ')
    expect(text.indexOf(messages.privacy.thirdParty.posthog)).toBeLessThan(text.indexOf(messages.privacy.cookies.title))
    expect(text.indexOf(messages.privacy.cookies.title)).toBeLessThan(text.indexOf(messages.privacy.retention.title))
  })

  it('renders the new processor and retention disclosures on mobile', () => {
    let tree: { root: TestNode } | undefined
    TestRenderer.act(() => {
      tree = TestRenderer.create(<PrivacyScreen />)
    })

    const disclosures = [
      ...disclosureValues(en.privacy.thirdParty),
      ...disclosureValues(en.privacy.retention),
    ]
    for (const disclosure of disclosures) {
      expect(rendersText(tree!.root, disclosure)).toBe(true)
    }
    expect(rendersText(tree!.root, en.privacy.thirdParty.posthog)).toBe(true)
    expect(rendersText(tree!.root, en.privacy.retention.syncRecords)).toBe(true)
    expect(rendersText(tree!.root, en.privacy.retention.afterDeletion)).toBe(true)
  })

  it.each([
    ['en', en, 'Device data: a push notification token (to deliver reminders) and Android crash reports with device and OS details, a random installation ID, and an approximate city inferred from the request IP address. These reports do not include your name, email, or account details.'],
    ['pt-BR', ptBR, 'Dados do dispositivo: um token de notificação push (para enviar lembretes) e relatórios de falhas no Android com informações do aparelho e do sistema, um identificador aleatório da instalação e a cidade aproximada, estimada pelo endereço IP da conexão. Esses relatórios não incluem nome, e-mail nem dados da conta.'],
  ])('omits retired ad disclosures while retaining device disclosures in %s', (_locale, messages, deviceDisclosure) => {
    translations.messages = messages
    let tree: { root: TestNode } | undefined
    TestRenderer.act(() => {
      tree = TestRenderer.create(<PrivacyScreen />)
    })

    const text = tree!.root.findAll((node) => typeof node.props.children === 'string')
      .map((node) => node.props.children).join(' ')
    expect(text).not.toMatch(/AdMob|ad SDK|SDK de anúncios|advertising identifier|identificador de publicidade|privacy\.thirdParty\.admob/i)
    expect(messages.privacy.thirdParty).not.toHaveProperty('admob')
    expect(messages.privacy.dataCollected.device).toBe(deviceDisclosure)
    expect(rendersText(tree!.root, deviceDisclosure)).toBe(true)
    expect(rendersText(tree!.root, messages.privacy.thirdParty.googlePlay)).toBe(true)
  })

  it('shows the cutover processors and data locations', () => {
    let tree: { root: TestNode } | undefined
    TestRenderer.act(() => {
      tree = TestRenderer.create(<PrivacyScreen />)
    })

    expect(en.privacy.thirdParty).toEqual(expect.objectContaining({
      ses: expect.stringContaining('Amazon SES'),
      s3: expect.stringContaining('Amazon S3'),
      render: expect.stringContaining('Render'),
      turnstile: expect.stringContaining('Cloudflare Turnstile'),
    }))
    expect(en.privacy.thirdParty).not.toHaveProperty('resend')
    expect(en.privacy.thirdParty).not.toHaveProperty('vercel')
    expect(en.privacy.dataResidency.body).toContain('Ohio')
    expect(en.privacy.dataResidency.body).toContain('us-east-2')
    expect(rendersText(tree!.root, en.privacy.dataResidency.body)).toBe(true)
  })
})

it.each([['en', en], ['pt-BR', ptBR]] as const)('renders Notion access and retention disclosures in %s', (_locale, messages) => {
  translations.messages = messages
  let tree: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<PrivacyScreen />) })
  expect(rendersText(tree.root, messages.privacy.thirdParty.notion)).toBe(true)
  expect(rendersText(tree.root, messages.privacy.retention.notion)).toBe(true)
  TestRenderer.act(() => tree.unmount())
  translations.messages = en
})
