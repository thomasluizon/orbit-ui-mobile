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

  describe('the guided support draft and send', () => {
    type Host = TestNode & { children: unknown[] }
    const hostsOf = (tree: { root: TestNode }) => tree.root.findAll((node) => typeof node.type === 'string') as Host[]
    const textOf = (node: Host): string => node.children.map((child) => typeof child === 'string' ? child : textOf(child as Host)).join('')
    const buttonNamed = (tree: { root: TestNode }, label: string) => hostsOf(tree).find((node) => node.props.accessibilityRole === 'button' && (node.props.accessibilityLabel === label || textOf(node) === label))
    const messageInput = (tree: { root: TestNode }) => findInputByLabel(tree.root, 'profile.support.message')
    const option = (subject: string) => `profile.support.subjects.${subject}.option`

    async function press(tree: { root: TestNode }, label: string) {
      const target = buttonNamed(tree, label)
      if (!target) throw new Error(`No button ${label}`)
      await TestRenderer.act(async () => {
        ;(target.props.onPress as () => void)()
        await Promise.resolve()
        await Promise.resolve()
      })
    }
    async function type(tree: { root: TestNode }, value: string) {
      await TestRenderer.act(async () => {
        ;(messageInput(tree)!.props.onChangeText as (text: string) => void)(value)
        await Promise.resolve()
      })
    }
    const selectedOptions = (tree: { root: TestNode }) => ['problem', 'billing', 'account', 'other'].filter((subject) => (buttonNamed(tree, option(subject))!.props.accessibilityState as { selected: boolean }).selected)

    it('hydrates the flow from a persisted draft and opens at the message with the subject kept', async () => {
      mocks.getItem.mockResolvedValue(JSON.stringify({ subject: 'billing', message: 'It broke' }))
      const tree = await renderScreen()
      expect(messageInput(tree)!.props.value).toBe('It broke')
      await press(tree, 'common.back')
      expect(selectedOptions(tree)).toEqual(['billing'])
    })

    it('maps a legacy free-text draft to the catch-all subject without losing the message', async () => {
      mocks.getItem.mockResolvedValue(JSON.stringify({ subject: 'Old subject', message: 'Saved message' }))
      const tree = await renderScreen()
      expect(messageInput(tree)!.props.value).toBe('Saved message')
      await press(tree, 'common.back')
      expect(selectedOptions(tree)).toEqual(['other'])
    })

    it('starts at the subject when the persisted draft has none', async () => {
      mocks.getItem.mockResolvedValue(JSON.stringify({ subject: null, message: 'Saved message' }))
      const tree = await renderScreen()
      expect(messageInput(tree)).toBeUndefined()
      expect(selectedOptions(tree)).toEqual([])
    })

    it('persists the subject and the message on every change', async () => {
      const tree = await renderScreen()
      await press(tree, option('problem'))
      expect(mocks.setItem).toHaveBeenCalledWith('orbit-support-draft', JSON.stringify({ subject: 'problem', message: '' }))
      await type(tree, 'Draft')
      expect(mocks.setItem).toHaveBeenLastCalledWith('orbit-support-draft', JSON.stringify({ subject: 'problem', message: 'Draft' }))
      await type(tree, '')
      expect(mocks.setItem).toHaveBeenLastCalledWith('orbit-support-draft', JSON.stringify({ subject: 'problem', message: '' }))
    })

    it('accepts the API message length boundary and attaches the version', async () => {
      const tree = await renderScreen()
      const message = 'm'.repeat(4987)
      await press(tree, option('problem'))
      expect(hostsOf(tree).some((node) => node.props.children === 'profile.support.versionIncluded({"version":"1.1.4"})')).toBe(true)
      expect(messageInput(tree)!.props.maxLength).toBe(4987)
      await type(tree, message)
      await press(tree, 'profile.support.send')

      expect(sentRequestBody()).toMatchObject({ subject: 'profile.support.subjects.problem.label', message: `${message}\n\nOrbit 1.1.4` })
    })

    it('attaches the installed Android version used by About', async () => {
      mocks.nativeVersion = '2.3.1'
      const tree = await renderScreen()
      await press(tree, option('problem'))
      await type(tree, 'Message')
      await press(tree, 'profile.support.send')
      expect(sentRequestBody().message).toBe(`Message\n\nOrbit ${getAppVersion()}`)
    })

    it('reserves no room and sends no suffix when the app version is absent', async () => {
      mocks.expoVersion = undefined
      const tree = await renderScreen()
      const message = 'm'.repeat(5000)
      await press(tree, option('problem'))
      expect(hostsOf(tree).some((node) => typeof node.props.children === 'string' && node.props.children.startsWith('profile.support.versionIncluded'))).toBe(false)
      expect(messageInput(tree)!.props.maxLength).toBe(5000)
      await type(tree, message)
      await press(tree, 'profile.support.send')

      expect(sentRequestBody().message).toBe(message)
    })

    it('keeps an oversized restored draft and refuses to send it', async () => {
      await i18n.changeLanguage('en')
      const message = 'm'.repeat(5000)
      mocks.getItem.mockResolvedValue(JSON.stringify({ subject: 'problem', message }))
      const tree = await renderScreen()

      expect(messageInput(tree)!.props.value).toBe(message)
      expect(messageInput(tree)!.props.maxLength).toBe(5000)
      await press(tree, 'profile.support.send')
      expect(mocks.apiClient).not.toHaveBeenCalled()
      expect(messageInput(tree)!.props.value).toBe(message)
    })

    it('sends the contact details of the profile that loads after the first render', async () => {
      mocks.profile = null
      const tree = await renderScreen()
      await press(tree, option('problem'))
      await type(tree, 'Message')

      mocks.profile = { ...createMockProfile(), name: 'Profile User', email: 'profile@example.com' }
      await TestRenderer.act(async () => {
        tree.update(withFocusProvenance(<SupportScreen />))
        await Promise.resolve()
      })
      await press(tree, 'profile.support.send')
      expect(sentRequestBody()).toMatchObject({ name: 'Profile User', email: 'profile@example.com' })
    })

    it('clears the stored draft after a send and shows the result dialog', async () => {
      const tree = await renderScreen()
      await press(tree, option('account'))
      await type(tree, 'Google button spins forever')
      await press(tree, 'profile.support.send')

      expect(sentRequestBody()).toMatchObject({ subject: 'profile.support.subjects.account.label', message: 'Google button spins forever\n\nOrbit 1.1.4' })
      expect(mocks.removeItem).toHaveBeenCalledWith('orbit-support-draft')
      expect(hostsOf(tree).some((node) => node.props.testID === 'result-dialog')).toBe(true)
    })

    it('keeps the field message and the general server validation visible without losing the draft', async () => {
      mocks.apiClient.mockRejectedValue({ errors: { Message: ['Message exceeds 123 characters'], Email: ['Server email failure'] } })
      const tree = await renderScreen()
      await press(tree, option('problem'))
      await type(tree, 'Message body')
      await press(tree, 'profile.support.send')

      const texts = hostsOf(tree).filter((node) => node.type === 'Text').map(textOf)
      expect(texts).toContain('Server email failure')
      expect(messageInput(tree)!.props.value).toBe('Message body')
      expect(JSON.stringify(messageInput(tree)!.props)).toContain('Message exceeds 123 characters')
    })

    it('keeps the draft and announces the failure when the send fails', async () => {
      mocks.apiClient.mockRejectedValue(new Error('boom'))
      const tree = await renderScreen()
      await press(tree, option('problem'))
      await type(tree, 'Message body')
      await press(tree, 'profile.support.send')

      expect(mocks.announceForAccessibility).toHaveBeenCalledWith('profile.support.failureTitle profile.support.failureBody')
      expect(mocks.setItem).toHaveBeenLastCalledWith('orbit-support-draft', JSON.stringify({ subject: 'problem', message: 'Message body' }))
      expect(mocks.removeItem).not.toHaveBeenCalled()
    })

    it('locks the message and the send action while the request runs', async () => {
      let finish!: () => void
      mocks.apiClient.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
      const tree = await renderScreen()
      await press(tree, option('problem'))
      await type(tree, 'Message')
      await press(tree, 'profile.support.send')

      expect(messageInput(tree)!.props.editable).toBe(false)
      expect(buttonNamed(tree, 'profile.support.send')?.props.onPress).toBeUndefined()
      expect(mocks.apiClient).toHaveBeenCalledOnce()
      await TestRenderer.act(async () => { finish(); await Promise.resolve() })
      expect(hostsOf(tree).some((node) => node.props.testID === 'result-dialog')).toBe(true)
    })
  })
})
