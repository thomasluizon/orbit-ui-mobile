import React from 'react'
import * as ReactNative from 'react-native'
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
  SafeAreaView: (props: React.PropsWithChildren<{ edges?: string[] }>) =>
    React.createElement('SafeAreaView', props, props.children),
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
    titles: { en: ['Privacy', 'Privacy policy', 'Close privacy policy'], 'pt-BR': ['Privacidade', 'Política de privacidade', 'Fechar política de privacidade'] },
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
    titles: { en: ['Terms', 'Terms of use', 'Close terms of use'], 'pt-BR': ['Termos', 'Termos de uso', 'Fechar termos de uso'] },
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
])('legal document layout in $locale', ({ locale, messages }) => {
  it.each(cases)('renders $key through the shared measured layout', ({ Screen, key, sectionKeys, titles }) => {
    translations.messages = messages
    const dimensions = vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
      width: 412,
      height: 915,
      scale: 1,
      fontScale: 1,
    })
    let tree: { root: TestNode; unmount: () => void } | undefined
    TestRenderer.act(() => {
      tree = TestRenderer.create(<Screen />)
    })

    const document = messages[key] as DocumentMessages
    const layout = nodeByTestId(tree!.root, 'legal-document')
    const safeArea = tree!.root.findAll((node) => node.type === 'SafeAreaView')[0]
    if (!safeArea) throw new Error('Missing SafeAreaView')
    const sections = nodeByTestId(tree!.root, 'legal-document-sections')
    const closingNote = nodeByTestId(tree!.root, 'legal-document-closing')

    expect(ReactNative.StyleSheet.flatten(layout.props.style)).toMatchObject({
      maxWidth: 620,
      minWidth: 0,
      paddingHorizontal: 16,
      paddingTop: 16,
      width: '100%',
    })
    expect(safeArea.props.edges).toEqual(['top', 'bottom'])
    const [headerTitle, documentTitle, backLabel] = titles[locale as keyof typeof titles]
    const header = tree!.root.findAll((node) => node.type === 'Text'
      && node.props.accessibilityRole === 'header' && node.props.numberOfLines === 1)
    expect(header.map((node) => node.props.children)).toEqual([headerTitle])
    const backButton = tree!.root.findAll((node) => node.type === 'Pressable'
      && node.props.accessibilityRole === 'button')
    expect(backButton.map((node) => node.props.accessibilityLabel)).toEqual([backLabel])
    expect(directText(layout).filter((text) => text === documentTitle)).toHaveLength(1)
    expect(directText(tree!.root).filter((text) => text === documentTitle)).toHaveLength(1)
    expect(document.title).toBe(messages.about[key])
    expect(directText(layout)).toEqual(expect.arrayContaining([
      documentTitle,
      document.lastUpdated,
    ]))
    expect(directText(closingNote)).toEqual([
      document.contact.title,
      document.contact.body,
    ])
    const closingParagraph = closingNote.findAll(
      (node) => node.type === 'Text' && node.props.children === document.contact.body,
    )[0]!
    expect(ReactNative.StyleSheet.flatten(closingParagraph.props.style)).toMatchObject({
      fontSize: 16,
      lineHeight: 24.8,
      color: '#F4F4F6',
    })

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
    dimensions.mockRestore()
  })
})
