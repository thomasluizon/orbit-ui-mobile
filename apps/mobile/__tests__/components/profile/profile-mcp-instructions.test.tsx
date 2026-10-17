import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { Pressable, Text } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { buildMcpConfigJson, getMcpEndpointUrl } from '@orbit/shared/utils/advanced-settings'
import { API_BASE } from '@/lib/api-base'
import { ProfileApiKeys } from '@/components/profile/profile-api-keys'

const mocks = vi.hoisted(() => ({ create: vi.fn(), clipboard: '' }))

const TestRenderer = require('react-test-renderer')

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: { setString: vi.fn((content: string) => { mocks.clipboard = content }), getString: vi.fn(() => Promise.resolve(mocks.clipboard)) } }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('@/app/advanced-api-keys', () => ({
  useApiKeyManagement: () => ({
    apiKeysQuery: { isLoading: false, error: null, refetch: vi.fn() },
    apiKeys: [],
    canCreateKey: true,
    createGrantAvailable: true,
    createKeyError: null,
    clearCreateKeyError: vi.fn(),
    revokingKeyId: null,
    setRevokingKeyId: vi.fn(),
    revokeKeyMutation: { mutate: vi.fn(), isPending: false },
    handleCreateKey: mocks.create,
  }),
}))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => null }))
vi.mock('@/components/ui/pro-badge', () => ({ ProBadge: () => null }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))


let tree: ReturnType<typeof TestRenderer.create>
afterEach(() => { TestRenderer.act(() => tree?.unmount()); vi.clearAllMocks() })

function renderKeys(hasProAccess = true, unlocked = true) {
  TestRenderer.act(() => { tree = TestRenderer.create(<ProfileApiKeys profile={createMockProfile({ hasProAccess })} unlocked={unlocked} />) })
}

function button(label: string) {
  const match = tree.root.findAllByType(Pressable).find((node: { props: { accessibilityLabel?: string }; findAllByType: (type: typeof Text) => { props: { children: string } }[] }) =>
    node.props.accessibilityLabel === label || node.findAllByType(Text).some((text) => text.props.children === label))
  expect(match, `Missing button: ${label}`).toBeDefined()
  return match!
}

function textValues(): string[] {
  return tree.root.findAllByType(Text).map((node: { props: { children: string } }) => node.props.children)
}

it('reaches the production code-client configuration and copies its JSON', async () => {
  renderKeys()
  TestRenderer.act(() => button('orbitMcp.claudeCode').props.onPress())
  const configuration = buildMcpConfigJson(getMcpEndpointUrl(API_BASE))
  expect(textValues()).toContain('orbitMcp.configInstructions')
  expect(textValues()).toContain('orbitMcp.replaceKey')
  expect(textValues()).toContain(configuration)
  await TestRenderer.act(async () => { await button('orbitMcp.copyConfig').props.onPress() })
  expect(Clipboard.setString).toHaveBeenCalledExactlyOnceWith(configuration)
  expect(JSON.parse(mocks.clipboard)).toEqual({
    mcpServers: {
      orbit: {
        type: 'http',
        url: getMcpEndpointUrl(API_BASE),
        headers: { Authorization: 'Bearer YOUR_API_KEY' },
      },
    },
  })
  expect(textValues()).toContain('orbitMcp.copied')
  TestRenderer.act(() => button('orbitMcp.claudeWeb').props.onPress())
  expect(textValues()).toContain(getMcpEndpointUrl(API_BASE))
  expect(textValues()).not.toContain('orbitMcp.replaceKey')
  TestRenderer.act(() => button('orbitMcp.claudeCode').props.onPress())
  expect(button('orbitMcp.copyConfig').props.disabled).toBe(false)
  expect(textValues()).not.toContain('orbitMcp.copied')
})

it('shows a recoverable clipboard failure and permits a retry', async () => {
  vi.mocked(Clipboard.setString).mockImplementationOnce(() => { throw new Error('clipboard unavailable') })
  renderKeys()
  TestRenderer.act(() => button('orbitMcp.claudeCode').props.onPress())
  await TestRenderer.act(async () => { await button('orbitMcp.copyConfig').props.onPress() })
  expect(textValues()).toContain('orbitMcp.configCopyError')
  expect(textValues()).not.toContain('orbitMcp.copied')
  await TestRenderer.act(async () => { await button('orbitMcp.copyConfig').props.onPress() })
  expect(textValues()).toContain('orbitMcp.copied')
  expect(textValues()).not.toContain('orbitMcp.configCopyError')
})

it.each([[false, false], [true, false]])('keeps configuration behind the existing access gate (%s, %s)', (hasProAccess, unlocked) => {
  renderKeys(hasProAccess, unlocked)
  expect(textValues()).not.toContain('orbitMcp.claudeCode')
  expect(tree.root.findAllByType(Pressable).some((node: { props: { accessibilityLabel?: string } }) => node.props.accessibilityLabel === 'orbitMcp.copyConfig')).toBe(false)
})

it('disables copying until Android confirms the clipboard content', async () => {
  let confirmCopy!: (content: string) => void
  vi.mocked(Clipboard.getString).mockImplementationOnce(() => new Promise((resolve) => { confirmCopy = resolve }))
  renderKeys()
  TestRenderer.act(() => button('orbitMcp.claudeCode').props.onPress())
  TestRenderer.act(() => button('orbitMcp.copyConfig').props.onPress())
  expect(button('orbitMcp.copyConfig').props.disabled).toBe(true)
  expect(button('orbitMcp.copyConfig').props.onPress).toBeUndefined()
  await TestRenderer.act(async () => { confirmCopy(mocks.clipboard); await Promise.resolve() })
  expect(button('orbitMcp.copyConfig').props.disabled).toBe(false)
})

it('reports an unsuccessful native write instead of showing a false confirmation', async () => {
  vi.mocked(Clipboard.getString).mockResolvedValueOnce('previous clipboard content')
  renderKeys()
  TestRenderer.act(() => button('orbitMcp.claudeCode').props.onPress())
  await TestRenderer.act(async () => { await button('orbitMcp.copyConfig').props.onPress() })
  expect(textValues()).toContain('orbitMcp.configCopyError')
  expect(textValues()).not.toContain('orbitMcp.copied')
})


it('keeps the Web guide reachable after visiting Code', () => {
  renderKeys()
  TestRenderer.act(() => button('orbitMcp.claudeCode').props.onPress())
  expect(textValues()).not.toContain('orbitMcp.connectionInstructions')
  TestRenderer.act(() => button('orbitMcp.claudeWeb').props.onPress())
  TestRenderer.act(() => button('orbitMcp.connectionInstructions').props.onPress())
  for (const step of ['webInstructions', 'webStep1', 'webStep2', 'webStep3', 'webStep4', 'webNoApiKey']) {
    expect(textValues()).toContain(`orbitMcp.${step}`)
  }
  expect(button('orbitMcp.copy').props.disabled).toBe(false)
  TestRenderer.act(() => button('orbitMcp.done').props.onPress())
  expect(textValues()).not.toContain('orbitMcp.webStep1')
  TestRenderer.act(() => button('orbitMcp.claudeCode').props.onPress())
  expect(textValues()).toContain(buildMcpConfigJson(getMcpEndpointUrl(API_BASE)))
})
