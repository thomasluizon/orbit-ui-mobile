import React from 'react'
import { StyleSheet } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import PrivacyScreen from '@/app/privacy'
import TermsScreen from '@/app/terms'

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
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
  useAuthStore: (select: (state: { isAuthenticated: boolean }) => boolean) =>
    select({ isAuthenticated: false }),
}))

const cases = [
  {
    Screen: PrivacyScreen,
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
    Screen: TermsScreen,
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

function nodeByTestId(root: TestNode, testID: string) {
  const node = root.findAll((candidate) => candidate.props.testID === testID)[0]
  if (!node) throw new Error(`Missing ${testID}`)
  return node
}

function directText(node: TestNode) {
  return node.findAll((child) =>
    typeof child.type === 'string' && typeof child.props.children === 'string',
  )
    .map((child) => child.props.children)
}

describe.each([
  { locale: 'en', messages: en },
  { locale: 'pt-BR', messages: ptBR },
])('legal document layout in $locale', ({ messages }) => {
  it.each(cases)('renders $key through the shared measured layout', ({ Screen, key, sectionKeys }) => {
    translations.messages = messages
    let tree: { root: TestNode; unmount: () => void } | undefined
    TestRenderer.act(() => {
      tree = TestRenderer.create(<Screen />)
    })

    const document = messages[key] as DocumentMessages
    const layout = nodeByTestId(tree!.root, 'legal-document')
    const sections = nodeByTestId(tree!.root, 'legal-document-sections')
    const closingNote = nodeByTestId(tree!.root, 'legal-document-closing')

    expect(StyleSheet.flatten(layout.props.style)).toMatchObject({
      maxWidth: 620,
      minWidth: 0,
      width: '100%',
    })
    expect(directText(layout)).toEqual(expect.arrayContaining([
      document.title,
      document.lastUpdated,
    ]))
    expect(directText(closingNote)).toEqual([
      document.contact.title,
      document.contact.body,
    ])

    const renderedSectionTitles = sections.findAll(
      (node) => typeof node.type === 'string'
        && node.props.testID === 'legal-document-section-title',
    ).map((node) => node.props.children)
    expect(renderedSectionTitles).toEqual(
      sectionKeys.map((sectionKey) => {
        const section = document[sectionKey]
        if (typeof section === 'string' || section === undefined) {
          throw new Error(`${sectionKey} is not a section`)
        }
        return section.title
      }),
    )
    tree!.unmount()
  })
})
