import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { Pressable, Text, View } from 'react-native'

import SupportScreen from '@/app/support'
import { i18n } from '@/lib/i18n'
import {
  __resetTestHostConfig,
  __setFocusImpl,
} from '../../test-mocks/react-native'

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
  announceForAccessibility: vi.fn(),
  expoVersion: new Map<string, string>().get('version'),
  translations: new Map<string, string>(),
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
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.routerPush }) }))

const tokensProxy = new Proxy({}, { get: () => '#111111' }) as Record<string, string>
vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }),
}))
vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createTokensV2: () => tokensProxy, tintFromPrimary: () => '#222222' }
})

vi.mock('@/components/ui/app-bar', () => ({ AppBar: () => null }))
vi.mock('@/components/ui/offline-unavailable-state', () => ({
  OfflineUnavailableState: () => React.createElement('OfflineUnavailableState'),
}))

async function renderScreen() {
  let tree: { root: TestNode; update: (element: React.ReactElement) => void } | undefined
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<SupportScreen />)
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
  beforeEach(() => {
    vi.clearAllMocks()
    __resetTestHostConfig()
    mocks.isOnline = true
    mocks.profile = createMockProfile()
    mocks.getItem.mockResolvedValue(null)
    mocks.setItem.mockResolvedValue(undefined)
    mocks.removeItem.mockResolvedValue(undefined)
    mocks.apiClient.mockResolvedValue(undefined)
    mocks.expoVersion = '1.1.4'
    mocks.translations.clear()
  })

  it('hydrates the form from a persisted draft', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify({ subject: 'Bug', message: 'It broke' }))
    const tree = await renderScreen()
    expect(
      (findSubjectChoices(tree.root)[3]!.props.accessibilityState as { checked: boolean }).checked,
    ).toBe(true)
    expect(findInputByLabel(tree.root, 'profile.support.message')!.props.value).toBe('It broke')
  })

  it('uses the system inputs, including a six-row message and the disabled account email', async () => {
    const tree = await renderScreen()

    expect(
      tree.root.findAll((node) => node.props['data-multiline'] === '').length,
    ).toBeGreaterThan(0)
    expect(findInputByLabel(tree.root, 'profile.support.message')!.props.numberOfLines).toBe(6)
    expect(findInputByLabel(tree.root, 'profile.support.name')!.props.value).toBe('Thomas')
    expect(findInputByLabel(tree.root, 'profile.support.email')!.props.value).toBe(
      'thomas@example.com',
    )
    expect(findInputByLabel(tree.root, 'profile.support.email')!.props.editable).toBe(false)
    expect(
      findInputByLabel(tree.root, 'profile.support.email')!.props.accessibilityHint,
    ).toBe('profile.support.emailLockedReason')
    expect(
      tree.root.findAll(
        (node) => node.props.children === 'profile.support.emailLockedReason',
      ),
    ).not.toHaveLength(0)
  })

  it('renders four subject choices and sends the selected wording', async () => {
    await i18n.changeLanguage('en')
    const problemLabel = i18n.t('profile.support.subjects.problem.label')
    mocks.translations.set('profile.support.subjects.problem.label', problemLabel)
    const tree = await renderScreen()
    const choices = findSubjectChoices(tree.root)
    expect(choices).toHaveLength(4)
    expect(
      tree.root.findAll(
        (node) => node.props.children === 'profile.support.subjects.problem.description',
      ),
    ).not.toHaveLength(0)

    await TestRenderer.act(async () => {
      ;(choices[0]!.props.onPress as () => void)()
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (value: string) => void)('The log disappeared')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      ;(findSendButton(tree.root)!.props.onPress as () => void)()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sentRequestBody()).toMatchObject({
      subject: problemLabel,
      message: 'The log disappeared\n\nOrbit 1.1.4',
    })
  })

  it('uses Android focus traversal and press selection for subject choices', async () => {
    const tree = await renderScreen()
    let choices = findSubjectChoices(tree.root)
    expect(choices).toHaveLength(4)
    expect(choices.map((choice) => choice.findAll(
      (node) => typeof node.props.children === 'string',
    )[0]?.props.children)).toEqual([
      'profile.support.subjects.problem.label',
      'profile.support.subjects.billing.label',
      'profile.support.subjects.account.label',
      'profile.support.subjects.other.label',
    ])
    expect(choices.map((choice) => choice.props.accessibilityRole)).toEqual([
      'radio',
      'radio',
      'radio',
      'radio',
    ])
    expect(choices.map((choice) => choice.props.focusable)).toEqual([true, true, true, true])
    expect(choices.every((choice) => choice.props.onKeyDown === undefined)).toBe(true)
    expect(choices.map((choice) => (
      choice.props.accessibilityState as { checked: boolean }
    ).checked)).toEqual([false, false, false, false])

    await TestRenderer.act(async () => {
      ;(choices[1]!.props.onPress as () => void)()
      await Promise.resolve()
    })
    choices = findSubjectChoices(tree.root)
    expect((choices[1]!.props.accessibilityState as { checked: boolean }).checked).toBe(true)
  })

  it('redirects subject entry to the checked row without changing the value', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify({ subject: 'billing', message: '' }))
    const focusedStates: unknown[] = []
    __setFocusImpl((props) => focusedStates.push(props.accessibilityState))
    const tree = await renderScreen()
    const choices = findSubjectChoices(tree.root)

    await TestRenderer.act(async () => {
      ;(choices[0]!.props.onFocus as () => void)()
      await Promise.resolve()
    })

    expect(focusedStates).toEqual([{ checked: true }])
    expect(findSubjectChoices(tree.root).map((choice) => (
      choice.props.accessibilityState as { checked: boolean }
    ).checked)).toEqual([false, true, false, false])
  })

  it('selects a subject when focus moves within the group', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify({ subject: 'billing', message: '' }))
    const tree = await renderScreen()
    const choices = findSubjectChoices(tree.root)

    await TestRenderer.act(async () => {
      ;(choices[1]!.props.onFocus as () => void)()
      ;(choices[2]!.props.onFocus as () => void)()
      await Promise.resolve()
    })

    expect((findSubjectChoices(tree.root)[2]!.props.accessibilityState as {
      checked: boolean
    }).checked).toBe(true)
  })

  it('does not show the locked email reason when the account email is editable', async () => {
    mocks.profile = null
    const tree = await renderScreen()

    expect(findInputByLabel(tree.root, 'profile.support.email')!.props.editable).toBe(true)
    expect(
      findInputByLabel(tree.root, 'profile.support.email')!.props.accessibilityHint,
    ).toBeUndefined()
    expect(
      tree.root.findAll(
        (node) => node.props.children === 'profile.support.emailLockedReason',
      ),
    ).toHaveLength(0)
  })

  it('shows the required subject error beside the picker', async () => {
    const tree = await renderScreen()
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (value: string) => void)('Message')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      const group = tree.root.findAll(
        (node) => node.props.accessibilityRole === 'radiogroup',
      )[0]!
      ;(group.props.onBlur as () => void)()
      await Promise.resolve()
    })

    expect(
      tree.root.findAll((node) => node.props.children === 'profile.support.subjectRequired'),
    ).not.toHaveLength(0)
    expect(findSendButton(tree.root)!.props.disabled).toBe(true)
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('shows the required message error and focuses the message', async () => {
    const tree = await renderScreen()
    await selectSubject(tree.root)
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onBlur as () => void)()
      await Promise.resolve()
    })

    expect(
      tree.root.findAll((node) => node.props.children === 'profile.support.messageRequired'),
    ).not.toHaveLength(0)
    expect(findSendButton(tree.root)!.props.disabled).toBe(true)
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('keeps Send disabled with an announced reason until subject and message are filled', async () => {
    const tree = await renderScreen()
    expect(findSendButton(tree.root)!.props.disabled).toBe(true)
    expect(findSendButton(tree.root)!.props.accessibilityHint).toBe(
      'profile.support.sendIncomplete',
    )

    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (value: string) => void)('Message')
      await Promise.resolve()
    })
    expect(findSendButton(tree.root)!.props.accessibilityHint).toBe(
      'profile.support.sendNeedsSubject',
    )
    await selectSubject(tree.root)
    expect(findSendButton(tree.root)!.props.disabled).toBe(false)
    expect(findSendButton(tree.root)!.props.accessibilityHint).toBeUndefined()

    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (value: string) => void)('   ')
      await Promise.resolve()
    })
    expect(findSendButton(tree.root)!.props.disabled).toBe(true)
    expect(findSendButton(tree.root)!.props.accessibilityHint).toBe(
      'profile.support.sendNeedsMessage',
    )
  })

  it('accepts the API message length boundary', async () => {
    const tree = await renderScreen()
    const messageInput = findInputByLabel(tree.root, 'profile.support.message')!
    const message = 'm'.repeat(4987)

    expect(messageInput.props.maxLength).toBe(4987)
    expect(
      tree.root.findAll(
        (node) => node.props.children === 'profile.support.versionIncluded({"version":"1.1.4"})',
      ),
    ).not.toHaveLength(0)
    await selectSubject(tree.root)
    await TestRenderer.act(async () => {
      ;(messageInput.props.onChangeText as (value: string) => void)(message)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      ;(findSendButton(tree.root)!.props.onPress as () => void)()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sentRequestBody()).toMatchObject({
      subject: 'profile.support.subjects.problem.label',
      message: `${message}\n\nOrbit 1.1.4`,
    })
  })

  it('keeps an oversized restored draft and refuses to send it', async () => {
    await i18n.changeLanguage('en')
    const message = 'm'.repeat(5000)
    const overLimit = i18n.t('profile.support.messageOverLimit', { overage: 13 })
    const sendReason = i18n.t('profile.support.sendNeedsShorterMessage')
    mocks.translations.set('profile.support.messageOverLimit', overLimit)
    mocks.translations.set('profile.support.sendNeedsShorterMessage', sendReason)
    mocks.getItem.mockResolvedValue(JSON.stringify({ subject: 'problem', message }))

    const tree = await renderScreen()
    const messageInput = findInputByLabel(tree.root, 'profile.support.message')!
    expect(messageInput.props.value).toBe(message)
    expect(messageInput.props.maxLength).toBe(5000)
    expect(messageInput.props.accessibilityHint).toBe(overLimit)
    expect(findSendButton(tree.root)!.props.disabled).toBe(true)
    expect(findSendButton(tree.root)!.props.accessibilityHint).toBe(sendReason)

    await TestRenderer.act(async () => {
      ;(findSendButton(tree.root)!.props.onPress as () => void)()
      await Promise.resolve()
    })
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('reserves no room and sends no suffix when the app version is absent', async () => {
    mocks.expoVersion = undefined
    const tree = await renderScreen()
    const messageInput = findInputByLabel(tree.root, 'profile.support.message')!
    const message = 'm'.repeat(5000)

    expect(messageInput.props.maxLength).toBe(5000)
    expect(
      tree.root.findAll((node) =>
        typeof node.props.children === 'string'
        && node.props.children.startsWith('profile.support.versionIncluded'),
      ),
    ).toHaveLength(0)
    await selectSubject(tree.root)
    await TestRenderer.act(async () => {
      ;(messageInput.props.onChangeText as (value: string) => void)(message)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      ;(findSendButton(tree.root)!.props.onPress as () => void)()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sentRequestBody().message).toBe(message)
  })

  it('replaces an email typed while loading with the resolved profile email', async () => {
    mocks.profile = null
    const tree = await renderScreen()

    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.name')!.props.onChangeText as (value: string) => void)('Orbit User')
      ;(findInputByLabel(tree.root, 'profile.support.email')!.props.onChangeText as (value: string) => void)('stale@example.com')
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (value: string) => void)('Message')
      await Promise.resolve()
    })
    await selectSubject(tree.root)
    mocks.profile = { ...createMockProfile(), email: 'profile@example.com' }
    await TestRenderer.act(async () => {
      tree.update(<SupportScreen />)
      await Promise.resolve()
    })

    expect(findInputByLabel(tree.root, 'profile.support.email')!.props.value).toBe(
      'profile@example.com',
    )
    expect(findInputByLabel(tree.root, 'profile.support.email')!.props.editable).toBe(false)
    await TestRenderer.act(async () => {
      ;(findSendButton(tree.root)!.props.onPress as () => void)()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(sentRequestBody().email).toBe(
      'profile@example.com',
    )
  })

  it('clears stale account errors when profile hydration supplies valid values', async () => {
    mocks.profile = null
    const tree = await renderScreen()
    await selectSubject(tree.root)
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (value: string) => void)('Message')
      await Promise.resolve()
      ;(findSendButton(tree.root)!.props.onPress as () => void)()
      await Promise.resolve()
    })
    expect(tree.root.findAll((node) => node.props.children === 'profile.support.nameRequired')).not.toHaveLength(0)
    expect(tree.root.findAll((node) => node.props.children === 'profile.support.emailRequired')).not.toHaveLength(0)

    mocks.profile = createMockProfile()
    await TestRenderer.act(async () => {
      tree.update(<SupportScreen />)
      await Promise.resolve()
    })
    expect(tree.root.findAll((node) => node.props.children === 'profile.support.nameRequired')).toHaveLength(0)
    expect(tree.root.findAll((node) => node.props.children === 'profile.support.emailRequired')).toHaveLength(0)
  })

  it('discards a corrupted draft', async () => {
    mocks.getItem.mockResolvedValue('{ not json')
    await renderScreen()
    expect(mocks.removeItem).toHaveBeenCalledWith('orbit-support-draft')
  })

  it('persists the picker selection and message on every change', async () => {
    const tree = await renderScreen()
    await selectSubject(tree.root)
    expect(mocks.setItem).toHaveBeenCalledWith(
      'orbit-support-draft',
      JSON.stringify({ subject: 'problem', message: '' }),
    )
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (v: string) => void)('Draft')
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (v: string) => void)('')
      await Promise.resolve()
    })
    expect(mocks.setItem).toHaveBeenLastCalledWith(
      'orbit-support-draft',
      JSON.stringify({ subject: 'problem', message: '' }),
    )
  })

  it('places the existing contact errors beside their system inputs', async () => {
    mocks.profile = null
    const tree = await renderScreen()
    await selectSubject(tree.root)
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (v: string) => void)('Message')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      ;(findSendButton(tree.root)!.props.onPress as () => void)()
      await Promise.resolve()
    })

    expect(tree.root.findAll((node) => node.props.children === 'profile.support.nameRequired').length).toBeGreaterThan(0)
    expect(tree.root.findAll((node) => node.props.children === 'profile.support.emailRequired').length).toBeGreaterThan(0)
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.name')!.props.onChangeText as (v: string) => void)('Orbit User')
      ;(findInputByLabel(tree.root, 'profile.support.email')!.props.onChangeText as (v: string) => void)('invalid')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      ;(findSendButton(tree.root)!.props.onPress as () => void)()
      await Promise.resolve()
    })
    expect(tree.root.findAll((node) => node.props.children === 'profile.support.emailInvalid').length).toBeGreaterThan(0)
    expect(mocks.apiClient).not.toHaveBeenCalled()
  })

  it('blocks sending while offline and surfaces the offline message', async () => {
    mocks.isOnline = false
    const tree = await renderScreen()
    await TestRenderer.act(async () => {
      ;(findSendButton(tree.root)!.props.onPress as () => void)()
      await Promise.resolve()
    })
    expect(mocks.apiClient).not.toHaveBeenCalled()
    expect(
      tree.root.findAll((node) => node.props.children === 'profile.support.offlineReason'),
    ).not.toHaveLength(0)
    expect(findSendButton(tree.root)!.props.disabled).toBe(true)
    expect(findSendButton(tree.root)!.props.accessibilityHint).toBe(
      'profile.support.offlineReason',
    )
  })

  it('uses the truthful offline reason from the app i18n instance', async () => {
    await i18n.changeLanguage('pt-BR')
    expect(i18n.t('profile.support.offlineReason')).toBe(
      'Sem conexão. O que você escreveu fica guardado neste aparelho, então você pode enviar quando a conexão voltar.',
    )
    await i18n.changeLanguage('en')
  })

  it('sends the request, shows success, and clears the draft', async () => {
    const tree = await renderScreen()
    expect(mocks.announceForAccessibility).not.toHaveBeenCalled()
    expect(
      tree.root.findAll((node) => node.props.accessibilityLiveRegion != null),
    ).toHaveLength(0)
    await selectSubject(tree.root)
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (v: string) => void)('Message body')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      ;(findSendButton(tree.root)!.props.onPress as () => void)()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    expect(mocks.removeItem).toHaveBeenCalledWith('orbit-support-draft')
    expect(
      tree.root.findAll((node) => node.props.children === 'profile.support.success').length,
    ).toBeGreaterThan(0)
    expect(
      tree.root.findAll(
        (node) => node.type === Text
          && node.props.accessibilityRole === 'header'
          && node.props.children === 'profile.support.success',
      ),
    ).toHaveLength(1)
    expect(
      tree.root.findAll(
        (node) => node.type === Text
          && node.props.children === 'profile.support.successHint({"email":"thomas@example.com"})',
      ),
    ).toHaveLength(1)
    expect(
      tree.root.findAll(
        (node) => node.type === Text
          && node.props.children === 'profile.support.backToAbout',
      ),
    ).toHaveLength(1)
    const backButton = tree.root.findAll(
      (node) => node.props.testID === 'button-ghost-md',
    )[0]!
    await TestRenderer.act(async () => {
      ;(backButton.props.onPress as () => void)()
      await Promise.resolve()
    })
    expect(mocks.routerPush).toHaveBeenCalledWith('/about')
    expect(mocks.announceForAccessibility).toHaveBeenCalledWith(
      'profile.support.success',
    )
  })

  it('surfaces a friendly error when the request fails', async () => {
    mocks.apiClient.mockRejectedValue(new Error('boom'))
    const tree = await renderScreen()
    await selectSubject(tree.root)
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (v: string) => void)('Message body')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      ;(findSendButton(tree.root)!.props.onPress as () => void)()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(
      tree.root.findAll((node) => node.props.children === 'profile.support.success'),
    ).toHaveLength(0)
    expect(mocks.announceForAccessibility).not.toHaveBeenCalled()
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    expect(
      tree.root.findAll((node) => node.props.children === 'profile.support.failureTitle'),
    ).not.toHaveLength(0)
    expect(
      tree.root.findAll(
        (node) => node.type === Text && node.props.children === 'profile.support.retry',
      ),
    ).toHaveLength(1)
    expect(mocks.setItem).toHaveBeenLastCalledWith(
      'orbit-support-draft',
      JSON.stringify({ subject: 'problem', message: 'Message body' }),
    )
  })

  it('shows loading and disables the controls while sending', async () => {
    let finishSend: (() => void) | undefined
    mocks.apiClient.mockImplementation(
      () => new Promise<void>((resolve) => { finishSend = resolve }),
    )
    const tree = await renderScreen()
    await selectSubject(tree.root)
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (v: string) => void)('Message')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      ;(findSendButton(tree.root)!.props.onPress as () => void)()
      await Promise.resolve()
    })

    expect(
      (findSendButton(tree.root)!.props.accessibilityState as { busy?: boolean }).busy,
    ).toBe(true)
    const choices = tree.root.findAll(
      (node) => node.type === View && node.props.accessibilityRole === 'radio',
    )
    expect(choices).toHaveLength(4)
    expect(
      choices.every((choice) =>
        (choice.props.accessibilityState as { disabled?: boolean }).disabled === true),
    ).toBe(true)
    expect(choices.every((choice) => choice.props.onPress === undefined)).toBe(true)
    expect(choices.every((choice) => choice.props.focusable === false)).toBe(true)
    expect(
      (choices[0]!.props.accessibilityState as { checked: boolean }).checked,
    ).toBe(true)
    expect(
      (choices[1]!.props.accessibilityState as { checked: boolean }).checked,
    ).toBe(false)
    expect(findInputByLabel(tree.root, 'profile.support.message')!.props.editable).toBe(false)
    await TestRenderer.act(async () => {
      finishSend?.()
      await Promise.resolve()
      await Promise.resolve()
    })
  })

})
