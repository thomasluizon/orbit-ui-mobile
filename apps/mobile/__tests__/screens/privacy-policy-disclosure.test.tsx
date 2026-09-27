import React from 'react'
import { describe, expect, it, vi } from 'vitest'
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

vi.mock('react-native-safe-area-context', () => ({
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

  it('shows the legacy AdMob disclosure', () => {
    let tree: { root: TestNode } | undefined
    TestRenderer.act(() => {
      tree = TestRenderer.create(<PrivacyScreen />)
    })

    expect(rendersText(tree!.root, en.privacy.thirdParty.admob)).toBe(true)
    expect(en.privacy.dataCollected.device).toBe('Device data: a push notification token (to deliver reminders) and crash diagnostics with personal identifiers removed. On Orbit for Android before version 1.3.35, also your device advertising identifier, which the ad SDK could access')
    expect(ptBR.privacy.dataCollected.device).toBe('Dados do dispositivo: um token de notificação push (para enviar lembretes) e diagnósticos de falhas com identificadores pessoais removidos. No Orbit para Android antes da versão 1.3.35, também o identificador de publicidade do seu dispositivo, que o SDK de anúncios podia acessar')
    expect(rendersText(tree!.root, en.privacy.dataCollected.device)).toBe(true)
  })
})
