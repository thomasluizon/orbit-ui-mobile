import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'

import SupportScreen from '@/app/support'

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
  focusInput: vi.fn(),
  announceForAccessibility: vi.fn(),
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
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${JSON.stringify(params)})` : key,
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

function sentRequestBody() {
  const request = mocks.apiClient.mock.calls[0]?.[1] as { body: string } | undefined
  if (!request) throw new Error('Expected a support request')
  return JSON.parse(request.body) as Record<string, unknown>
}

describe('SupportScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isOnline = true
    mocks.profile = createMockProfile()
    mocks.getItem.mockResolvedValue(null)
    mocks.setItem.mockResolvedValue(undefined)
    mocks.removeItem.mockResolvedValue(undefined)
    mocks.apiClient.mockResolvedValue(undefined)
  })

  it('hydrates the form from a persisted draft', async () => {
    mocks.getItem.mockResolvedValue(JSON.stringify({ subject: 'Bug', message: 'It broke' }))
    const tree = await renderScreen()
    expect(findInputByLabel(tree.root, 'profile.support.subject')!.props.value).toBe('Bug')
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

  it('shows the required subject error and focuses the subject', async () => {
    const tree = await renderScreen()
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (value: string) => void)('Message')
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onBlur as () => void)()
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
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onChangeText as (value: string) => void)('Subject')
      await Promise.resolve()
    })
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
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onChangeText as (value: string) => void)('Subject')
      await Promise.resolve()
    })
    expect(findSendButton(tree.root)!.props.disabled).toBe(false)
    expect(findSendButton(tree.root)!.props.accessibilityHint).toBeUndefined()

    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onChangeText as (value: string) => void)('   ')
      await Promise.resolve()
    })
    expect(findSendButton(tree.root)!.props.disabled).toBe(true)
    expect(findSendButton(tree.root)!.props.accessibilityHint).toBe(
      'profile.support.sendNeedsSubject',
    )

    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onChangeText as (value: string) => void)('Subject')
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (value: string) => void)('   ')
      await Promise.resolve()
    })
    expect(findSendButton(tree.root)!.props.disabled).toBe(true)
    expect(findSendButton(tree.root)!.props.accessibilityHint).toBe(
      'profile.support.sendNeedsMessage',
    )
  })

  it('accepts the API subject and message length boundaries', async () => {
    const tree = await renderScreen()
    const subjectInput = findInputByLabel(tree.root, 'profile.support.subject')!
    const messageInput = findInputByLabel(tree.root, 'profile.support.message')!
    const subject = 's'.repeat(200)
    const message = 'm'.repeat(5000)

    expect(subjectInput.props.maxLength).toBe(200)
    expect(messageInput.props.maxLength).toBe(5000)
    await TestRenderer.act(async () => {
      ;(subjectInput.props.onChangeText as (value: string) => void)(subject)
      ;(messageInput.props.onChangeText as (value: string) => void)(message)
      await Promise.resolve()
    })
    await TestRenderer.act(async () => {
      ;(findSendButton(tree.root)!.props.onPress as () => void)()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(sentRequestBody()).toMatchObject({
      subject,
      message,
    })
  })

  it('replaces an email typed while loading with the resolved profile email', async () => {
    mocks.profile = null
    const tree = await renderScreen()

    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.name')!.props.onChangeText as (value: string) => void)('Orbit User')
      ;(findInputByLabel(tree.root, 'profile.support.email')!.props.onChangeText as (value: string) => void)('stale@example.com')
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onChangeText as (value: string) => void)('Subject')
      ;(findInputByLabel(tree.root, 'profile.support.message')!.props.onChangeText as (value: string) => void)('Message')
      await Promise.resolve()
    })
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
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onChangeText as (value: string) => void)('Subject')
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

  it('persists a draft on every keystroke, including when both fields are emptied', async () => {
    const tree = await renderScreen()
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onChangeText as (v: string) => void)('Hello')
      await Promise.resolve()
    })
    expect(mocks.setItem).toHaveBeenCalledWith(
      'orbit-support-draft',
      JSON.stringify({ subject: 'Hello', message: '' }),
    )
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onChangeText as (v: string) => void)('')
      await Promise.resolve()
    })
    expect(mocks.setItem).toHaveBeenLastCalledWith(
      'orbit-support-draft',
      JSON.stringify({ subject: '', message: '' }),
    )
  })

  it('places the existing contact errors beside their system inputs', async () => {
    mocks.profile = null
    const tree = await renderScreen()
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onChangeText as (v: string) => void)('Subject')
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
      tree.root.findAll((node) => node.props.children === 'offline.title').length,
    ).toBeGreaterThan(0)
  })

  it('sends the request, shows success, and clears the draft', async () => {
    const tree = await renderScreen()
    expect(mocks.announceForAccessibility).not.toHaveBeenCalled()
    expect(
      tree.root.findAll((node) => node.props.accessibilityLiveRegion != null),
    ).toHaveLength(0)
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onChangeText as (v: string) => void)('Subject')
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
    expect(mocks.announceForAccessibility).toHaveBeenCalledWith(
      'profile.support.success',
    )
  })

  it('surfaces a friendly error when the request fails', async () => {
    mocks.apiClient.mockRejectedValue(new Error('boom'))
    const tree = await renderScreen()
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onChangeText as (v: string) => void)('Subject')
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
    expect(mocks.setItem).toHaveBeenLastCalledWith(
      'orbit-support-draft',
      JSON.stringify({ subject: 'Subject', message: 'Message body' }),
    )
  })

  it('shows loading and disables the controls while sending', async () => {
    let finishSend: (() => void) | undefined
    mocks.apiClient.mockImplementation(
      () => new Promise<void>((resolve) => { finishSend = resolve }),
    )
    const tree = await renderScreen()
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onChangeText as (v: string) => void)('Subject')
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
    expect(findInputByLabel(tree.root, 'profile.support.subject')!.props.editable).toBe(false)
    expect(findInputByLabel(tree.root, 'profile.support.message')!.props.editable).toBe(false)
    await TestRenderer.act(async () => {
      finishSend?.()
      await Promise.resolve()
      await Promise.resolve()
    })
  })

})
