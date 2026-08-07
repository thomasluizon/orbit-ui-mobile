import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import en from '../../../../packages/shared/src/i18n/en.json'
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

    expect(rendersText(tree!.root, en.privacy.thirdParty.posthog)).toBe(true)
    expect(rendersText(tree!.root, en.privacy.retention.syncRecords)).toBe(true)
    expect(rendersText(tree!.root, en.privacy.retention.afterDeletion)).toBe(true)
  })
})
