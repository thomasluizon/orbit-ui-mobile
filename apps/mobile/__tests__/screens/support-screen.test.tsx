import { controlStyle } from '@/__tests__/support/press-feedback'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'

import SupportScreen from '@/app/support'
import { getAppVersion } from '@/lib/app-version'
import { ShellScrollerClearanceContext } from '@/components/shell/shell-scroller-clearance'
import { i18n } from '@/lib/i18n'
import { __resetTestHostConfig, __setFocusImpl, __setTouchMode, __setWindowDimensions } from '../../test-mocks/react-native'
import { focusHost, withFocusProvenance } from '../support/focus-provenance'

const TestRenderer = require('react-test-renderer')

type TestNode = {
  type: unknown
  props: Record<string, unknown>
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

const mocks = vi.hoisted(() => ({
  apiClient: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  isOnline: true,
  profile: null as ReturnType<typeof createMockProfile> | null,
  goBack: vi.fn(),
  routerPush: vi.fn(),
  focusInput: vi.fn(),
  focusSubject: vi.fn(),
  announceForAccessibility: vi.fn(),
  nativeVersion: null as string | null,
  expoVersion: new Map<string, string>().get('version'),
  translations: new Map<string, string>(),
}))

vi.mock('expo-application', () => ({
  get nativeApplicationVersion() {
    return mocks.nativeVersion
  },
}))

vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return mocks.expoVersion ? { version: mocks.expoVersion } : undefined
    },
  },
}))

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>()
  const ReactModule = await import('react')
  return {
    ...actual,
    AccessibilityInfo: {
      ...actual.AccessibilityInfo,
      announceForAccessibility: (...args: unknown[]) =>
        mocks.announceForAccessibility(...args),
    },
    TextInput: ReactModule.forwardRef((props: Record<string, unknown>, ref) => {
      ReactModule.useImperativeHandle(ref, () => ({
        focus: () => mocks.focusInput(props.accessibilityLabel),
      }))
      return ReactModule.createElement('TextInput', props)
    }),
  }
})

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      mocks.translations.get(key) ?? (params ? `${key}(${JSON.stringify(params)})` : key),
  }),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (...args: unknown[]) => mocks.getItem(...args),
    setItem: (...args: unknown[]) => mocks.setItem(...args),
    removeItem: (...args: unknown[]) => mocks.removeItem(...args),
  },
}))

vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: mocks.isOnline }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mocks.profile }) }))
vi.mock('@/hooks/use-go-back-or-fallback', () => ({ useGoBackOrFallback: () => mocks.goBack }))
vi.mock('expo-router', () => ({
  useRootNavigationState: () => undefined,
  useRouter: () => ({ push: mocks.routerPush }) }))

const tokensProxy = new Proxy({}, { get: () => '#111111' }) as Record<string, string>
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createTokensV2: () => tokensProxy, tintFromPrimary: () => '#222222' }
})

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: React.PropsWithChildren<{ edges?: readonly string[] }>) =>
    React.createElement('SafeAreaView', props, props.children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
vi.mock('@/components/ui/offline-unavailable-state', () => ({
  OfflineUnavailableState: () => React.createElement('OfflineUnavailableState'),
}))

async function renderScreen() {
  let tree: { root: TestNode; update: (element: React.ReactElement) => void; unmount: () => void } | undefined
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(withFocusProvenance(<SupportScreen />))
    await Promise.resolve()
    await Promise.resolve()
  })
  return tree!
}

function findInputByLabel(root: TestNode, label: string) {
  return root.findAll(
    (node) =>
      node.props.accessibilityLabel === label && typeof node.props.onChangeText === 'function',
  )[0]
}

function findReplyEmail(root: TestNode) {
  return root.findAll((node) => node.type === Pressable && String(node.props.accessibilityLabel).startsWith('profile.support.email'))[0]
}

function findSendButton(root: TestNode) {
  return root.findAll(
    (node) => node.props.testID === 'button-primary-md',
  )[0]
}

function findSubjectChoices(root: TestNode) {
  return root.findAll(
    (node) => node.type === Pressable && node.props.accessibilityRole === 'radio',
  )
}

async function selectSubject(root: TestNode, index = 0) {
  await TestRenderer.act(async () => {
    ;(findSubjectChoices(root)[index]!.props.onPress as () => void)()
    await Promise.resolve()
  })
}

function sentRequestBody() {
  const request = mocks.apiClient.mock.calls[0]?.[1] as { body: string } | undefined
  if (!request) throw new Error('Expected a support request')
  return JSON.parse(request.body) as Record<string, unknown>
}

describe('SupportScreen', () => {
  for (const messages of [ptBR, en]) {
  }

  beforeEach(() => {
    vi.clearAllMocks()
    __resetTestHostConfig()
    __setTouchMode(false)
    __setFocusImpl((props) => mocks.focusSubject(props.accessibilityLabel))
    mocks.isOnline = true
    mocks.profile = createMockProfile()
    mocks.getItem.mockResolvedValue(null)
    mocks.setItem.mockResolvedValue(undefined)
    mocks.removeItem.mockResolvedValue(undefined)
    mocks.apiClient.mockResolvedValue(undefined)
    mocks.nativeVersion = null
    mocks.expoVersion = '1.1.4'
    mocks.translations.clear()
  })

  it('does not render an editable name field', async () => {
    const tree = await renderScreen()
    expect(findInputByLabel(tree.root, 'profile.support.name')).toBeUndefined()
  })

  it('discards a corrupted draft', async () => {
    mocks.getItem.mockResolvedValue('{ not json')
    await renderScreen()
    expect(mocks.removeItem).toHaveBeenCalledWith('orbit-support-draft')
  })

  it('uses the truthful offline reason from the app i18n instance', async () => {
    await i18n.changeLanguage('pt-BR')
    expect(i18n.t('profile.support.offlineReason')).toBe(
      'Sem conexão. O que você escreveu fica guardado neste aparelho, então você pode enviar quando a conexão voltar.',
    )
    await i18n.changeLanguage('en')
  })
})
