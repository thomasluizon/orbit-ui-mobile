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
}))

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
  let tree: { root: TestNode } | undefined
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
    (node) =>
      node.props.accessibilityLabel === 'profile.support.send' &&
      typeof node.props.onPress === 'function',
  )[0]
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

  it('discards a corrupted draft', async () => {
    mocks.getItem.mockResolvedValue('{ not json')
    await renderScreen()
    expect(mocks.removeItem).toHaveBeenCalledWith('orbit-support-draft')
  })

  it('persists a draft as the user types and clears it when empty', async () => {
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
    expect(mocks.removeItem).toHaveBeenCalledWith('orbit-support-draft')
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
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
  })

  it('keeps the send button disabled until both fields are filled', async () => {
    const tree = await renderScreen()
    expect(findSendButton(tree.root)!.props.disabled).toBe(true)
    await TestRenderer.act(async () => {
      ;(findInputByLabel(tree.root, 'profile.support.subject')!.props.onChangeText as (v: string) => void)('Only subject')
      await Promise.resolve()
    })
    expect(findSendButton(tree.root)!.props.disabled).toBe(true)
  })
})
